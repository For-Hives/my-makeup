import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { boundedListRead, REST_LIMIT_DEFAULT, REST_LIMIT_MAX } from '@/lib/bounded-query'
import type { Article, Media } from '@/payload-types'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourFormulaire, fichierPourPayload, nomDePhoto } from '../outils/photos'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'

/**
 * The list reads over REST are capped (ticket 071, « Ajout du 14/10/2026 »): 100 documents at most
 * and 10 without a `limit`, for any account but `admin`. The local API (pages, sitemap, relation
 * checks, population of media) is not a request of a visitor and stays whole. The bench holds 101
 * of everything, one more than the cap.
 */

const TOTAL = REST_LIMIT_MAX + 1

let payload: Payload
let redaction: Awaited<ReturnType<typeof creerCompte<'redaction'>>>
let admin: Awaited<ReturnType<typeof creerCompte<'admin'>>>
let maquilleuse: Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>
let identifiantsDesProfils: number[]

/** `n` runs of `tache`, ten at a time. */
async function repeter<T>(n: number, tache: (i: number) => Promise<T>): Promise<T[]> {
	const sortie: T[] = []
	for (let debut = 0; debut < n; debut += 10) {
		const lot = Array.from({ length: Math.min(10, n - debut) }, (_, i) => tache(debut + i))
		sortie.push(...(await Promise.all(lot)))
	}
	return sortie
}

beforeAll(async () => {
	payload = await payloadDeTest()
	;[redaction, admin, maquilleuse] = [
		await creerCompte('redaction'),
		await creerCompte('admin'),
		await creerCompte('maquilleuse'),
	]
	// 101 published profiles, each of its own account (a speciality makes a profile no longer entirely empty).
	identifiantsDesProfils = await repeter(TOTAL, async i => {
		const pro = await payload.create({
			collection: 'pros',
			data: { email: `bornes-${i}@example.test`, password: `Banc-${i}-${crypto.randomUUID()}`, name: `Bornée ${i}` },
			context: NO_PROFILE_CONTEXT,
		})
		const profil = await payload.create({
			collection: 'profiles',
			data: { pro: pro.id, slug: `borne-${i}`, firstName: 'Prénom', lastName: `Fictive ${i}`, specialty: 'Mariage' },
		})
		return profil.id
	})
	await repeter(TOTAL, async i => {
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
				document: { relationTo: 'profiles', value: identifiantsDesProfils[i] ?? 0 },
				user: { relationTo: 'admins', value: Number(admin.id) },
			},
		})
	})
}, 180_000)

afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

interface Liste {
	docs: unknown[]
	totalDocs: number
	hasNextPage: boolean
}

async function lire(chemin: string, enTetes: Record<string, string> = {}) {
	const { statut, corps } = await appelerRest('GET', chemin, { enTetes })
	return { statut, liste: corps as Liste }
}

describe('Anonyme : au plus 100 profils par lecture REST, 10 sans limit', () => {
	test('limit=0&pagination=false : 100 documents sur 101, une page suivante', async () => {
		const { statut, liste } = await lire('/api/profiles?limit=0&pagination=false&depth=0')
		expect(statut).toBe(200)
		expect(liste.docs).toHaveLength(REST_LIMIT_MAX)
		expect(liste.hasNextPage).toBe(true)
		expect(liste.totalDocs).toBe(TOTAL)
	})

	test('limit=1000 puis limit=-1 : 100 au plus ; sans limit : 10 ; une limite entre les deux est respectée', async () => {
		for (const limite of [1000, -1, 101])
			expect((await lire(`/api/profiles?limit=${limite}&depth=0`)).liste.docs, String(limite)).toHaveLength(100)
		expect((await lire('/api/profiles?depth=0')).liste.docs).toHaveLength(REST_LIMIT_DEFAULT)
		expect((await lire('/api/profiles?limit=7&depth=0')).liste.docs).toHaveLength(7)
		expect((await lire('/api/profiles?limit=abc&depth=0')).liste.docs).toHaveLength(REST_LIMIT_DEFAULT)
	})

	test('la page 2 donne le reste : la lecture reste complète, page après page', async () => {
		const { liste } = await lire('/api/profiles?limit=100&page=2&depth=0&sort=id')
		expect(liste.docs).toHaveLength(1)
		expect(liste.hasNextPage).toBe(false)
	})

	test('les articles et les talents ont le même plafond', async () => {
		for (const collection of ['articles', 'talents']) {
			const { liste } = await lire(`/api/${collection}?limit=0&pagination=false&depth=0`)
			expect([collection, liste.docs.length, liste.totalDocs, liste.hasNextPage]).toEqual([
				collection,
				REST_LIMIT_MAX,
				TOTAL,
				true,
			])
			expect((await lire(`/api/${collection}?depth=0`)).liste.docs).toHaveLength(REST_LIMIT_DEFAULT)
		}
	})
})

describe('Les verrous de Payload et l’admin', () => {
	test('une maquilleuse connectée ne lit aucun verrou (ticket 094) ; la rédaction en lit au plus 100, 10 sans limit', async () => {
		const refus = await lire(
			'/api/payload-locked-documents?limit=0&pagination=false&depth=0',
			maquilleuse.session.enTetes
		)
		expect(refus.statut).toBe(403)
		const enTetes = redaction.session.enTetes
		const tout = await lire('/api/payload-locked-documents?limit=0&pagination=false&depth=0', enTetes)
		expect(tout.statut).toBe(200)
		expect(tout.liste.docs).toHaveLength(REST_LIMIT_MAX)
		expect(tout.liste.totalDocs).toBe(TOTAL)
		expect((await lire('/api/payload-locked-documents?depth=0', enTetes)).liste.docs).toHaveLength(10)
	})

	test('l’admin lit tous les profils, sans plafond', async () => {
		const { statut, liste } = await lire('/api/profiles?limit=0&pagination=false&depth=0', admin.session.enTetes)
		expect(statut).toBe(200)
		// The 101 profiles of this file, and the one of the makeup artist of the bench.
		expect(liste.docs).toHaveLength(TOTAL + 1)
		expect(liste.hasNextPage).toBe(false)
		expect((await lire('/api/profiles?limit=1000&depth=0', admin.session.enTetes)).liste.docs).toHaveLength(TOTAL + 1)
	})

	test('la rédaction, qui n’est pas admin, est plafonnée comme tout le monde', async () => {
		const { liste } = await lire('/api/profiles?limit=0&pagination=false&depth=0', redaction.session.enTetes)
		expect(liste.docs).toHaveLength(REST_LIMIT_MAX)
	})
})

describe('Les relations ne sont pas touchées par le plafond', () => {
	test('une maquilleuse enregistre par REST son profil avec sa photo principale et 10 photos de galerie', async () => {
		const enTetes = maquilleuse.session.enTetes
		const envoyer = async (): Promise<number> => {
			const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
				enTetes,
				formulaire: formulaireAvecFichier(fichierPourFormulaire(nomDePhoto('profil')), { alt: 'Photo fictive' }),
			})
			if (statut !== 201) throw new Error(`L’envoi a échoué : ${statut} ${texte}`)
			return (corps as { doc: Media }).doc.id
		}
		const photos = await repeter(11, envoyer)
		const [principale, ...galerie] = photos
		const profil = (
			await payload.find({ collection: 'profiles', depth: 0, limit: 1, where: { pro: { equals: maquilleuse.id } } })
		).docs[0]
		expect(profil).toBeDefined()

		const reponse = await appelerRest('PATCH', `/api/profiles/${profil?.id}?depth=0`, {
			enTetes,
			corps: { mainPicture: principale, gallery: galerie },
		})

		expect(reponse.statut).toBe(200)
		const stocke = await payload.findByID({ collection: 'profiles', id: profil?.id ?? 0, depth: 0 })
		expect(stocke.mainPicture).toBe(principale ?? -1)
		expect(stocke.gallery).toEqual(galerie)
	}, 60_000)

	test('la rédaction publie un article dont la galerie compte plus de 100 images, et une lecture en depth=1 les peuple toutes', async () => {
		const images = await repeter(TOTAL, async () =>
			payload.create({
				collection: 'media',
				data: { alt: 'Image fictive de la rédaction' },
				file: fichierPourPayload(nomDePhoto('galerie')),
			})
		)
		const identifiants = images.map(({ id }) => id)
		const enTetes = redaction.session.enTetes

		const cree = await appelerRest('POST', '/api/articles?depth=0', {
			enTetes,
			corps: { title: 'Article à grande galerie', slug: 'grande-galerie', gallery: identifiants, _status: 'published' },
		})
		expect(cree.statut).toBe(201)
		const id = (cree.corps as { doc: Article }).doc.id
		const maj = await appelerRest('PATCH', `/api/articles/${id}?depth=0`, {
			enTetes,
			corps: { gallery: identifiants, _status: 'published' },
		})
		expect(maj.statut).toBe(200)

		const lue = await appelerRest('GET', `/api/articles/${id}?depth=1`, { enTetes })
		const galerie = (lue.corps as Article).gallery ?? []
		expect(galerie).toHaveLength(TOTAL)
		expect(galerie.every(media => typeof media === 'object' && typeof media.url === 'string')).toBe(true)
		// In a list too: the cap bounds the documents of the page, not what they hold.
		const liste = await appelerRest('GET', '/api/articles?depth=1&where[slug][equals]=grande-galerie', { enTetes })
		const document = (liste.corps as { docs: Article[] }).docs[0]
		expect(document?.gallery?.every(media => typeof media === 'object')).toBe(true)
		expect(document?.gallery).toHaveLength(TOTAL)
	}, 120_000)
})

describe('Hors REST, rien n’est plafonné', () => {
	test('une lecture par l’API locale, comme celle du sitemap, rend tous les profils publiés', async () => {
		const profils = await payload.find({
			collection: 'profiles',
			depth: 0,
			limit: 0,
			pagination: false,
			overrideAccess: false,
		})
		expect(profils.docs.length).toBeGreaterThanOrEqual(TOTAL)
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
