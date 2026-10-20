import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { STORAGE_OUTAGE_MESSAGE } from '@/collections/trash'
import type { Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
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
 * The admin deletes the account of a makeup artist (ticket 167; plan 02 I37): the same result as
 * her own deletion (I36), through `DELETE /api/pros/:id`, the route the panel's button calls. The
 * account, the profile, the sessions and the photos (to the bin) go together; nobody else may do
 * it; a failing storage leaves everything in place. Every request to the storage is recorded: a
 * removal that is not the second half of a move to the bin fails the test.
 */

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

type Artist = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>

async function send(compte: Artist): Promise<Media> {
	const {
		statut: status,
		corps,
		texte: text,
	} = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(fileForForm()),
	})
	if (status !== 201) throw new Error(`L’envoi de la photo a échoué : ${status} ${text}`)
	return (corps as { doc: Media }).doc
}

async function profileOf(compte: { id: number | string }) {
	const payload = await testPayload()
	return (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })).docs[0]
}

/** An account with a profile that names a main photo and a gallery photo, and one more photo nobody names. */
async function filledAccount() {
	const account = await createAccount('maquilleuse')
	const [main, gallery, free] = [await send(account), await send(account), await send(account)]
	const profile = await profileOf(account)
	if (!profile) throw new Error('pas de profil')
	await (await testPayload()).update({
		collection: 'profiles',
		id: profile.id,
		data: { mainPicture: main.id, gallery: [main.id, gallery.id] },
	})
	return { compte: account, profil: profile, photos: [main, gallery, free] }
}

const present = async (collection: 'pros' | 'profiles' | 'media', id: number | string) =>
	(await (await testPayload()).findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !==
	null
const key = (media: Media) => `media/${media.filename}`
const inPlace = async (media: Media) => (await readObject(key(media))) !== undefined
const inTrash = async (media: Media) => (await readObject(`deleted/${key(media)}`)) !== undefined
const deleteByAdmin = (admin: { session: { enTetes: Record<string, string> } }, id: number | string) =>
	callRest('DELETE', `/api/pros/${id}`, { enTetes: admin.session.enTetes })

describe('I37 : l’admin supprime un compte, le même résultat que la maquilleuse', () => {
	test('compte, profil, sessions, photos : tout part, les objets vont à la corbeille, aucune photo orpheline, les autres comptes intacts', async () => {
		const payload = await testPayload()
		const admin = await createAccount('admin')
		const { compte: account, profil: profile, photos } = await filledAccount()
		const other = await filledAccount()

		const { statut: status } = await deleteByAdmin(admin, account.id)

		expect(status).toBe(200)
		expect(await present('pros', account.id)).toBe(false)
		expect(await present('profiles', profile.id)).toBe(false)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(false)
			expect(await inPlace(photo)).toBe(false)
			expect(await inTrash(photo)).toBe(true)
		}
		expect((await payload.auth({ headers: new Headers(account.session.enTetes) })).user).toBeNull()
		expect((await callRest('GET', `/api/pros/me`, { enTetes: account.session.enTetes })).corps).toMatchObject({
			user: null,
		})
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, where: { slug: { equals: profile.slug } } })).totalDocs
		).toBe(0)
		expect((await listObjects('deleted/')).length).toBe(photos.length)

		// No profile without an owner, no photo without one: what remains is the other account's.
		const profiles = await payload.find({ collection: 'profiles', depth: 0, pagination: false })
		expect(profiles.docs.map(({ id }) => id)).toEqual([other.profil.id])
		const media = await payload.find({ collection: 'media', depth: 0, pagination: false })
		expect(media.docs.map(({ id }) => id).sort()).toEqual(other.photos.map(({ id }) => id).sort())
		for (const photo of other.photos) expect(await inPlace(photo)).toBe(true)
		expect(await present('pros', other.compte.id)).toBe(true)
	})

	test('un compte sans profil se supprime aussi, et ses photos vont à la corbeille', async () => {
		const admin = await createAccount('admin')
		const account = await createAccount('maquilleuse-sans-profil')
		const photo = await send(account as unknown as Artist)

		expect((await deleteByAdmin(admin, account.id)).statut).toBe(200)

		expect(await present('pros', account.id)).toBe(false)
		expect(await present('media', photo.id)).toBe(false)
		expect(await inPlace(photo)).toBe(false)
		expect(await inTrash(photo)).toBe(true)
	})

	test('un compte qui n’existe pas : 404 ; deux clics au même instant : une seule suppression', async () => {
		const admin = await createAccount('admin')
		expect((await deleteByAdmin(admin, 987654)).statut).toBe(404)

		const { compte: account, photos } = await filledAccount()
		const responses = await Promise.all([deleteByAdmin(admin, account.id), deleteByAdmin(admin, account.id)])

		expect(responses.map(({ statut: status }) => status).sort()).toEqual([200, 200])
		expect(await present('pros', account.id)).toBe(false)
		const copies = spy.journal.filter(
			({ nom, entree }) => nom === 'CopyObject' && String(entree.Key).startsWith('deleted/')
		)
		expect(copies).toHaveLength(photos.length)
	})
})

describe('Seul l’admin supprime un compte', () => {
	test('la rédaction, une maquilleuse (la sienne ou une autre), un visiteur, un identifiant impossible : 403, rien n’est supprimé', async () => {
		const { compte: account, profil: profile, photos } = await filledAccount()
		const other = await createAccount('maquilleuse')
		const editor = await createAccount('redaction')
		const admin = await createAccount('admin')

		const tests = [
			await callRest('DELETE', `/api/pros/${account.id}`, { enTetes: editor.session.enTetes }),
			await callRest('DELETE', `/api/pros/${account.id}`, { enTetes: account.session.enTetes }),
			await callRest('DELETE', `/api/pros/${account.id}`, { enTetes: other.session.enTetes }),
			await callRest('DELETE', `/api/pros/${account.id}`, {}),
			await callRest('DELETE', `/api/pros/abc`, { enTetes: admin.session.enTetes }),
		]

		expect(tests.map(({ statut: status }) => status)).toEqual([403, 403, 403, 403, 403])
		expect(await present('pros', account.id)).toBe(true)
		expect(await present('profiles', profile.id)).toBe(true)
		for (const photo of photos) expect(await inPlace(photo)).toBe(true)
		expect(spy.journal.filter(({ nom }) => nom === 'CopyObject')).toEqual([])
	})

	test('la suppression de plusieurs comptes à la fois est refusée, même à l’admin ; la suppression native refuse un compte qui a encore un profil', async () => {
		const payload = await testPayload()
		const admin = await createAccount('admin')
		const { compte: account, profil: profile } = await filledAccount()

		const batch = await callRest('DELETE', `/api/pros?where[email][exists]=true`, { enTetes: admin.session.enTetes })
		expect(batch.statut).toBeGreaterThanOrEqual(400)
		await expect(payload.delete({ collection: 'pros', id: account.id, overrideAccess: true })).rejects.toMatchObject({
			status: 409,
		})

		expect(await present('pros', account.id)).toBe(true)
		expect(await present('profiles', profile.id)).toBe(true)
	})
})

describe('Panne du stockage : tout est encore là', () => {
	test('la copie vers la corbeille échoue : 503 en français, rien n’est supprimé ; l’essai suivant réussit', async () => {
		const payload = await testPayload()
		const admin = await createAccount('admin')
		const { compte: account, profil: profile, photos } = await filledAccount()
		let copies = 0
		spy.fairePanne(
			commande => commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copies === 2
		)

		const { statut: status, texte: text } = await deleteByAdmin(admin, account.id)

		expect(status).toBe(503)
		expect(text).toContain(STORAGE_OUTAGE_MESSAGE)
		expect(await present('pros', account.id)).toBe(true)
		expect(await present('profiles', profile.id)).toBe(true)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(true)
			expect(await inPlace(photo)).toBe(true)
		}
		expect((await payload.auth({ headers: new Headers(account.session.enTetes) })).user).not.toBeNull()

		spy.fairePanne(() => false)
		expect((await deleteByAdmin(admin, account.id)).statut).toBe(200)
		for (const photo of photos) expect(await inTrash(photo)).toBe(true)
	})
})
