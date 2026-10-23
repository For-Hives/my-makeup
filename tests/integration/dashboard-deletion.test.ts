import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import type { Payload } from 'payload'
import { STORAGE_OUTAGE_MESSAGE } from '@/collections/trash'
import { deleteAccountAndDependents } from '@/lib/account/deletion'
import { deleteMyAccount, deletionRateLimit } from '@/lib/dashboard/delete-account'
import { DELETION_MESSAGES } from '@/lib/dashboard/deletion-confirmation'
import type { Media } from '@/payload-types'
import { createAccount, type TestAccount } from '../support/account-factory'
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
 * She deletes her account (ticket 141; plan 02 I36, I38, E33 in its integration half): the account,
 * the profile, the sessions and the photos (to the bin) go together, a wrong confirmation deletes
 * nothing and is braked, a storage failure leaves everything in place, and two requests at once
 * delete once. Against the S3 simulator of the bench. Every request to the storage is recorded:
 * a removal that is not the second half of a move to the bin fails the test.
 */

const PASSWORD = 'un-mot-de-passe-fictif-du-banc'
type Artist = TestAccount<'maquilleuse'>

let spy: Spy
let number = 0
/** The headers of a request from a made-up client address: each test has its own. */
const since = (adresse = `192.0.2.${100 + (++number % 100)}`) => new Headers({ 'x-forwarded-for': adresse })

beforeEach(() => {
	spy = spyStorage()
	deletionRateLimit.vider()
})

afterEach(async () => {
	const faults = deletionsWithoutTrash(spy.journal)
	spy.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
	expect(faults).toEqual([])
})

const artist = () => createAccount('maquilleuse', { motDePasse: () => PASSWORD })

/** A photo sent by this makeup artist through REST, as the site sends it. */
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
	const account = await artist()
	const [main, gallery, free] = [await send(account), await send(account), await send(account)]
	const profile = await profileOf(account)
	if (!profile) throw new Error('pas de profil')
	const payload = await testPayload()
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { mainPicture: main.id, gallery: [main.id, gallery.id] },
	})
	return { compte: account, profil: profile, photos: [main, gallery, free] }
}

const key = (media: Media) => `media/${media.filename}`
const present = async (collection: 'pros' | 'profiles' | 'media', id: number | string) =>
	(await (await testPayload()).findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !==
	null
const inPlace = async (media: Media) => (await readObject(key(media))) !== undefined
const inTrash = async (media: Media) => (await readObject(`deleted/${key(media)}`)) !== undefined

const remove = (payload: Payload, compte: Artist, confirmation: string, entetes = since()) =>
	deleteMyAccount({ payload, compte, headers: entetes, saisie: { confirmation } })

describe('I36 : tout part avec le compte', () => {
	test('compte, profil, sessions et photos : les documents disparaissent, les objets vont à la corbeille, l’ancien jeton ne vaut plus', async () => {
		const payload = await testPayload()
		const { compte: account, profil: profile, photos } = await filledAccount()
		const other = await fillOther()

		expect(await remove(payload, account, PASSWORD)).toEqual({ ok: true })

		expect(await present('pros', account.id)).toBe(false)
		expect(await present('profiles', profile.id)).toBe(false)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(false)
			expect(await inPlace(photo)).toBe(false)
			expect(await inTrash(photo)).toBe(true)
			expect((await fetch(photo.url ?? '')).status).not.toBe(200)
		}
		expect((await payload.auth({ headers: new Headers(account.session.enTetes) })).user).toBeNull()
		const slugs = await payload.find({ collection: 'profiles', depth: 0, where: { slug: { equals: profile.slug } } })
		expect(slugs.totalDocs).toBe(0)
		expect((await listObjects('deleted/')).length).toBe(photos.length)
		// The others are untouched.
		expect(await present('pros', other.compte.id)).toBe(true)
		expect(await present('profiles', other.profil.id)).toBe(true)
		expect(await present('media', other.photo.id)).toBe(true)
		expect(await inPlace(other.photo)).toBe(true)
	})

	test('un compte sans profil se supprime aussi ; un compte déjà supprimé n’est pas une erreur', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse-sans-profil', { motDePasse: () => PASSWORD })
		expect(
			await deleteMyAccount({ payload, compte: account, headers: since(), saisie: { confirmation: PASSWORD } })
		).toEqual({
			ok: true,
		})
		expect(await present('pros', account.id)).toBe(false)

		expect(await deleteAccountAndDependents(payload, account.id)).toEqual({ supprime: false, profils: 0 })
	})

	test('un compte venu de Google se confirme par son adresse, en minuscules ou non, entourée d’espaces', async () => {
		const payload = await testPayload()
		const account = await createAccount('reprise-google')

		const refusal = await deleteMyAccount({
			payload,
			compte: account,
			headers: since(),
			saisie: { confirmation: 'autre@example.test' },
		})
		expect(refusal).toEqual({ ok: false, message: DELETION_MESSAGES.email })
		expect(await present('pros', account.id)).toBe(true)

		const ok = await deleteMyAccount({
			payload,
			compte: account,
			headers: since(),
			saisie: { confirmation: `  ${account.email.toUpperCase()} ` },
		})
		expect(ok).toEqual({ ok: true })
		expect(await present('pros', account.id)).toBe(false)
	})
})

async function fillOther() {
	const account = await artist()
	const photo = await send(account)
	const profile = await profileOf(account)
	if (!profile) throw new Error('pas de profil')
	await (await testPayload()).update({ collection: 'profiles', id: profile.id, data: { mainPicture: photo.id } })
	return { compte: account, profil: profile, photo }
}

describe('Mot de passe faux : rien de supprimé ; essais freinés', () => {
	test('un mauvais mot de passe, un champ vide, une clé en trop : rien ne bouge', async () => {
		const payload = await testPayload()
		const { compte: account, profil: profile, photos } = await filledAccount()

		expect(await remove(payload, account, 'pas-le-bon')).toEqual({
			ok: false,
			message: DELETION_MESSAGES.motDePasse,
		})
		expect(await remove(payload, account, '')).toEqual({ ok: false, message: DELETION_MESSAGES.motDePasse })
		const inToo = await deleteMyAccount({
			payload,
			compte: account,
			headers: since(),
			saisie: { confirmation: PASSWORD, id: 1 },
		})
		expect(inToo.ok).toBe(false)

		expect(await present('pros', account.id)).toBe(true)
		expect(await present('profiles', profile.id)).toBe(true)
		for (const photo of photos) expect(await inPlace(photo)).toBe(true)
		expect((await payload.auth({ headers: new Headers(account.session.enTetes) })).user).not.toBeNull()
		expect(spy.journal.filter(({ nom }) => nom === 'CopyObject')).toEqual([])
	})

	test('la 11e tentative d’une même adresse est freinée, même avec le bon mot de passe ; une autre adresse est libre mais le compte garde son frein', async () => {
		const payload = await testPayload()
		const { compte: account } = await filledAccount()
		const headers = since('192.0.2.7')
		for (let i = 0; i < 10; i++) expect((await remove(payload, account, `faux-${i}`, headers)).ok).toBe(false)

		const throttled = await remove(payload, account, PASSWORD, headers)
		expect(throttled).toEqual({ ok: false, message: DELETION_MESSAGES.freine, freine: true })
		expect(await present('pros', account.id)).toBe(true)

		// Another address: the account itself has used its ten places, so a thief who changes address is braked too.
		const elsewhere = await remove(payload, account, PASSWORD, since('192.0.2.8'))
		expect(elsewhere).toEqual({ ok: false, message: DELETION_MESSAGES.freine, freine: true })
		expect(await present('pros', account.id)).toBe(true)
	})

	test('le frein de la suppression ne bloque pas le compte : la connexion par mot de passe marche encore', async () => {
		const payload = await testPayload()
		const { compte: account } = await filledAccount()
		for (let i = 0; i < 11; i++) await remove(payload, account, `faux-${i}`, since('192.0.2.9'))

		const { openWithPassword: openByPassword } = await import('@/lib/auth/token')
		const { token } = await openByPassword(payload, 'pros', { email: account.email, password: PASSWORD })
		expect(token).toBeTruthy()
	})

	test('le frein d’un compte ne touche pas celui d’un autre', async () => {
		const payload = await testPayload()
		const { compte: account } = await filledAccount()
		const other = await artist()
		for (let i = 0; i < 10; i++) await remove(payload, account, `faux-${i}`, since('192.0.2.20'))

		expect(await remove(payload, other, PASSWORD, since('192.0.2.21'))).toEqual({ ok: true })
	})
})

describe('I38 : panne du stockage, tout est encore là', () => {
	test('la copie vers la corbeille échoue : le message le dit, comptes, profil, photos et session sont intacts ; l’essai suivant réussit', async () => {
		const payload = await testPayload()
		const { compte: account, profil: profile, photos } = await filledAccount()
		let copies = 0
		// The second object fails: the first has already moved, and must be put back.
		spy.fairePanne(
			commande => commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copies === 2
		)

		const result = await remove(payload, account, PASSWORD)

		expect(result).toEqual({ ok: false, message: DELETION_MESSAGES.stockage })
		expect(STORAGE_OUTAGE_MESSAGE).toContain('Le stockage des photos ne répond pas')
		expect(await present('pros', account.id)).toBe(true)
		expect(await present('profiles', profile.id)).toBe(true)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(true)
			expect(await inPlace(photo)).toBe(true)
			expect((await fetch(photo.url ?? '')).status).toBe(200)
		}
		expect((await payload.auth({ headers: new Headers(account.session.enTetes) })).user).not.toBeNull()
		expect((await profileOf(account))?.mainPicture).toBe(photos[0]?.id)

		spy.fairePanne(() => false)
		expect(await remove(payload, account, PASSWORD)).toEqual({ ok: true })
		expect(await present('pros', account.id)).toBe(false)
		for (const photo of photos) expect(await inTrash(photo)).toBe(true)
	})
})

describe('Entrée maintenue : une seule suppression', () => {
	test('deux demandes au même instant : une suppression, une seule copie par objet, aucune erreur', async () => {
		const payload = await testPayload()
		const { compte: account, photos } = await filledAccount()

		const [a, b] = await Promise.all([
			remove(payload, account, PASSWORD, since('192.0.2.30')),
			remove(payload, account, PASSWORD, since('192.0.2.30')),
		])

		expect(a).toEqual({ ok: true })
		expect(b.ok).toBe(true)
		expect(await present('pros', account.id)).toBe(false)
		const copies = spy.journal.filter(
			({ nom, entree }) => nom === 'CopyObject' && String(entree.Key).startsWith('deleted/')
		)
		expect(copies).toHaveLength(photos.length)
	})
})

describe('La suppression reste fermée à la maquilleuse par l’API', () => {
	test('DELETE /api/pros/<id> et /api/profiles/<id> par la propriétaire : 403, rien n’est supprimé', async () => {
		const { compte: account, profil: profile } = await filledAccount()

		for (const path of [`/api/pros/${account.id}`, `/api/profiles/${profile.id}`]) {
			const { statut: status } = await callRest('DELETE', path, { enTetes: account.session.enTetes })
			expect(status).toBe(403)
		}

		expect(await present('pros', account.id)).toBe(true)
		expect(await present('profiles', profile.id)).toBe(true)
	})
})
