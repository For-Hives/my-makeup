import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ONE_AT_A_TIME_MESSAGE, STORAGE_OUTAGE_MESSAGE } from '@/collections/trash'
import { serverEnv } from '@/lib/env'
import { IMPORT_CONTEXT } from '@/lib/import-context'
import { createObjectStorage } from '@/lib/storage'
import { restore } from '@/lib/trash'
import type { Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm, fileForPayload } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage, listObjects, readObject } from '../support/s3'
import { deletionsWithoutTrash, type Spy, sourceOf, spyStorage } from '../support/s3-spy'

/**
 * A media that no longer serves goes to the bin, never to a direct deletion (ticket 045; plan 02
 * §7.3, I24 and I25; plan 01 §1.8). Against the S3 simulator of the bench, through the real API.
 *
 * Every request of the application to the storage is recorded (tests/support/s3-spy.ts): after
 * each test, a removal that is not the second half of a move to the bin fails it.
 */

type Account = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>

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

/** A photo sent by this makeup artist through REST, as the site sends it. */
async function send(compte: Account): Promise<Media> {
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

/** The profile of an account, read without access control. */
async function profileOf(compte: { id: number | string }) {
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profile) throw new Error('La fabrique n’a pas créé de profil.')
	return profile
}

/** She saves her own profile through REST, as her space will. */
const save = async (compte: Account, corps: Record<string, unknown>) =>
	callRest('PATCH', `/api/profiles/${(await profileOf(compte)).id}?depth=0`, {
		enTetes: compte.session.enTetes,
		corps,
	})

/** Saves it, or fails the test. */
async function saveOrFail(compte: Account, corps: Record<string, unknown>) {
	const { statut: status, texte: text } = await save(compte, corps)
	if (status !== 200) throw new Error(`Enregistrement refusé : ${status} ${text}`)
}

/** The media as the database holds it, or nothing. */
async function stored(id: number): Promise<Media | null> {
	const payload = await testPayload()
	return payload.findByID({ collection: 'media', id, depth: 0, disableErrors: true })
}

/** The key of the object of a photo sent in the v3. */
const key = (media: Media) => `media/${media.filename}`

/** The bytes of an object, or nothing when the storage does not hold it. */
const bytes = async (cleDeLObjet: string) => (await readObject(cleDeLObjet))?.octets

/** What its public address answers, as a browser would ask it. */
const publicStatus = async (media: Media) => (await fetch(media.url ?? '')).status

/** The keys of the bin. */
const trash = async () => (await listObjects('deleted/')).map(({ cle: cleDeLObjet }) => cleDeLObjet)

describe('Photo remplacée : ancien objet en corbeille (I24) ; photo encore référencée : en place (I25)', () => {
	test('I24 : la photo principale remplacée par la maquilleuse : l’ancienne part à la corbeille, octet pour octet', async () => {
		const account = await createAccount('maquilleuse')
		const [old, fresh] = [await send(account), await send(account)]
		await saveOrFail(account, { mainPicture: old.id })
		const before = await bytes(key(old))

		await saveOrFail(account, { mainPicture: fresh.id })

		expect((await profileOf(account)).mainPicture).toBe(fresh.id)
		expect(await stored(old.id)).toBeNull()
		expect(await bytes(key(old))).toBeUndefined()
		expect(await bytes(`deleted/${key(old)}`)).toEqual(before)
		expect(await stored(fresh.id)).not.toBeNull()
		expect(await bytes(key(fresh))).toBeDefined()
		expect(await trash()).toEqual([`deleted/${key(old)}`])
	})

	test('I25 : une photo retirée de la galerie part à la corbeille ; celle qui reste photo principale reste en place', async () => {
		const account = await createAccount('maquilleuse')
		const [main, removed, guarded] = [await send(account), await send(account), await send(account)]
		await saveOrFail(account, {
			mainPicture: main.id,
			gallery: [main.id, removed.id, guarded.id],
		})

		await saveOrFail(account, { gallery: [guarded.id] })

		expect(await stored(removed.id)).toBeNull()
		expect(await bytes(`deleted/${key(removed)}`)).toBeDefined()
		for (const media of [main, guarded]) {
			expect(await stored(media.id)).not.toBeNull()
			expect(await bytes(key(media))).toBeDefined()
		}
		expect(await trash()).toEqual([`deleted/${key(removed)}`])
	})

	test('une photo qu’une version d’un article garde encore reste en place, même retirée du profil', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const replacement = await send(account)
		// A photo of the newsroom, in a version of an article only, then given to the account by an admin.
		const photo = await payload.create({ collection: 'media', data: {}, file: fileForPayload() })
		const article = await payload.create({
			collection: 'articles',
			data: { title: 'Article fictif', slug: 'article-fictif', gallery: [photo.id], _status: 'published' },
		})
		await payload.update({ collection: 'articles', id: article.id, data: { gallery: [] } })
		await payload.update({ collection: 'media', id: photo.id, data: { owner: Number(account.id) } })
		await payload.update({
			collection: 'profiles',
			id: (await profileOf(account)).id,
			data: { mainPicture: photo.id },
		})

		await saveOrFail(account, { mainPicture: replacement.id })

		expect(await stored(photo.id)).not.toBeNull()
		expect(await bytes(key(photo))).toBeDefined()
		expect(await trash()).toEqual([])
	})

	test('un profil supprimé par un admin : ses photos et celles de son compte partent à la corbeille, pas celles d’une autre', async () => {
		const [a, b, admin] = await Promise.all([
			createAccount('maquilleuse'),
			createAccount('maquilleuse'),
			createAccount('admin'),
		])
		const [main, gallery, nonRattachee, ofB] = [await send(a), await send(a), await send(a), await send(b)]
		await saveOrFail(a, { mainPicture: main.id, gallery: [gallery.id] })
		await saveOrFail(b, { mainPicture: ofB.id })

		const { statut: status } = await callRest('DELETE', `/api/profiles/${(await profileOf(a)).id}`, {
			enTetes: admin.session.enTetes,
		})

		expect(status).toBe(200)
		for (const media of [main, gallery, nonRattachee]) {
			expect(await stored(media.id)).toBeNull()
			expect(await bytes(key(media))).toBeUndefined()
		}
		expect((await trash()).sort()).toEqual([main, gallery, nonRattachee].map(media => `deleted/${key(media)}`).sort())
		expect(await stored(ofB.id)).not.toBeNull()
		expect(await bytes(key(ofB))).toBeDefined()
	})

	test('un média supprimé par sa propriétaire : son objet part à la corbeille, il n’est pas effacé', async () => {
		const account = await createAccount('maquilleuse')
		const media = await send(account)
		const before = await bytes(key(media))

		const { statut: status } = await callRest('DELETE', `/api/media/${media.id}`, { enTetes: account.session.enTetes })

		expect(status).toBe(200)
		expect(await bytes(key(media))).toBeUndefined()
		expect(await bytes(`deleted/${key(media)}`)).toEqual(before)
	})

	test('le fichier d’un média remplacé : l’ancien objet part à la corbeille, le nouveau est en place', async () => {
		const account = await createAccount('maquilleuse')
		const media = await send(account)

		const {
			statut: status,
			corps,
			texte: text,
		} = await callRest('PATCH', `/api/media/${media.id}?depth=0`, {
			enTetes: account.session.enTetes,
			formulaire: formWithFile(fileForForm()),
		})

		expect([status, text]).toEqual([200, text])
		const replaced = (corps as { doc: Media }).doc
		expect(replaced.filename).not.toBe(media.filename)
		expect(await bytes(key(replaced))).toBeDefined()
		expect(await bytes(key(media))).toBeUndefined()
		expect(await trash()).toEqual([`deleted/${key(media)}`])
	})
})

describe('L’adresse publique d’une photo en corbeille ne répond plus 200', () => {
	test('200 tant qu’elle sert ; plus 200 une fois remplacée', async () => {
		const account = await createAccount('maquilleuse')
		const [old, fresh] = [await send(account), await send(account)]
		await saveOrFail(account, { mainPicture: old.id })
		expect(await publicStatus(old)).toBe(200)

		await saveOrFail(account, { mainPicture: fresh.id })

		expect(await publicStatus(old)).not.toBe(200)
		expect(await publicStatus(fresh)).toBe(200)
	})
})

describe('Panne du stockage : document et objet intacts, erreur remontée', () => {
	test('le stockage tombe pendant le remplacement : 503 en français ; profil, média et objet comme avant', async () => {
		const account = await createAccount('maquilleuse')
		const [old, fresh] = [await send(account), await send(account)]
		await saveOrFail(account, { mainPicture: old.id })
		spy.fairePanne(commande => commande.nom === 'CopyObject')

		const { statut: status, texte: text } = await save(account, { mainPicture: fresh.id })

		expect(status).toBe(503)
		expect(text).toContain(STORAGE_OUTAGE_MESSAGE)
		expect((await profileOf(account)).mainPicture).toBe(old.id)
		expect(await stored(old.id)).not.toBeNull()
		expect(await bytes(key(old))).toBeDefined()
		expect(await trash()).toEqual([])
		expect(await publicStatus(old)).toBe(200)
	})

	test('la suppression d’un média pendant la panne : refusée en 503, le média et son objet restent', async () => {
		const account = await createAccount('maquilleuse')
		const media = await send(account)
		spy.fairePanne(commande => commande.nom === 'HeadObject')

		const { statut: status, texte: text } = await callRest('DELETE', `/api/media/${media.id}`, {
			enTetes: account.session.enTetes,
		})

		expect(status).toBe(503)
		expect(text).toContain(STORAGE_OUTAGE_MESSAGE)
		expect(await stored(media.id)).not.toBeNull()
		expect(await bytes(key(media))).toBeDefined()
	})
})

describe('Panne du stockage : plusieurs documents à la fois sont refusés, rien n’est écrit', () => {
	// Payload commits an operation on several documents (by a `where`) even when one of them fails:
	// media and profiles are deleted and changed one at a time, where a failure undoes everything.

	test('la propriétaire supprime sa photo principale par un filtre, pendant une panne : refusé ; média, objet et profil intacts', async () => {
		const account = await createAccount('maquilleuse')
		const photo = await send(account)
		await saveOrFail(account, { mainPicture: photo.id })
		spy.fairePanne(commande => commande.nom === 'HeadObject')
		const before = spy.journal.length

		const { statut: status } = await callRest('DELETE', `/api/media?where[id][equals]=${photo.id}`, {
			enTetes: account.session.enTetes,
		})

		expect(status).toBe(403)
		expect(spy.journal.slice(before)).toEqual([])
		expect(await stored(photo.id)).not.toBeNull()
		expect(await bytes(key(photo))).toBeDefined()
		expect((await profileOf(account)).mainPicture).toBe(photo.id)
		expect(await trash()).toEqual([])
	})

	test('la propriétaire change sa photo principale par un filtre, pendant une panne : refusé ; le profil garde l’ancienne', async () => {
		const account = await createAccount('maquilleuse')
		const [old, fresh] = [await send(account), await send(account)]
		await saveOrFail(account, { mainPicture: old.id })
		const profile = await profileOf(account)
		spy.fairePanne(commande => commande.nom === 'CopyObject')

		const { statut: status } = await callRest('PATCH', `/api/profiles?where[id][equals]=${profile.id}&depth=0`, {
			enTetes: account.session.enTetes,
			corps: { mainPicture: fresh.id },
		})

		expect(status).toBe(403)
		expect((await profileOf(account)).mainPicture).toBe(old.id)
		expect(await stored(old.id)).not.toBeNull()
		expect(await bytes(key(old))).toBeDefined()
		expect(await trash()).toEqual([])
	})

	test('un admin supprime deux profils par un filtre, et le stockage tombe à la troisième copie : refusé ; profils, médias et objets intacts', async () => {
		const [a, b, admin] = await Promise.all([
			createAccount('maquilleuse'),
			createAccount('maquilleuse'),
			createAccount('admin'),
		])
		const [a1, a2, b1, b2] = [await send(a), await send(a), await send(b), await send(b)]
		await saveOrFail(a, { mainPicture: a1.id, gallery: [a2.id] })
		await saveOrFail(b, { mainPicture: b1.id, gallery: [b2.id] })
		const [profileA, profileB] = [await profileOf(a), await profileOf(b)]
		let copiesInTrash = 0
		spy.fairePanne(
			commande =>
				commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copiesInTrash === 3
		)

		const { statut: status } = await callRest('DELETE', `/api/profiles?where[id][in]=${profileA.id},${profileB.id}`, {
			enTetes: admin.session.enTetes,
		})

		expect(status).toBe(403)
		expect([(await profileOf(a)).id, (await profileOf(b)).id]).toEqual([profileA.id, profileB.id])
		for (const media of [a1, a2, b1, b2]) {
			expect(await stored(media.id)).not.toBeNull()
			expect(await bytes(key(media))).toBeDefined()
		}
		expect(await trash()).toEqual([])
	})

	test('par l’API locale, même sans contrôle d’accès : chaque suppression et chaque modification par un filtre est refusée en français', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const photo = await send(account)
		await saveOrFail(account, { mainPicture: photo.id })
		const profile = await profileOf(account)
		const media = { collection: 'media', where: { id: { equals: photo.id } } } as const
		const profiles = { collection: 'profiles', where: { id: { equals: profile.id } } } as const

		for (const operation of [
			() => payload.delete(media),
			() => payload.update({ ...media, data: { alt: 'Texte fictif' } }),
			() => payload.delete(profiles),
			() => payload.update({ ...profiles, data: { mainPicture: null } }),
		])
			await expect(operation()).rejects.toThrow(ONE_AT_A_TIME_MESSAGE)

		const guarded = await stored(photo.id)
		expect(guarded).not.toBeNull()
		expect(guarded?.alt).not.toBe('Texte fictif')
		expect((await profileOf(account)).mainPicture).toBe(photo.id)
		expect(await bytes(key(photo))).toBeDefined()
		expect(await trash()).toEqual([])
	})
})

describe('Un test échoue si une suppression d’objet est appelée ; la remise en place est essayée une fois', () => {
	test('l’espion voit les requêtes du greffon de stockage : un envoi est un PutObject de sa clé', async () => {
		const account = await createAccount('maquilleuse')

		const media = await send(account)

		expect(spy.journal.filter(({ nom }) => nom === 'PutObject').map(({ entree }) => entree.Key)).toEqual([key(media)])
	})

	test('la panne au milieu de deux photos : la première, déjà déplacée, est remise en place une fois ; tout est comme avant', async () => {
		const account = await createAccount('maquilleuse')
		const [first, second] = [await send(account), await send(account)]
		await saveOrFail(account, { gallery: [first.id, second.id] })
		let copiesInTrash = 0
		spy.fairePanne(
			commande =>
				commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copiesInTrash === 2
		)

		const { statut: status } = await save(account, { gallery: [] })

		expect(status).toBe(503)
		expect((await profileOf(account)).gallery).toEqual([first.id, second.id])
		for (const media of [first, second]) {
			expect(await stored(media.id)).not.toBeNull()
			expect(await bytes(key(media))).toBeDefined()
			expect(await publicStatus(media)).toBe(200)
		}
		const reset = spy.journal.filter(
			commande => commande.nom === 'CopyObject' && sourceOf(commande).startsWith('deleted/')
		)
		expect(reset).toHaveLength(1)
	})

	test('une photo de la corbeille se remet en place : son adresse répond de nouveau 200, sa copie reste dans la corbeille', async () => {
		const account = await createAccount('maquilleuse')
		const [old, fresh] = [await send(account), await send(account)]
		await saveOrFail(account, { mainPicture: old.id })
		await saveOrFail(account, { mainPicture: fresh.id })
		const storage = serverEnv().storage
		if (!storage) throw new Error('Le banc n’a pas de stockage : lance les tests par « bun run test:integration ».')

		const summary = await restore(createObjectStorage(storage), [key(old)])

		expect(summary).toEqual({ remises: [key(old)], nonRemises: [] })
		expect(await publicStatus(old)).toBe(200)
		expect(await trash()).toEqual([`deleted/${key(old)}`])
	})
})

describe('Avec le contexte d’import, rien n’est déplacé', () => {
	test('un profil réécrit par l’import : l’ancienne photo et son média restent, aucun objet ne bouge', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const [old, fresh] = [await send(account), await send(account)]
		const profile = await profileOf(account)
		await payload.update({ collection: 'profiles', id: profile.id, data: { mainPicture: old.id } })
		const before = spy.journal.length

		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { mainPicture: fresh.id },
			context: IMPORT_CONTEXT,
		})

		expect((await profileOf(account)).mainPicture).toBe(fresh.id)
		expect(await stored(old.id)).not.toBeNull()
		expect(await bytes(key(old))).toBeDefined()
		expect(spy.journal.slice(before)).toEqual([])
	})

	test('un média supprimé sous le contexte d’import : son objet reste où il est', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const media = await send(account)
		const before = spy.journal.length

		await payload.delete({ collection: 'media', id: media.id, context: IMPORT_CONTEXT })

		expect(await stored(media.id)).toBeNull()
		expect(await bytes(key(media))).toBeDefined()
		expect(spy.journal.slice(before)).toEqual([])
	})

	test('l’import peut supprimer par un filtre : le média part, son objet reste où il est', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const media = await send(account)
		const before = spy.journal.length

		await payload.delete({ collection: 'media', where: { id: { equals: media.id } }, context: IMPORT_CONTEXT })

		expect(await stored(media.id)).toBeNull()
		expect(await bytes(key(media))).toBeDefined()
		expect(spy.journal.slice(before)).toEqual([])
	})
})
