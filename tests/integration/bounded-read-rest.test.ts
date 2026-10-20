import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { boundedListRead, REST_LIMIT_DEFAULT, REST_LIMIT_MAX } from '@/lib/bounded-query'
import type { Article, Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm, fileForPayload, photoName } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * The list reads over REST are capped (ticket 071, « Ajout du 14/10/2026 »): 100 documents at most
 * and 10 without a `limit`, for any account but `admin`. The local API (pages, sitemap, relation
 * checks, population of media) is not a request of a visitor and stays whole. The bench holds 101
 * of everything, one more than the cap.
 */

const TOTAL = REST_LIMIT_MAX + 1

let payload: Payload
let editor: Awaited<ReturnType<typeof createAccount<'redaction'>>>
let admin: Awaited<ReturnType<typeof createAccount<'admin'>>>
let artist: Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>
let profilesIdentifiers: number[]

/** `n` runs of `tache`, ten at a time. */
async function repeat<T>(n: number, tache: (i: number) => Promise<T>): Promise<T[]> {
	const output: T[] = []
	for (let start = 0; start < n; start += 10) {
		const batch = Array.from({ length: Math.min(10, n - start) }, (_, i) => tache(start + i))
		output.push(...(await Promise.all(batch)))
	}
	return output
}

beforeAll(async () => {
	payload = await testPayload()
	;[editor, admin, artist] = [
		await createAccount('redaction'),
		await createAccount('admin'),
		await createAccount('maquilleuse'),
	]
	// 101 published profiles, each of its own account (a speciality makes a profile no longer entirely empty).
	profilesIdentifiers = await repeat(TOTAL, async i => {
		const pro = await payload.create({
			collection: 'pros',
			data: { email: `bornes-${i}@example.test`, password: `Banc-${i}-${crypto.randomUUID()}`, name: `Bornée ${i}` },
			context: NO_PROFILE_CONTEXT,
		})
		const profile = await payload.create({
			collection: 'profiles',
			data: { pro: pro.id, slug: `borne-${i}`, firstName: 'Prénom', lastName: `Fictive ${i}`, specialty: 'Mariage' },
		})
		return profile.id
	})
	await repeat(TOTAL, async i => {
		await payload.create({
			collection: 'talents',
			data: { title: `Talent ${i}`, slug: `talent-borne-${i}`, _status: 'published' },
		})
		await payload.create({
			collection: 'articles',
			data: { title: `Article ${i}`, slug: `article-borne-${i}`, author: 'Rédaction fictive', _status: 'published' },
		})
		await payload.create({
			collection: 'payload-locked-documents',
			data: {
				document: { relationTo: 'profiles', value: profilesIdentifiers[i] ?? 0 },
				user: { relationTo: 'admins', value: Number(admin.id) },
			},
		})
	})
}, 180_000)

afterAll(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

interface List {
	docs: unknown[]
	totalDocs: number
	hasNextPage: boolean
}

async function read(chemin: string, enTetes: Record<string, string> = {}) {
	const { statut: status, corps } = await callRest('GET', chemin, { enTetes })
	return { statut: status, liste: corps as List }
}

describe('Anonyme : au plus 100 profils par lecture REST, 10 sans limit', () => {
	test('limit=0&pagination=false : 100 documents sur 101, une page suivante', async () => {
		const { statut: status, liste: list } = await read('/api/profiles?limit=0&pagination=false&depth=0')
		expect(status).toBe(200)
		expect(list.docs).toHaveLength(REST_LIMIT_MAX)
		expect(list.hasNextPage).toBe(true)
		expect(list.totalDocs).toBe(TOTAL)
	})

	test('limit=1000 puis limit=-1 : 100 au plus ; sans limit : 10 ; une limite entre les deux est respectée', async () => {
		for (const limit of [1000, -1, 101])
			expect((await read(`/api/profiles?limit=${limit}&depth=0`)).liste.docs, String(limit)).toHaveLength(100)
		expect((await read('/api/profiles?depth=0')).liste.docs).toHaveLength(REST_LIMIT_DEFAULT)
		expect((await read('/api/profiles?limit=7&depth=0')).liste.docs).toHaveLength(7)
		expect((await read('/api/profiles?limit=abc&depth=0')).liste.docs).toHaveLength(REST_LIMIT_DEFAULT)
	})

	test('la page 2 donne le reste : la lecture reste complète, page après page', async () => {
		const { liste: list } = await read('/api/profiles?limit=100&page=2&depth=0&sort=id')
		expect(list.docs).toHaveLength(1)
		expect(list.hasNextPage).toBe(false)
	})

	test('les articles et les talents ont le même plafond', async () => {
		for (const collection of ['articles', 'talents']) {
			const { liste: list } = await read(`/api/${collection}?limit=0&pagination=false&depth=0`)
			expect([collection, list.docs.length, list.totalDocs, list.hasNextPage]).toEqual([
				collection,
				REST_LIMIT_MAX,
				TOTAL,
				true,
			])
			expect((await read(`/api/${collection}?depth=0`)).liste.docs).toHaveLength(REST_LIMIT_DEFAULT)
		}
	})
})

describe('Les verrous de Payload et l’admin', () => {
	test('une maquilleuse connectée ne lit aucun verrou (ticket 094) ; la rédaction en lit au plus 100, 10 sans limit', async () => {
		const refusal = await read('/api/payload-locked-documents?limit=0&pagination=false&depth=0', artist.session.enTetes)
		expect(refusal.statut).toBe(403)
		const headers = editor.session.enTetes
		const all = await read('/api/payload-locked-documents?limit=0&pagination=false&depth=0', headers)
		expect(all.statut).toBe(200)
		expect(all.liste.docs).toHaveLength(REST_LIMIT_MAX)
		expect(all.liste.totalDocs).toBe(TOTAL)
		expect((await read('/api/payload-locked-documents?depth=0', headers)).liste.docs).toHaveLength(10)
	})

	test('l’admin lit tous les profils, sans plafond', async () => {
		const { statut: status, liste: list } = await read(
			'/api/profiles?limit=0&pagination=false&depth=0',
			admin.session.enTetes
		)
		expect(status).toBe(200)
		// The 101 profiles of this file, and the one of the makeup artist of the bench.
		expect(list.docs).toHaveLength(TOTAL + 1)
		expect(list.hasNextPage).toBe(false)
		expect((await read('/api/profiles?limit=1000&depth=0', admin.session.enTetes)).liste.docs).toHaveLength(TOTAL + 1)
	})

	test('la rédaction, qui n’est pas admin, est plafonnée comme tout le monde', async () => {
		const { liste: list } = await read('/api/profiles?limit=0&pagination=false&depth=0', editor.session.enTetes)
		expect(list.docs).toHaveLength(REST_LIMIT_MAX)
	})
})

describe('Les relations ne sont pas touchées par le plafond', () => {
	test('une maquilleuse enregistre par REST son profil avec sa photo principale et 10 photos de galerie', async () => {
		const headers = artist.session.enTetes
		const send = async (): Promise<number> => {
			const {
				statut: status,
				corps,
				texte: text,
			} = await callRest('POST', '/api/media?depth=0', {
				enTetes: headers,
				formulaire: formWithFile(fileForForm(photoName('profil')), { alt: 'Photo fictive' }),
			})
			if (status !== 201) throw new Error(`L’envoi a échoué : ${status} ${text}`)
			return (corps as { doc: Media }).doc.id
		}
		const photos = await repeat(11, send)
		const [main, ...gallery] = photos
		const profile = (
			await payload.find({ collection: 'profiles', depth: 0, limit: 1, where: { pro: { equals: artist.id } } })
		).docs[0]
		expect(profile).toBeDefined()

		const response = await callRest('PATCH', `/api/profiles/${profile?.id}?depth=0`, {
			enTetes: headers,
			corps: { mainPicture: main, gallery: gallery },
		})

		expect(response.statut).toBe(200)
		const stored = await payload.findByID({ collection: 'profiles', id: profile?.id ?? 0, depth: 0 })
		expect(stored.mainPicture).toBe(main ?? -1)
		expect(stored.gallery).toEqual(gallery)
	}, 60_000)

	test('la rédaction publie un article dont la galerie compte plus de 100 images, et une lecture en depth=1 les peuple toutes', async () => {
		const images = await repeat(TOTAL, async () =>
			payload.create({
				collection: 'media',
				data: { alt: 'Image fictive de la rédaction' },
				file: fileForPayload(photoName('galerie')),
			})
		)
		const identifiers = images.map(({ id }) => id)
		const headers = editor.session.enTetes

		const created = await callRest('POST', '/api/articles?depth=0', {
			enTetes: headers,
			corps: { title: 'Article à grande galerie', slug: 'grande-galerie', gallery: identifiers, _status: 'published' },
		})
		expect(created.statut).toBe(201)
		const id = (created.corps as { doc: Article }).doc.id
		const update = await callRest('PATCH', `/api/articles/${id}?depth=0`, {
			enTetes: headers,
			corps: { gallery: identifiers, _status: 'published' },
		})
		expect(update.statut).toBe(200)

		const readValue = await callRest('GET', `/api/articles/${id}?depth=1`, { enTetes: headers })
		const gallery = (readValue.corps as Article).gallery ?? []
		expect(gallery).toHaveLength(TOTAL)
		expect(gallery.every(media => typeof media === 'object' && typeof media.url === 'string')).toBe(true)
		// In a list too: the cap bounds the documents of the page, not what they hold.
		const list = await callRest('GET', '/api/articles?depth=1&where[slug][equals]=grande-galerie', { enTetes: headers })
		const document = (list.corps as { docs: Article[] }).docs[0]
		expect(document?.gallery?.every(media => typeof media === 'object')).toBe(true)
		expect(document?.gallery).toHaveLength(TOTAL)
	}, 120_000)
})

describe('Hors REST, rien n’est plafonné', () => {
	test('une lecture par l’API locale, comme celle du sitemap, rend tous les profils publiés', async () => {
		const profiles = await payload.find({
			collection: 'profiles',
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: false,
		})
		expect(profiles.docs.length).toBeGreaterThanOrEqual(TOTAL)
	})

	test('après onInit, l’endpoint borné est le premier GET / de chaque collection, celles de Payload comprises', () => {
		const slugs = Object.keys(payload.collections)
		expect(slugs).toEqual(expect.arrayContaining(['profiles', 'articles', 'talents', 'payload-locked-documents']))
		for (const [slug, { config }] of Object.entries(payload.collections)) {
			// A collection without any REST endpoint (the bookkeeping of the migrations) has no list to bound.
			if (config.endpoints === false) continue
			const endpoints = config.endpoints || []
			expect([slug, endpoints.find(e => e.method === 'get' && e.path === '/')]).toEqual([slug, boundedListRead])
		}
	})
})
