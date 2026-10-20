import { afterEach, describe, expect, test } from 'bun:test'
import type { Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm, fileForPayload, photoName } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { dropObject, emptyStorage, readObject } from '../support/s3'

/**
 * The media: their objects in the storage, their owner, their reading, and the photos of a profile
 * (ticket 043; plan 02 §7.3, I04; U56 and U80 through the real API).
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

type Account = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>

/** The base of the photos on the bench: the simulator serves its bucket under its own name. */
const base = () => `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`

/** A photo sent by this makeup artist through REST, as the site sends it: the media it created. */
async function send(compte: Account, champs: Record<string, unknown> = {}): Promise<Media> {
	const {
		statut: status,
		corps,
		texte: text,
	} = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(fileForForm(), champs),
	})
	if (status !== 201) throw new Error(`L’envoi de la photo a échoué : ${status} ${text}`)
	return (corps as { doc: Media }).doc
}

/** The profile of an account. */
async function profileOf(compte: Account) {
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profile) throw new Error('La fabrique n’a pas créé de profil.')
	return profile
}

/** A makeup artist, her profile in this status, with a main photo and a gallery of her own. */
async function artistWithPhotos(status: 'published' | 'hidden' | 'draft') {
	const account = await createAccount('maquilleuse')
	const [main, gallery] = [await send(account), await send(account)]
	const profile = await profileOf(account)
	const payload = await testPayload()
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { status, mainPicture: main.id, gallery: [gallery.id] },
	})
	return { compte: account, profil: profile, principale: main, galerie: gallery }
}

/** The media as the database holds it, read without access control. */
async function stored(id: number): Promise<Media | null> {
	const payload = await testPayload()
	return payload.findByID({ collection: 'media', id, depth: 0, disableErrors: true })
}

describe('Liste anonyme refusée ; média d’un profil publié lu ; d’un profil masqué introuvable (I04, U56)', () => {
	test('la liste : 403 ; la photo principale et la galerie d’un profil publié : 200 ; d’un profil masqué : 404', async () => {
		const published = await artistWithPhotos('published')
		const hidden = await artistWithPhotos('hidden')

		expect((await callRest('GET', '/api/media')).statut).toBe(403)
		for (const media of [published.principale, published.galerie]) {
			const { statut: status, corps } = await callRest('GET', `/api/media/${media.id}?depth=0`)
			expect(status).toBe(200)
			expect(corps).toMatchObject({ id: media.id, url: media.url, filename: media.filename })
			// Who owns it is not public.
			expect(corps).not.toHaveProperty('owner')
		}
		for (const media of [hidden.principale, hidden.galerie])
			expect((await callRest('GET', `/api/media/${media.id}`)).statut).toBe(404)
	})

	test('un profil publié puis masqué : sa photo devient introuvable', async () => {
		const { profil: profile, principale: main } = await artistWithPhotos('published')
		const admin = await createAccount('admin')
		expect((await callRest('GET', `/api/media/${main.id}`)).statut).toBe(200)

		// The admin hides it by her choice of status: the status itself is the server's (ticket 044).
		await callRest('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: admin.session.enTetes,
			corps: { chosenStatus: 'hidden' },
		})

		expect((await callRest('GET', `/api/media/${main.id}`)).statut).toBe(404)
	})

	test('un identifiant mal formé : refusé avant la base, jamais une erreur 500', async () => {
		const [artist, admin] = await Promise.all([createAccount('maquilleuse'), createAccount('admin')])
		const payload = await testPayload()

		for (const headers of [{}, artist.session.enTetes, admin.session.enTetes])
			for (const id of ['abc', 'wp-login.php', '1e999', '99999999999', '1.5']) {
				expect([id, (await callRest('GET', `/api/media/${id}`, { enTetes: headers })).statut]).toEqual([id, 403])
				// A change or a deletion: refused by the rule (403), or by Payload itself before it (400), when
				// it reads no identifier at all in the address (`abc` gives NaN, « Missing ID »).
				for (const response of [
					await callRest('PATCH', `/api/media/${id}`, { enTetes: headers, corps: { alt: 'Texte fictif' } }),
					await callRest('DELETE', `/api/media/${id}`, { enTetes: headers }),
				])
					expect([id, [400, 403].includes(response.statut)]).toEqual([id, true])
			}
		await expect(payload.findByID({ collection: 'media', id: 'abc', overrideAccess: false })).rejects.toMatchObject({
			status: 403,
		})
	})

	test('une photo envoyée mais rattachée à rien : introuvable pour le public, lue par sa propriétaire', async () => {
		const account = await createAccount('maquilleuse')
		const media = await send(account)

		expect((await callRest('GET', `/api/media/${media.id}`)).statut).toBe(404)
		const read = await callRest('GET', `/api/media/${media.id}?depth=0`, { enTetes: account.session.enTetes })
		expect(read.statut).toBe(200)
		expect(read.corps).toMatchObject({ owner: Number(account.id) })
	})
})

describe('Le propriétaire est la maquilleuse qui envoie, même si elle en déclare un autre', () => {
	test('par REST : le propriétaire déclaré est ignoré', async () => {
		const [a, b] = await Promise.all([createAccount('maquilleuse'), createAccount('maquilleuse')])

		const media = await send(a, { alt: 'Une photo fictive', owner: Number(b.id) })

		expect((await stored(media.id))?.owner).toBe(Number(a.id))
	})

	test('par l’API locale avec les règles actives : de même', async () => {
		const [a, b] = await Promise.all([createAccount('maquilleuse'), createAccount('maquilleuse')])
		const payload = await testPayload()
		const user = await payload.findByID({ collection: 'pros', id: a.id, depth: 0 })

		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(b.id) },
			file: fileForPayload(),
			overrideAccess: false,
			user: { ...user, collection: 'pros' },
		})

		expect((await stored(media.id))?.owner).toBe(Number(a.id))
	})
})

describe('A ne rattache ni ne supprime un média de B ; galerie de 11 photos refusée', () => {
	test('la photo de B en photo principale ou dans la galerie de A : refusée en français, rien ne change', async () => {
		const [a, b] = await Promise.all([createAccount('maquilleuse'), createAccount('maquilleuse')])
		const [hers, ofB] = [await send(a), await send(b)]
		const profile = await profileOf(a)

		for (const corps of [{ mainPicture: ofB.id }, { gallery: [hers.id, ofB.id] }]) {
			const { statut: status, texte: text } = await callRest('PATCH', `/api/profiles/${profile.id}`, {
				enTetes: a.session.enTetes,
				corps,
			})
			expect(status).toBe(400)
			expect(text).toContain('Choisis à nouveau ta photo')
		}
		expect(await profileOf(a)).toMatchObject({ mainPicture: null, gallery: [] })
	})

	test('A supprime la photo de B : refusé, la photo et son objet restent', async () => {
		const [a, b] = await Promise.all([createAccount('maquilleuse'), createAccount('maquilleuse')])
		const ofB = await send(b)

		const { statut: status } = await callRest('DELETE', `/api/media/${ofB.id}`, { enTetes: a.session.enTetes })

		expect([403, 404]).toContain(status)
		expect(await stored(ofB.id)).not.toBeNull()
		expect(await readObject(`media/${ofB.filename}`)).toBeDefined()
	})

	test('11 photos dans la gallery : refusé ; 10 : enregistrées dans l’ordre donné, gardé à la relecture', async () => {
		const a = await createAccount('maquilleuse')
		const photos: Media[] = []
		for (let i = 0; i < 11; i += 1) photos.push(await send(a))
		const profile = await profileOf(a)
		const ids = photos.map(({ id }) => id)

		const eleven = await callRest('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: a.session.enTetes,
			corps: { gallery: ids },
		})
		expect(eleven.statut).toBe(400)
		expect(eleven.texte).toContain('Ton portfolio contient déjà 10 photos')
		expect((await profileOf(a)).gallery).toEqual([])

		const ten = ids.slice(0, 10).reverse()
		const saved = await callRest('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: a.session.enTetes,
			corps: { gallery: ten },
		})
		expect(saved.statut).toBe(200)
		expect((await profileOf(a)).gallery).toEqual(ten)
	})
})

describe('Adresse publique = préfixe du document + nom de fichier, à la racine comme sous préfixe', () => {
	test('une photo envoyée : rangée sous media/ dans le stockage, son adresse est la base, media/, puis son nom', async () => {
		const a = await createAccount('maquilleuse')

		const media = await send(a)

		expect(media.prefix).toBe('media')
		expect(media.url).toBe(`${base()}/media/${media.filename}`)
		expect((await readObject(`media/${media.filename}`))?.type).toBe('image/png')
	})

	test('une photo de l’ancien site adoptée où elle est, à la racine ou sous son préfixe : son adresse suit', async () => {
		const payload = await testPayload()
		const [root, underPrefix] = [photoName('racine'), photoName('ancienne')]
		// The objects are already in the storage, as those of the old site: nothing is copied.
		await dropObject(root, 'octets fictifs', { type: 'image/png' })
		await dropObject(`uploads/${underPrefix}`, 'octets fictifs', { type: 'image/png' })

		// As the import will adopt them (ticket 058): by the server, without a session, without touching the storage.
		const adopt = (nom: string, prefix: string) =>
			payload.create({
				collection: 'media',
				data: { prefix },
				file: fileForPayload(nom),
				context: { skipCloudStorage: true },
			})
		const [atRoot, underItsPrefix] = [await adopt(root, ''), await adopt(underPrefix, 'uploads')]

		expect(atRoot.url).toBe(`${base()}/${root}`)
		expect(underItsPrefix.url).toBe(`${base()}/uploads/${underPrefix}`)
		for (const media of [atRoot, underItsPrefix]) {
			const key = (media.url ?? '').slice(base().length + 1)
			expect(await readObject(key)).toBeDefined()
		}
		// Nothing was written next to them.
		expect(await readObject(`media/${root}`)).toBeUndefined()
	})

	test('la route de fichier de Payload renvoie vers l’adresse publique, jamais vers le disque du serveur', async () => {
		const { compte: account, principale: main } = await artistWithPhotos('published')
		const [admin, other] = await Promise.all([createAccount('admin'), createAccount('maquilleuse')])
		const path = `/api/media/file/${main.filename}`

		// Her own photo, or any photo for admin: a redirection to its public address.
		for (const reader of [account, admin]) {
			const { statut: status, enTetes: headers } = await callRest('GET', path, { enTetes: reader.session.enTetes })
			expect(status).toBe(302)
			expect(headers.get('location')).toBe(`${base()}/media/${main.filename}`)
		}
		// With the prefix Payload accepts in the query: the same.
		const withPrefix = await callRest('GET', `${path}?prefix=media`, { enTetes: admin.session.enTetes })
		expect([withPrefix.statut, withPrefix.enTetes.get('location')]).toEqual([302, main.url ?? ''])
		// The route lists no media by name: refused to the public and to another makeup artist.
		expect((await callRest('GET', path)).statut).toBe(403)
		expect((await callRest('GET', path, { enTetes: other.session.enTetes })).statut).toBe(403)
		// A name no media has: not found. A prefix it does not have: refused by Payload itself.
		expect((await callRest('GET', '/api/media/file/inconnue.png', { enTetes: admin.session.enTetes })).statut).toBe(404)
		expect((await callRest('GET', `${path}?prefix=ailleurs`, { enTetes: admin.session.enTetes })).statut).toBe(403)
	})

	test('une maquilleuse ne choisit ni le préfixe ni le nom de l’objet de sa photo', async () => {
		const a = await createAccount('maquilleuse')

		const media = await send(a, { prefix: 'ailleurs', filename: 'autre-nom.png', url: 'https://exemple.test/x' })
		const modified = await callRest('PATCH', `/api/media/${media.id}`, {
			enTetes: a.session.enTetes,
			corps: { prefix: '', filename: 'autre-nom.png', alt: 'Nouveau texte' },
		})

		expect(modified.statut).toBe(200)
		expect(await stored(media.id)).toMatchObject({
			prefix: 'media',
			filename: media.filename,
			alt: 'Nouveau texte',
		})
		expect(media.url).toBe(`${base()}/media/${media.filename}`)
	})
})
