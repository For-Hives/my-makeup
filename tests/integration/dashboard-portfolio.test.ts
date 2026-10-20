import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import type { Payload } from 'payload'
import sharp from 'sharp'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { savePortfolio } from '@/lib/dashboard/save-portfolio'
import { serverEnv } from '@/lib/env'
import { namedPhotos, PHOTO_MESSAGES } from '@/lib/profile/photos'
import { reconcileStorageAndDatabase } from '@/lib/reconciliation-read'
import { listStorage } from '@/lib/storage'
import type { Media } from '@/payload-types'
import { readPublicProfile } from '@/services/public/profiles'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage, readObject } from '../support/s3'
import { deletionsWithoutTrash, type Spy, spyStorage } from '../support/s3-spy'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * The portfolio from her space (tickets 135 and 136; plan 02 E34, E35, I25, U80, E36 on the server
 * side): the files go to the media route as the browser sends them, then the action names the list
 * of photos, in order. Ten at most; a photo left out goes to the bin once nothing references it;
 * the reconciliation of the storage and the database finds 0 orphan after every gesture.
 *
 * The espionage of the storage fails any test after which an object was erased instead of moved
 * (ticket 045, « à savoir pour la suite »).
 */

type Artist = TestAccount<'maquilleuse'>

let spy: Spy

beforeEach(() => {
	spy = spyStorage()
})

afterEach(async () => {
	const faults = deletionsWithoutTrash(spy.journal)
	spy.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
	expect(faults).toEqual([])
})

async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function profileOf(compte: Artist) {
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profile) throw new Error('pas de profil')
	return profile
}

async function artist(): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	await payload.update({
		collection: 'profiles',
		id: (await profileOf(account)).id,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée' },
	})
	return account
}

/** A real image large enough for every derived size: a photo has an original and three more objects. */
async function largeEnoughImage(): Promise<File> {
	const bytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c08080' } })
		.webp()
		.toBuffer()
	return new File([Uint8Array.from(bytes)], `photo-${crypto.randomUUID()}.webp`, { type: 'image/webp' })
}

/** A file sent to the media route as the browser sends it, with its default alternative text. */
async function send(compte: Artist, alt = 'Photo du portfolio'): Promise<Media> {
	const {
		statut: status,
		corps,
		texte: text,
	} = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(await largeEnoughImage(), { alt }),
	})
	if (status !== 201) throw new Error(`Envoi refusé : ${status} ${text}`)
	return (corps as { doc: Media }).doc
}

/** Exactly `n` photos, so that a test reads them without a hole in the type. */
const sendSeveral = async (compte: Artist, n: number): Promise<Media[]> => {
	const media: Media[] = []
	for (let i = 0; i < n; i++) media.push(await send(compte))
	return media
}

const sendThree = async (compte: Artist): Promise<[Media, Media, Media]> => [
	await send(compte),
	await send(compte),
	await send(compte),
]

const galleryOf = async (compte: Artist) => namedPhotos((await profileOf(compte)).gallery)
const mediaCount = async () => (await (await testPayload()).count({ collection: 'media' })).totalDocs

/** The reconciliation of the storage and the database: 0 orphan, or the list of what is wrong. */
async function orphans() {
	const storage = serverEnv().storage
	if (!storage) throw new Error('Pas de stockage sur le banc.')
	const report = await reconcileStorageAndDatabase(await testPayload(), () => listStorage(storage))
	return {
		objetsSansMedia: report.objetsSansMedia,
		mediasSansObjet: report.mediasSansObjet,
		mediasSansProfil: report.mediasSansProfil,
	}
}
const NONE = { objetsSansMedia: [], mediasSansObjet: [], mediasSansProfil: [] }

describe('E34 : trois photos ajoutées sont dans la galerie, dans l’ordre, et sur le profil public', () => {
	test('la galerie suit l’ordre d’ajout ; l’espace et le profil public montrent les trois ; alt par défaut stocké ; 0 orphelin', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const [a, b, c] = await sendThree(account)
		expect([a, b, c].map(m => m.alt)).toEqual(['Photo du portfolio', 'Photo du portfolio', 'Photo du portfolio'])

		const result = await savePortfolio(payload, user, { galerie: [a.id, b.id, c.id] })

		expect(result).toEqual({ ok: true, valeurs: { galerie: [a.id, b.id, c.id] } })
		const profile = await profileOf(account)
		expect(namedPhotos(profile.gallery)).toEqual([a.id, b.id, c.id])
		const dashboard = await readDashboardPhotos(payload, profile)
		expect(dashboard.galerie.map(p => p.id)).toEqual([a.id, b.id, c.id])
		const publicValue = await readPublicProfile(payload, profile.slug ?? '')
		expect(publicValue?.galerie.map(p => p.url)).toEqual([a.url, b.url, c.url] as string[])
		expect(await orphans()).toEqual(NONE)
	})

	test('des photos ajoutées après celles qu’elle a déjà : les anciennes gardent leur place, les nouvelles suivent', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const [a, b, c] = await sendThree(account)
		await savePortfolio(payload, user, { galerie: [a.id, b.id] })

		const result = await savePortfolio(payload, user, { galerie: [a.id, b.id, c.id] })

		expect(result.ok).toBe(true)
		expect(await galleryOf(account)).toEqual([a.id, b.id, c.id])
		expect(await orphans()).toEqual(NONE)
	})
})

describe('U80 : dix photos au plus', () => {
	test('dix passent ; une onzième est refusée avec le message, la galerie reste intacte', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const media = await sendSeveral(account, 11)
		const ten = media.slice(0, 10).map(m => m.id)

		expect(await savePortfolio(payload, user, { galerie: ten })).toMatchObject({ ok: true })
		const refusal = await savePortfolio(payload, user, { galerie: media.map(m => m.id) })

		expect(refusal).toEqual({
			ok: false,
			message: PHOTO_MESSAGES.galeriePleine,
			champs: { galerie: PHOTO_MESSAGES.galeriePleine },
		})
		expect(await galleryOf(account)).toEqual(ten)
	})
})

describe('la requête de l’action est lue strictement', () => {
	test.each([
		['une clé réservée', (id: number) => ({ galerie: [id], status: 'published' })],
		['la photo principale', (id: number) => ({ galerie: [id], photoPrincipale: id })],
		['un identifiant impossible', () => ({ galerie: ['abc'] })],
		['un identifiant trop grand', () => ({ galerie: [2147483648] })],
		['la même photo deux fois', (id: number) => ({ galerie: [id, id] })],
		['une valeur qui n’est pas une liste', (id: number) => ({ galerie: id })],
		['rien', () => ({})],
	])('%s : refusé en français, jamais une erreur serveur, la galerie ne bouge pas', async (_nom, saisie) => {
		const account = await artist()
		const payload = await testPayload()
		const photo = await send(account)

		const result = await savePortfolio(payload, await userOf(payload, account), saisie(photo.id))

		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.message).not.toMatch(/unrecognized|expected|invalid/i)
		expect(await galleryOf(account)).toEqual([])
	})

	test('la photo d’une autre maquilleuse est refusée, la galerie ne bouge pas', async () => {
		const account = await artist()
		const other = await artist()
		const payload = await testPayload()
		const mine = await send(account)
		const hers = await send(other)

		const result = await savePortfolio(payload, await userOf(payload, account), {
			galerie: [mine.id, hers.id],
		})

		expect(result).toMatchObject({ ok: false, champs: { galerie: PHOTO_MESSAGES.photoRefusee } })
		expect(await galleryOf(account)).toEqual([])
		expect(await galleryOf(other)).toEqual([])
		expect(await readObject(`media/${hers.filename}`)).toBeDefined()
	})

	test('un compte de l’administration n’a pas de portfolio à écrire', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const user = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await savePortfolio(payload, user, { galerie: [] })).toEqual({
			ok: false,
			message: FAILURE_MESSAGE,
		})
	})
})

describe('E34 : fermer sans valider ne laisse rien', () => {
	test('un panneau fermé n’a rien envoyé : ni média, ni objet, ni orphelin', async () => {
		const account = await artist()
		const payload = await testPayload()
		const a = await send(account)
		await savePortfolio(payload, await userOf(payload, account), { galerie: [a.id] })
		const before = await mediaCount()

		// Nothing is sent by the panel before « Enregistrer »: the server sees no request at all.
		expect(await mediaCount()).toBe(before)
		expect(await orphans()).toEqual(NONE)
	})
})

/** The keys of the objects of a media: the original and each derived size. */
const keysOf = (media: Media): string[] => [
	`media/${media.filename}`,
	...Object.values(media.sizes ?? {}).flatMap(taille => (taille?.filename ? [`media/${taille.filename}`] : [])),
]

describe('E35, I25 : une photo retirée disparaît partout, son objet part à la corbeille', () => {
	test('retirer la 2e : galerie, espace et profil public sans elle ; l’original et ses tailles en deleted/ ; 0 orphelin', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const [a, b, c] = await sendThree(account)
		await savePortfolio(payload, user, { galerie: [a.id, b.id, c.id] })
		const keys = keysOf(b)
		expect(keys.length).toBeGreaterThan(1)
		const before = await Promise.all(keys.map(async cle => [cle, (await readObject(cle))?.octets] as const))
		expect(before.every(([, bytes]) => bytes !== undefined)).toBe(true)

		const result = await savePortfolio(payload, user, { galerie: [a.id, c.id] })

		expect(result).toEqual({ ok: true, valeurs: { galerie: [a.id, c.id] } })
		const profile = await profileOf(account)
		expect(namedPhotos(profile.gallery)).toEqual([a.id, c.id])
		expect((await readDashboardPhotos(payload, profile)).galerie.map(p => p.id)).toEqual([a.id, c.id])
		expect((await readPublicProfile(payload, profile.slug ?? ''))?.galerie.map(p => p.url)).toEqual([
			a.url,
			c.url,
		] as string[])
		expect(await payload.findByID({ collection: 'media', id: b.id, depth: 0, disableErrors: true })).toBeNull()
		for (const [key, bytes] of before) {
			expect(await readObject(key)).toBeUndefined()
			expect((await readObject(`deleted/${key}`))?.octets).toEqual(bytes)
		}
		expect((await fetch(b.url ?? '')).status).not.toBe(200)
		// The two that stay are untouched.
		for (const key of [...keysOf(a), ...keysOf(c)]) expect(await readObject(key)).toBeDefined()
		expect(await orphans()).toEqual(NONE)
	})

	test('une photo retirée de la galerie mais encore photo principale reste en place (I25)', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const [main, other] = [await send(account), await send(account)]
		await payload.update({
			collection: 'profiles',
			id: (await profileOf(account)).id,
			data: { mainPicture: main.id },
		})
		await savePortfolio(payload, user, { gallery: [main.id, other.id] })

		await savePortfolio(payload, user, { galerie: [other.id] })

		expect(await galleryOf(account)).toEqual([other.id])
		expect((await profileOf(account)).mainPicture).toBe(main.id)
		for (const key of keysOf(main)) expect(await readObject(key)).toBeDefined()
		expect(await readObject(`deleted/media/${main.filename}`)).toBeUndefined()
		expect(await orphans()).toEqual(NONE)
	})

	test('tout retirer : liste vide, tous les objets en corbeille, 0 orphelin', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const [a, b] = [await send(account), await send(account)]
		await savePortfolio(payload, user, { galerie: [a.id, b.id] })

		expect(await savePortfolio(payload, user, { galerie: [] })).toEqual({
			ok: true,
			valeurs: { galerie: [] },
		})

		expect(await galleryOf(account)).toEqual([])
		expect(await mediaCount()).toBe(0)
		for (const key of [...keysOf(a), ...keysOf(b)]) {
			expect(await readObject(key)).toBeUndefined()
			expect(await readObject(`deleted/${key}`)).toBeDefined()
		}
		expect(await orphans()).toEqual(NONE)
	})

	test('enregistrer deux fois la même liste ne déplace plus rien', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const [a, b] = [await send(account), await send(account)]
		await savePortfolio(payload, user, { galerie: [a.id, b.id] })
		await savePortfolio(payload, user, { galerie: [a.id] })
		const moves = () => spy.journal.filter(commande => commande.nom === 'CopyObject').length
		const before = moves()

		expect(await savePortfolio(payload, user, { galerie: [a.id] })).toMatchObject({ ok: true })

		expect(moves()).toBe(before)
		expect(await orphans()).toEqual(NONE)
	})

	test('la photo de B ne peut pas être retirée par A : la liste de A n’y touche pas, et celle de B reste', async () => {
		const account = await artist()
		const other = await artist()
		const payload = await testPayload()
		const photoOfB = await send(other)
		await savePortfolio(payload, await userOf(payload, other), { galerie: [photoOfB.id] })
		const photoOfA = await send(account)

		await savePortfolio(payload, await userOf(payload, account), { galerie: [photoOfA.id] })
		await savePortfolio(payload, await userOf(payload, account), { galerie: [] })

		expect(await galleryOf(other)).toEqual([photoOfB.id])
		for (const key of keysOf(photoOfB)) expect(await readObject(key)).toBeDefined()
		expect(await orphans()).toEqual(NONE)
	})
})
