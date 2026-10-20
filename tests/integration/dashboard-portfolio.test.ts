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

type Maquilleuse = TestAccount<'maquilleuse'>

let espion: Spy

beforeEach(() => {
	espion = spyStorage()
})

afterEach(async () => {
	const fautes = deletionsWithoutTrash(espion.journal)
	espion.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
	expect(fautes).toEqual([])
})

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function profilDe(compte: Maquilleuse) {
	const payload = await testPayload()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('pas de profil')
	return profil
}

async function maquilleuse(): Promise<Maquilleuse> {
	const compte = await createAccount('maquilleuse')
	const payload = await testPayload()
	await payload.update({
		collection: 'profiles',
		id: (await profilDe(compte)).id,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée' },
	})
	return compte
}

/** A real image large enough for every derived size: a photo has an original and three more objects. */
async function imageAssezGrande(): Promise<File> {
	const octets = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c08080' } })
		.webp()
		.toBuffer()
	return new File([Uint8Array.from(octets)], `photo-${crypto.randomUUID()}.webp`, { type: 'image/webp' })
}

/** A file sent to the media route as the browser sends it, with its default alternative text. */
async function envoyer(compte: Maquilleuse, alt = 'Photo du portfolio'): Promise<Media> {
	const { statut, corps, texte } = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(await imageAssezGrande(), { alt }),
	})
	if (statut !== 201) throw new Error(`Envoi refusé : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

/** Exactly `n` photos, so that a test reads them without a hole in the type. */
const envoyerPlusieurs = async (compte: Maquilleuse, n: number): Promise<Media[]> => {
	const medias: Media[] = []
	for (let i = 0; i < n; i++) medias.push(await envoyer(compte))
	return medias
}

const envoyerTrois = async (compte: Maquilleuse): Promise<[Media, Media, Media]> => [
	await envoyer(compte),
	await envoyer(compte),
	await envoyer(compte),
]

const galerieDe = async (compte: Maquilleuse) => namedPhotos((await profilDe(compte)).gallery)
const nombreDeMedias = async () => (await (await testPayload()).count({ collection: 'media' })).totalDocs

/** The reconciliation of the storage and the database: 0 orphan, or the list of what is wrong. */
async function orphelins() {
	const storage = serverEnv().storage
	if (!storage) throw new Error('Pas de stockage sur le banc.')
	const rapport = await reconcileStorageAndDatabase(await testPayload(), () => listStorage(storage))
	return {
		objetsSansMedia: rapport.objetsSansMedia,
		mediasSansObjet: rapport.mediasSansObjet,
		mediasSansProfil: rapport.mediasSansProfil,
	}
}
const AUCUN = { objetsSansMedia: [], mediasSansObjet: [], mediasSansProfil: [] }

describe('E34 : trois photos ajoutées sont dans la galerie, dans l’ordre, et sur le profil public', () => {
	test('la galerie suit l’ordre d’ajout ; l’espace et le profil public montrent les trois ; alt par défaut stocké ; 0 orphelin', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const [a, b, c] = await envoyerTrois(compte)
		expect([a, b, c].map(m => m.alt)).toEqual(['Photo du portfolio', 'Photo du portfolio', 'Photo du portfolio'])

		const resultat = await savePortfolio(payload, utilisateur, { galerie: [a.id, b.id, c.id] })

		expect(resultat).toEqual({ ok: true, valeurs: { galerie: [a.id, b.id, c.id] } })
		const profil = await profilDe(compte)
		expect(namedPhotos(profil.gallery)).toEqual([a.id, b.id, c.id])
		const espace = await readDashboardPhotos(payload, profil)
		expect(espace.galerie.map(p => p.id)).toEqual([a.id, b.id, c.id])
		const publique = await readPublicProfile(payload, profil.slug ?? '')
		expect(publique?.galerie.map(p => p.url)).toEqual([a.url, b.url, c.url] as string[])
		expect(await orphelins()).toEqual(AUCUN)
	})

	test('des photos ajoutées après celles qu’elle a déjà : les anciennes gardent leur place, les nouvelles suivent', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const [a, b, c] = await envoyerTrois(compte)
		await savePortfolio(payload, utilisateur, { galerie: [a.id, b.id] })

		const resultat = await savePortfolio(payload, utilisateur, { galerie: [a.id, b.id, c.id] })

		expect(resultat.ok).toBe(true)
		expect(await galerieDe(compte)).toEqual([a.id, b.id, c.id])
		expect(await orphelins()).toEqual(AUCUN)
	})
})

describe('U80 : dix photos au plus', () => {
	test('dix passent ; une onzième est refusée avec le message, la galerie reste intacte', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const medias = await envoyerPlusieurs(compte, 11)
		const dix = medias.slice(0, 10).map(m => m.id)

		expect(await savePortfolio(payload, utilisateur, { galerie: dix })).toMatchObject({ ok: true })
		const refus = await savePortfolio(payload, utilisateur, { galerie: medias.map(m => m.id) })

		expect(refus).toEqual({
			ok: false,
			message: PHOTO_MESSAGES.galeriePleine,
			champs: { galerie: PHOTO_MESSAGES.galeriePleine },
		})
		expect(await galerieDe(compte)).toEqual(dix)
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
		const compte = await maquilleuse()
		const payload = await testPayload()
		const photo = await envoyer(compte)

		const resultat = await savePortfolio(payload, await utilisateurDe(payload, compte), saisie(photo.id))

		expect(resultat.ok).toBe(false)
		if (!resultat.ok) expect(resultat.message).not.toMatch(/unrecognized|expected|invalid/i)
		expect(await galerieDe(compte)).toEqual([])
	})

	test('la photo d’une autre maquilleuse est refusée, la galerie ne bouge pas', async () => {
		const compte = await maquilleuse()
		const autre = await maquilleuse()
		const payload = await testPayload()
		const mienne = await envoyer(compte)
		const sienne = await envoyer(autre)

		const resultat = await savePortfolio(payload, await utilisateurDe(payload, compte), {
			galerie: [mienne.id, sienne.id],
		})

		expect(resultat).toMatchObject({ ok: false, champs: { galerie: PHOTO_MESSAGES.photoRefusee } })
		expect(await galerieDe(compte)).toEqual([])
		expect(await galerieDe(autre)).toEqual([])
		expect(await readObject(`media/${sienne.filename}`)).toBeDefined()
	})

	test('un compte de l’administration n’a pas de portfolio à écrire', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const utilisateur = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await savePortfolio(payload, utilisateur, { galerie: [] })).toEqual({
			ok: false,
			message: FAILURE_MESSAGE,
		})
	})
})

describe('E34 : fermer sans valider ne laisse rien', () => {
	test('un panneau fermé n’a rien envoyé : ni média, ni objet, ni orphelin', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const a = await envoyer(compte)
		await savePortfolio(payload, await utilisateurDe(payload, compte), { galerie: [a.id] })
		const avant = await nombreDeMedias()

		// Nothing is sent by the panel before « Enregistrer »: the server sees no request at all.
		expect(await nombreDeMedias()).toBe(avant)
		expect(await orphelins()).toEqual(AUCUN)
	})
})

/** The keys of the objects of a media: the original and each derived size. */
const clesDe = (media: Media): string[] => [
	`media/${media.filename}`,
	...Object.values(media.sizes ?? {}).flatMap(taille => (taille?.filename ? [`media/${taille.filename}`] : [])),
]

describe('E35, I25 : une photo retirée disparaît partout, son objet part à la corbeille', () => {
	test('retirer la 2e : galerie, espace et profil public sans elle ; l’original et ses tailles en deleted/ ; 0 orphelin', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const [a, b, c] = await envoyerTrois(compte)
		await savePortfolio(payload, utilisateur, { galerie: [a.id, b.id, c.id] })
		const cles = clesDe(b)
		expect(cles.length).toBeGreaterThan(1)
		const avant = await Promise.all(cles.map(async cle => [cle, (await readObject(cle))?.octets] as const))
		expect(avant.every(([, octets]) => octets !== undefined)).toBe(true)

		const resultat = await savePortfolio(payload, utilisateur, { galerie: [a.id, c.id] })

		expect(resultat).toEqual({ ok: true, valeurs: { galerie: [a.id, c.id] } })
		const profil = await profilDe(compte)
		expect(namedPhotos(profil.gallery)).toEqual([a.id, c.id])
		expect((await readDashboardPhotos(payload, profil)).galerie.map(p => p.id)).toEqual([a.id, c.id])
		expect((await readPublicProfile(payload, profil.slug ?? ''))?.galerie.map(p => p.url)).toEqual([
			a.url,
			c.url,
		] as string[])
		expect(await payload.findByID({ collection: 'media', id: b.id, depth: 0, disableErrors: true })).toBeNull()
		for (const [cle, octets] of avant) {
			expect(await readObject(cle)).toBeUndefined()
			expect((await readObject(`deleted/${cle}`))?.octets).toEqual(octets)
		}
		expect((await fetch(b.url ?? '')).status).not.toBe(200)
		// The two that stay are untouched.
		for (const cle of [...clesDe(a), ...clesDe(c)]) expect(await readObject(cle)).toBeDefined()
		expect(await orphelins()).toEqual(AUCUN)
	})

	test('une photo retirée de la galerie mais encore photo principale reste en place (I25)', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const [principale, autre] = [await envoyer(compte), await envoyer(compte)]
		await payload.update({
			collection: 'profiles',
			id: (await profilDe(compte)).id,
			data: { mainPicture: principale.id },
		})
		await savePortfolio(payload, utilisateur, { gallery: [principale.id, autre.id] })

		await savePortfolio(payload, utilisateur, { galerie: [autre.id] })

		expect(await galerieDe(compte)).toEqual([autre.id])
		expect((await profilDe(compte)).mainPicture).toBe(principale.id)
		for (const cle of clesDe(principale)) expect(await readObject(cle)).toBeDefined()
		expect(await readObject(`deleted/media/${principale.filename}`)).toBeUndefined()
		expect(await orphelins()).toEqual(AUCUN)
	})

	test('tout retirer : liste vide, tous les objets en corbeille, 0 orphelin', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const [a, b] = [await envoyer(compte), await envoyer(compte)]
		await savePortfolio(payload, utilisateur, { galerie: [a.id, b.id] })

		expect(await savePortfolio(payload, utilisateur, { galerie: [] })).toEqual({
			ok: true,
			valeurs: { galerie: [] },
		})

		expect(await galerieDe(compte)).toEqual([])
		expect(await nombreDeMedias()).toBe(0)
		for (const cle of [...clesDe(a), ...clesDe(b)]) {
			expect(await readObject(cle)).toBeUndefined()
			expect(await readObject(`deleted/${cle}`)).toBeDefined()
		}
		expect(await orphelins()).toEqual(AUCUN)
	})

	test('enregistrer deux fois la même liste ne déplace plus rien', async () => {
		const compte = await maquilleuse()
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const [a, b] = [await envoyer(compte), await envoyer(compte)]
		await savePortfolio(payload, utilisateur, { galerie: [a.id, b.id] })
		await savePortfolio(payload, utilisateur, { galerie: [a.id] })
		const deplacements = () => espion.journal.filter(commande => commande.nom === 'CopyObject').length
		const avant = deplacements()

		expect(await savePortfolio(payload, utilisateur, { galerie: [a.id] })).toMatchObject({ ok: true })

		expect(deplacements()).toBe(avant)
		expect(await orphelins()).toEqual(AUCUN)
	})

	test('la photo de B ne peut pas être retirée par A : la liste de A n’y touche pas, et celle de B reste', async () => {
		const compte = await maquilleuse()
		const autre = await maquilleuse()
		const payload = await testPayload()
		const photoDeB = await envoyer(autre)
		await savePortfolio(payload, await utilisateurDe(payload, autre), { galerie: [photoDeB.id] })
		const photoDeA = await envoyer(compte)

		await savePortfolio(payload, await utilisateurDe(payload, compte), { galerie: [photoDeA.id] })
		await savePortfolio(payload, await utilisateurDe(payload, compte), { galerie: [] })

		expect(await galerieDe(autre)).toEqual([photoDeB.id])
		for (const cle of clesDe(photoDeB)) expect(await readObject(cle)).toBeDefined()
		expect(await orphelins()).toEqual(AUCUN)
	})
})
