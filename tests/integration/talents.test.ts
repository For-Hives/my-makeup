import { afterEach, describe, expect, test } from 'bun:test'
import type { RequiredDataFromCollectionSlug } from 'payload'
import { readTalent } from '@/services/public/talents'
import { creerCompte } from '../support/account-factory'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { appelerRest } from '../support/rest'

/**
 * The talents (ticket 022): the public reads what is published, and nothing else, whatever the
 * way it asks; the newsroom writes; each talent keeps its own slug. The access matrix plays who may
 * do what (tests/integration/payload-acces.test.ts); this file looks at what each reading gives.
 */

/** A talent as the import writes it: through the Local API, without access control. */
async function ecrireTalent(donnees: Partial<RequiredDataFromCollectionSlug<'talents'>> & { slug: string }) {
	const payload = await payloadDeTest()
	return payload.create({
		collection: 'talents',
		data: {
			title: `Talent ${donnees.slug}`,
			content: '## Un talent\n\nUne page fictive du banc de test.\n',
			_status: 'published',
			...donnees,
		},
	})
}

interface Liste {
	docs: { id: number; slug: string; title: string; strapiId?: number }[]
	totalDocs: number
}

/** A REST read, with its status and its body. */
async function lire(chemin: string, enTetes: Record<string, string> = {}) {
	const { statut, corps } = await appelerRest('GET', chemin, { enTetes })
	return { statut, corps: corps as Liste & { id?: number; title?: string; strapiId?: number } }
}

/** The slugs a REST list gives. */
const slugsDe = (corps: Liste) => corps.docs.map(({ slug }) => slug).sort()

afterEach(viderLaBase)

describe('Lecture anonyme : talent publié lu, brouillon introuvable', () => {
	test('la liste, la lecture par identifiant et la recherche par slug ne rendent que le talent publié', async () => {
		const publie = await ecrireTalent({ slug: 'maquillage-mariee' })
		const brouillon = await ecrireTalent({ slug: 'maquillage-fx', _status: 'draft' })

		const liste = await lire('/api/talents?depth=0')
		expect(liste.statut).toBe(200)
		expect(slugsDe(liste.corps)).toEqual(['maquillage-mariee'])

		expect((await lire(`/api/talents/${publie.id}`)).corps.title).toBe('Talent maquillage-mariee')
		expect((await lire(`/api/talents/${brouillon.id}`)).statut).toBe(404)

		// What the talent page will ask: the talent of a slug.
		expect((await lire('/api/talents?where[slug][equals]=maquillage-mariee')).corps.totalDocs).toBe(1)
		expect((await lire('/api/talents?where[slug][equals]=maquillage-fx')).corps.totalDocs).toBe(0)
	})

	test('demander les brouillons (?draft=true) ne rend rien de plus, ni à un anonyme ni à une maquilleuse', async () => {
		const brouillon = await ecrireTalent({ slug: 'maquillage-fx', _status: 'draft' })
		await ecrireTalent({ slug: 'maquillage-mariee' })
		const maquilleuse = await creerCompte('maquilleuse')

		for (const enTetes of [{}, maquilleuse.session.enTetes]) {
			expect(slugsDe((await lire('/api/talents?draft=true', enTetes)).corps)).toEqual(['maquillage-mariee'])
			expect((await lire(`/api/talents/${brouillon.id}?draft=true`, enTetes)).statut).toBe(404)
		}
	})

	test('un talent publié qui a un brouillon en cours se lit dans sa version publiée', async () => {
		const publie = await ecrireTalent({ slug: 'maquillage-mariee', title: 'Maquillage de mariée' })
		const redaction = await creerCompte('redaction')

		const brouillon = await appelerRest('PATCH', `/api/talents/${publie.id}?draft=true`, {
			enTetes: redaction.session.enTetes,
			corps: { title: 'Titre en cours d’écriture' },
		})
		expect(brouillon.statut).toBe(200)

		for (const chemin of [`/api/talents/${publie.id}`, `/api/talents/${publie.id}?draft=true`])
			expect((await lire(chemin)).corps.title).toBe('Maquillage de mariée')
		expect((await lire('/api/talents')).corps.docs.map(({ title }) => title)).toEqual(['Maquillage de mariée'])
		// A list of drafts reads the latest version of each talent: here a draft, so it is left out.
		expect((await lire('/api/talents?draft=true')).corps.docs).toEqual([])
		// The newsroom reads its draft.
		const lu = await lire(`/api/talents/${publie.id}?draft=true`, redaction.session.enTetes)
		expect(lu.corps.title).toBe('Titre en cours d’écriture')
	})

	test('les versions, brouillons compris, ne se lisent que par la rédaction', async () => {
		const publie = await ecrireTalent({ slug: 'maquillage-mariee' })
		const [maquilleuse, redaction, admin] = await Promise.all([
			creerCompte('maquilleuse'),
			creerCompte('redaction'),
			creerCompte('admin'),
		])

		for (const enTetes of [{}, maquilleuse.session.enTetes]) {
			expect((await lire('/api/talents/versions', enTetes)).statut).toBe(403)
			const versions = await appelerRest('GET', `/api/talents/versions?where[parent][equals]=${publie.id}`, {
				enTetes,
			})
			expect(versions.statut).toBe(403)
		}
		for (const enTetes of [redaction.session.enTetes, admin.session.enTetes]) {
			const versions = await lire('/api/talents/versions', enTetes)
			expect(versions.statut).toBe(200)
			expect(versions.corps.totalDocs).toBeGreaterThan(0)
		}
	})

	test('l’identifiant de l’ancien site ne sort que pour la rédaction', async () => {
		const publie = await ecrireTalent({ slug: 'maquillage-mariee', strapiId: 3 })
		const redaction = await creerCompte('redaction')

		const anonyme = await lire(`/api/talents/${publie.id}`)
		expect(anonyme.statut).toBe(200)
		expect(Object.keys(anonyme.corps)).not.toContain('strapiId')
		expect(Object.keys((await lire('/api/talents')).corps.docs[0] ?? {})).not.toContain('strapiId')
		expect((await lire(`/api/talents/${publie.id}`, redaction.session.enTetes)).corps.strapiId).toBe(3)
	})

	test('dépublié par la rédaction, le talent n’est plus lu par le public', async () => {
		const publie = await ecrireTalent({ slug: 'maquillage-mariee' })
		const redaction = await creerCompte('redaction')

		const depublie = await appelerRest('PATCH', `/api/talents/${publie.id}`, {
			enTetes: redaction.session.enTetes,
			corps: { _status: 'draft' },
		})
		expect(depublie.statut).toBe(200)
		expect((await lire(`/api/talents/${publie.id}`)).statut).toBe(404)
		expect((await lire('/api/talents')).corps.totalDocs).toBe(0)
	})
})

describe('Deux talents ne peuvent pas avoir le même slug', () => {
	test('la rédaction ne crée pas un second talent sur un slug pris, publié ou brouillon', async () => {
		await ecrireTalent({ slug: 'maquillage-mariee' })
		const redaction = await creerCompte('redaction')
		const payload = await payloadDeTest()

		for (const chemin of ['/api/talents', '/api/talents?draft=true']) {
			const { statut } = await appelerRest('POST', chemin, {
				enTetes: redaction.session.enTetes,
				corps: { title: 'Doublon', slug: 'maquillage-mariee', _status: 'published' },
			})
			expect(statut).toBe(400)
		}
		expect((await payload.count({ collection: 'talents' })).totalDocs).toBe(1)
	})

	test('l’import non plus : un slug repris en double est refusé, jamais renommé', async () => {
		await ecrireTalent({ slug: 'maquillage-mariee', strapiId: 1 })
		const payload = await payloadDeTest()

		await expect(ecrireTalent({ slug: 'maquillage-mariee', strapiId: 2 })).rejects.toThrow()
		const { docs } = await payload.find({ collection: 'talents', depth: 0 })
		expect(docs.map(({ slug, strapiId }) => [slug, strapiId])).toEqual([['maquillage-mariee', 1]])
	})

	test('changer le slug d’un talent pour celui d’un autre est refusé, et rien ne change', async () => {
		await ecrireTalent({ slug: 'maquillage-mariee' })
		const autre = await ecrireTalent({ slug: 'maquillage-fx' })
		const redaction = await creerCompte('redaction')

		const { statut } = await appelerRest('PATCH', `/api/talents/${autre.id}`, {
			enTetes: redaction.session.enTetes,
			corps: { slug: 'maquillage-mariee' },
		})
		expect(statut).toBe(400)
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'talents', id: autre.id })).slug).toBe('maquillage-fx')
	})

	test('un slug qui n’a pas la forme d’une adresse est refusé à la publication, avec la bonne forme proposée', async () => {
		const redaction = await creerCompte('redaction')

		const { statut, texte } = await appelerRest('POST', '/api/talents', {
			enTetes: redaction.session.enTetes,
			corps: { title: 'Maquillage de mariée', slug: 'Maquillage Mariée', _status: 'published' },
		})
		expect(statut).toBe(400)
		expect(texte).toContain('« maquillage-mariee »')

		const sansSlug = await appelerRest('POST', '/api/talents', {
			enTetes: redaction.session.enTetes,
			corps: { title: 'Maquillage de mariée', _status: 'published' },
		})
		expect(sansSlug.statut).toBe(400)
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'talents' })).totalDocs).toBe(0)
	})
})

describe('La date de la première publication', () => {
	test('un brouillon n’en a pas ; la publication l’écrit ; une modification la garde', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		const cree = await appelerRest('POST', '/api/talents?draft=true', {
			enTetes,
			// Sent by a request, the date is ignored.
			corps: { title: 'Maquillage FX', slug: 'maquillage-fx', publishedAt: '2020-01-01T00:00:00.000Z' },
		})
		expect(cree.statut).toBe(201)
		const id = (cree.corps as { doc: { id: number; publishedAt?: string | null } }).doc.id
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'talents', id })).publishedAt ?? null).toBeNull()

		await appelerRest('PATCH', `/api/talents/${id}`, { enTetes, corps: { _status: 'published' } })
		const publie = await payload.findByID({ collection: 'talents', id })
		expect(publie._status).toBe('published')
		expect(Date.now() - Date.parse(String(publie.publishedAt))).toBeLessThan(60_000)

		await appelerRest('PATCH', `/api/talents/${id}`, { enTetes, corps: { title: 'Maquillage à effets spéciaux' } })
		expect((await payload.findByID({ collection: 'talents', id })).publishedAt).toBe(publie.publishedAt)
	})

	test('la date que donne l’import est gardée', async () => {
		const talent = await ecrireTalent({ slug: 'maquillage-mariee', publishedAt: '2023-04-01T09:00:00.000Z' })
		expect(talent.publishedAt).toBe('2023-04-01T09:00:00.000Z')
	})
})

describe('Le titre de la page d’un talent (ticket 108)', () => {
	const TITRE_DE_55 = 'Maquillage fictif : une maquilleuse près de chez vous'

	test('de 50 à 60 caractères, différent du h1 : enregistré, lu par la lecture publique ; sinon refusé en français', async () => {
		expect(TITRE_DE_55.length).toBe(53)
		const talent = await ecrireTalent({
			slug: 'maquillage-fictif',
			seo_title: 'Maquillage fictif',
			pageTitle: TITRE_DE_55,
		})
		const payload = await payloadDeTest()
		const lu = await readTalent(payload, 'maquillage-fictif')
		expect(lu).toMatchObject({ titreDeLaPage: TITRE_DE_55, titreAffiche: 'Maquillage fictif' })

		await expect(
			payload.update({ collection: 'talents', id: talent.id, data: { pageTitle: 'Trop court' } })
		).rejects.toThrow()
		await expect(
			payload.update({ collection: 'talents', id: talent.id, data: { pageTitle: 'x'.repeat(61) } })
		).rejects.toThrow()
		await expect(
			payload.update({ collection: 'talents', id: talent.id, data: { seo_title: TITRE_DE_55 } })
		).rejects.toThrow()
		// Left empty, nothing is refused: the page keeps the title of the site online.
		await payload.update({ collection: 'talents', id: talent.id, data: { pageTitle: '' } })
		expect((await readTalent(payload, 'maquillage-fictif'))?.titreDeLaPage).toBe('')
	})

	test('un brouillon n’est pas lu par la page, un anonyme ne lit que le publié', async () => {
		await ecrireTalent({ slug: 'maquillage-fx', _status: 'draft' })
		expect(await readTalent(await payloadDeTest(), 'maquillage-fx')).toBeNull()
	})
})
