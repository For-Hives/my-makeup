import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import type { Payload } from 'payload'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveMainPicture } from '@/lib/dashboard/save-photo'
import { PHOTO_MESSAGES } from '@/lib/profile/photos'
import type { Media } from '@/payload-types'
import { readPublicProfile } from '@/services/public/profiles'
import { createAccount, type TestAccount } from '../support/account-factory'
import { ANNECY } from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage, listObjects, readObject } from '../support/s3'
import { deletionsWithoutTrash, type Spy, spyStorage } from '../support/s3-spy'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * The main photo chosen from her space (ticket 134; plan 02 I24, U03, E36 on the server side): the
 * file goes to the media route as the browser sends it, then the action names it. The former photo
 * goes to the bin, the public profile follows, and a failure leaves the former photo.
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

/** A makeup artist whose profile has a city and a speciality: only the photo is missing to be active (U03). */
async function artist(): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	await payload.update({
		collection: 'profiles',
		id: (await profileOf(account)).id,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée', city: ANNECY },
	})
	return account
}

/** A file sent to the media route as the browser sends it. */
async function send(compte: Artist, alt = 'Photo principale'): Promise<Media> {
	const {
		statut: status,
		corps,
		texte: text,
	} = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(fileForForm(), { alt }),
	})
	if (status !== 201) throw new Error(`Envoi refusé : ${status} ${text}`)
	return (corps as { doc: Media }).doc
}

const mediaCount = async () => (await (await testPayload()).count({ collection: 'media' })).totalDocs
const key = (media: Media) => `media/${media.filename}`

describe('I24 : remplacer la photo principale envoie l’ancienne à la corbeille', () => {
	test('la nouvelle remplace l’ancienne ; ancien objet en deleted/ octet pour octet ; le profil public suit ; « photo » reste remplie', async () => {
		const account = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)

		const old = await send(account)
		expect(old.alt).toBe('Photo principale')
		expect(await saveMainPicture(payload, user, { photoPrincipale: old.id })).toEqual({
			ok: true,
			valeurs: { photoPrincipale: old.id },
		})
		const before = (await readObject(key(old)))?.octets
		expect(before).toBeDefined()

		const fresh = await send(account)
		expect(await saveMainPicture(payload, user, { photoPrincipale: String(fresh.id) })).toEqual({
			ok: true,
			valeurs: { photoPrincipale: fresh.id },
		})

		const profile = await profileOf(account)
		expect(profile.mainPicture).toBe(fresh.id)
		expect(profile.active).toBe(true)
		expect(await payload.findByID({ collection: 'media', id: old.id, depth: 0, disableErrors: true })).toBeNull()
		expect(await readObject(key(old))).toBeUndefined()
		expect((await readObject(`deleted/${key(old)}`))?.octets).toEqual(before)
		expect(await readObject(key(fresh))).toBeDefined()
		// What her space shows, and what the public profile shows, is the new photo.
		const photos = await readDashboardPhotos(payload, profile)
		expect(photos.photo?.id).toBe(fresh.id)
		const publicValue = await readPublicProfile(payload, profile.slug ?? '')
		expect(publicValue?.photo?.url).toBe(fresh.url ?? undefined)
	})
})

describe('U03, E36 : un échec laisse l’ancienne photo, et le fichier envoyé pour rien part à la corbeille', () => {
	test('un envoi refusé (PDF) ne crée rien ; le profil garde sa photo et reste « actif »', async () => {
		const account = await artist()
		const payload = await testPayload()
		const old = await send(account)
		await saveMainPicture(payload, await userOf(payload, account), { photoPrincipale: old.id })
		const objects = (await listObjects()).length

		const pdf = new File([Buffer.from('%PDF-1.7\n')], 'cv.pdf', { type: 'application/pdf' })
		const { statut: status } = await callRest('POST', '/api/media?depth=0', {
			enTetes: account.session.enTetes,
			formulaire: formWithFile(pdf),
		})

		expect(status).toBe(400)
		expect(await mediaCount()).toBe(1)
		expect((await listObjects()).length).toBe(objects)
		const profile = await profileOf(account)
		expect(profile.mainPicture).toBe(old.id)
		expect(profile.active).toBe(true)
	})

	test('le média d’une autre maquilleuse est refusé ; le profil est inchangé ; le fichier envoyé se supprime sans rien effacer', async () => {
		const account = await artist()
		const other = await artist()
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const old = await send(account)
		await saveMainPicture(payload, user, { photoPrincipale: old.id })
		const otherOnesPhoto = await send(other)
		const extraUpload = await send(account)

		const result = await saveMainPicture(payload, user, { photoPrincipale: otherOnesPhoto.id })

		expect(result).toMatchObject({ ok: false, champs: { photoPrincipale: PHOTO_MESSAGES.photoRefusee } })
		expect((await profileOf(account)).mainPicture).toBe(old.id)
		// The browser takes its own file back, as the panel does after an explicit refusal.
		const deletion = await callRest('DELETE', `/api/media/${extraUpload.id}?depth=0`, {
			enTetes: account.session.enTetes,
		})
		expect(deletion.statut).toBe(200)
		expect(await readObject(key(extraUpload))).toBeUndefined()
		expect(await readObject(`deleted/${key(extraUpload)}`)).toBeDefined()
		expect((await profileOf(account)).mainPicture).toBe(old.id)
		expect(await readObject(key(otherOnesPhoto))).toBeDefined()
	})
})

describe('la requête de l’action est lue strictement', () => {
	test.each([
		['une clé réservée', (id: number) => ({ photoPrincipale: id, status: 'published' })],
		['la galerie', (id: number) => ({ photoPrincipale: id, galerie: [id] })],
		['un identifiant impossible', () => ({ photoPrincipale: 'abc' })],
		['un identifiant décimal', () => ({ photoPrincipale: 1.5 })],
		['un identifiant trop grand', () => ({ photoPrincipale: 2147483648 })],
		['une liste', (id: number) => ({ photoPrincipale: [id] })],
		['rien', () => ({})],
	])('%s : refusé, jamais une erreur serveur, le profil ne bouge pas', async (_nom, saisie) => {
		const account = await artist()
		const payload = await testPayload()
		const photo = await send(account)

		const result = await saveMainPicture(payload, await userOf(payload, account), saisie(photo.id))

		expect(result).toMatchObject({ ok: false })
		if (!result.ok) expect([FAILURE_MESSAGE, expect.any(String)]).toContain(result.message)
		expect((await profileOf(account)).mainPicture ?? null).toBeNull()
	})
})
