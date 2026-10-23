import { afterEach, describe, expect, test } from 'bun:test'
import type { RequiredDataFromCollectionSlug } from 'payload'
import { readTalent } from '@/services/public/talents'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The talents (ticket 022): the public reads what is published, and nothing else, whatever the
 * way it asks; the newsroom writes; each talent keeps its own slug. The access matrix plays who may
 * do what (tests/integration/payload-access.test.ts); this file looks at what each reading gives.
 */

/** A talent as the import writes it: through the Local API, without access control. */
async function writeTalent(donnees: Partial<RequiredDataFromCollectionSlug<'talents'>> & { slug: string }) {
	const payload = await testPayload()
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

interface List {
	docs: { id: number; slug: string; title: string; strapiId?: number }[]
	totalDocs: number
}

/** A REST read, with its status and its body. */
async function read(chemin: string, enTetes: Record<string, string> = {}) {
	const { statut: status, corps } = await callRest('GET', chemin, { enTetes })
	return { statut: status, corps: corps as List & { id?: number; title?: string; strapiId?: number } }
}

/** The slugs a REST list gives. */
const slugsOf = (corps: List) => corps.docs.map(({ slug }) => slug).sort()

afterEach(emptyBase)

describe('Lecture anonyme : talent publié lu, brouillon introuvable', () => {
	test('la liste, la lecture par identifiant et la recherche par slug ne rendent que le talent publié', async () => {
		const published = await writeTalent({ slug: 'maquillage-mariee' })
		const draft = await writeTalent({ slug: 'maquillage-fx', _status: 'draft' })

		const list = await read('/api/talents?depth=0')
		expect(list.statut).toBe(200)
		expect(slugsOf(list.corps)).toEqual(['maquillage-mariee'])

		expect((await read(`/api/talents/${published.id}`)).corps.title).toBe('Talent maquillage-mariee')
		expect((await read(`/api/talents/${draft.id}`)).statut).toBe(404)

		// What the talent page will ask: the talent of a slug.
		expect((await read('/api/talents?where[slug][equals]=maquillage-mariee')).corps.totalDocs).toBe(1)
		expect((await read('/api/talents?where[slug][equals]=maquillage-fx')).corps.totalDocs).toBe(0)
	})

	test('demander les brouillons (?draft=true) ne rend rien de plus, ni à un anonyme ni à une maquilleuse', async () => {
		const draft = await writeTalent({ slug: 'maquillage-fx', _status: 'draft' })
		await writeTalent({ slug: 'maquillage-mariee' })
		const artist = await createAccount('maquilleuse')

		for (const headers of [{}, artist.session.enTetes]) {
			expect(slugsOf((await read('/api/talents?draft=true', headers)).corps)).toEqual(['maquillage-mariee'])
			expect((await read(`/api/talents/${draft.id}?draft=true`, headers)).statut).toBe(404)
		}
	})

	test('un talent publié qui a un brouillon en cours se lit dans sa version publiée', async () => {
		const published = await writeTalent({ slug: 'maquillage-mariee', title: 'Maquillage de mariée' })
		const editor = await createAccount('redaction')

		const draft = await callRest('PATCH', `/api/talents/${published.id}?draft=true`, {
			enTetes: editor.session.enTetes,
			corps: { title: 'Titre en cours d’écriture' },
		})
		expect(draft.statut).toBe(200)

		for (const path of [`/api/talents/${published.id}`, `/api/talents/${published.id}?draft=true`])
			expect((await read(path)).corps.title).toBe('Maquillage de mariée')
		expect((await read('/api/talents')).corps.docs.map(({ title }) => title)).toEqual(['Maquillage de mariée'])
		// A list of drafts reads the latest version of each talent: here a draft, so it is left out.
		expect((await read('/api/talents?draft=true')).corps.docs).toEqual([])
		// The newsroom reads its draft.
		const fetched = await read(`/api/talents/${published.id}?draft=true`, editor.session.enTetes)
		expect(fetched.corps.title).toBe('Titre en cours d’écriture')
	})

	test('les versions, brouillons compris, ne se lisent que par la rédaction', async () => {
		const published = await writeTalent({ slug: 'maquillage-mariee' })
		const [artist, editor, admin] = await Promise.all([
			createAccount('maquilleuse'),
			createAccount('redaction'),
			createAccount('admin'),
		])

		for (const headers of [{}, artist.session.enTetes]) {
			expect((await read('/api/talents/versions', headers)).statut).toBe(403)
			const versions = await callRest('GET', `/api/talents/versions?where[parent][equals]=${published.id}`, {
				enTetes: headers,
			})
			expect(versions.statut).toBe(403)
		}
		for (const headers of [editor.session.enTetes, admin.session.enTetes]) {
			const versions = await read('/api/talents/versions', headers)
			expect(versions.statut).toBe(200)
			expect(versions.corps.totalDocs).toBeGreaterThan(0)
		}
	})

	test('l’identifiant de l’ancien site ne sort que pour la rédaction', async () => {
		const published = await writeTalent({ slug: 'maquillage-mariee', strapiId: 3 })
		const editor = await createAccount('redaction')

		const anonymous = await read(`/api/talents/${published.id}`)
		expect(anonymous.statut).toBe(200)
		expect(Object.keys(anonymous.corps)).not.toContain('strapiId')
		expect(Object.keys((await read('/api/talents')).corps.docs[0] ?? {})).not.toContain('strapiId')
		expect((await read(`/api/talents/${published.id}`, editor.session.enTetes)).corps.strapiId).toBe(3)
	})

	test('dépublié par la rédaction, le talent n’est plus lu par le public', async () => {
		const published = await writeTalent({ slug: 'maquillage-mariee' })
		const editor = await createAccount('redaction')

		const unpublished = await callRest('PATCH', `/api/talents/${published.id}`, {
			enTetes: editor.session.enTetes,
			corps: { _status: 'draft' },
		})
		expect(unpublished.statut).toBe(200)
		expect((await read(`/api/talents/${published.id}`)).statut).toBe(404)
		expect((await read('/api/talents')).corps.totalDocs).toBe(0)
	})
})

describe('Deux talents ne peuvent pas avoir le même slug', () => {
	test('la rédaction ne crée pas un second talent sur un slug pris, publié ou brouillon', async () => {
		await writeTalent({ slug: 'maquillage-mariee' })
		const editor = await createAccount('redaction')
		const payload = await testPayload()

		for (const path of ['/api/talents', '/api/talents?draft=true']) {
			const { statut: status } = await callRest('POST', path, {
				enTetes: editor.session.enTetes,
				corps: { title: 'Doublon', slug: 'maquillage-mariee', _status: 'published' },
			})
			expect(status).toBe(400)
		}
		expect((await payload.count({ collection: 'talents' })).totalDocs).toBe(1)
	})

	test('l’import non plus : un slug repris en double est refusé, jamais renommé', async () => {
		await writeTalent({ slug: 'maquillage-mariee', strapiId: 1 })
		const payload = await testPayload()

		await expect(writeTalent({ slug: 'maquillage-mariee', strapiId: 2 })).rejects.toThrow()
		const { docs } = await payload.find({ collection: 'talents', depth: 0 })
		expect(docs.map(({ slug, strapiId }) => [slug, strapiId])).toEqual([['maquillage-mariee', 1]])
	})

	test('changer le slug d’un talent pour celui d’un autre est refusé, et rien ne change', async () => {
		await writeTalent({ slug: 'maquillage-mariee' })
		const other = await writeTalent({ slug: 'maquillage-fx' })
		const editor = await createAccount('redaction')

		const { statut: status } = await callRest('PATCH', `/api/talents/${other.id}`, {
			enTetes: editor.session.enTetes,
			corps: { slug: 'maquillage-mariee' },
		})
		expect(status).toBe(400)
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'talents', id: other.id })).slug).toBe('maquillage-fx')
	})

	test('un slug qui n’a pas la forme d’une adresse est refusé à la publication, avec la bonne forme proposée', async () => {
		const editor = await createAccount('redaction')

		const { statut: status, texte: text } = await callRest('POST', '/api/talents', {
			enTetes: editor.session.enTetes,
			corps: { title: 'Maquillage de mariée', slug: 'Maquillage Mariée', _status: 'published' },
		})
		expect(status).toBe(400)
		expect(text).toContain('« maquillage-mariee »')

		const withoutSlug = await callRest('POST', '/api/talents', {
			enTetes: editor.session.enTetes,
			corps: { title: 'Maquillage de mariée', _status: 'published' },
		})
		expect(withoutSlug.statut).toBe(400)
		const payload = await testPayload()
		expect((await payload.count({ collection: 'talents' })).totalDocs).toBe(0)
	})
})

describe('La date de la première publication', () => {
	test('un brouillon n’en a pas ; la publication l’écrit ; une modification la garde', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		const created = await callRest('POST', '/api/talents?draft=true', {
			enTetes: headers,
			// Sent by a request, the date is ignored.
			corps: { title: 'Maquillage FX', slug: 'maquillage-fx', publishedAt: '2020-01-01T00:00:00.000Z' },
		})
		expect(created.statut).toBe(201)
		const id = (created.corps as { doc: { id: number; publishedAt?: string | null } }).doc.id
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'talents', id })).publishedAt ?? null).toBeNull()

		await callRest('PATCH', `/api/talents/${id}`, { enTetes: headers, corps: { _status: 'published' } })
		const published = await payload.findByID({ collection: 'talents', id })
		expect(published._status).toBe('published')
		expect(Date.now() - Date.parse(String(published.publishedAt))).toBeLessThan(60_000)

		await callRest('PATCH', `/api/talents/${id}`, {
			enTetes: headers,
			corps: { title: 'Maquillage à effets spéciaux' },
		})
		expect((await payload.findByID({ collection: 'talents', id })).publishedAt).toBe(published.publishedAt)
	})

	test('la date que donne l’import est gardée', async () => {
		const talent = await writeTalent({ slug: 'maquillage-mariee', publishedAt: '2023-04-01T09:00:00.000Z' })
		expect(talent.publishedAt).toBe('2023-04-01T09:00:00.000Z')
	})
})

describe('Le titre de la page d’un talent (ticket 108)', () => {
	const TITLE_55 = 'Maquillage fictif : une maquilleuse près de chez vous'

	test('de 50 à 60 caractères, différent du h1 : enregistré, lu par la lecture publique ; sinon refusé en français', async () => {
		expect(TITLE_55.length).toBe(53)
		const talent = await writeTalent({
			slug: 'maquillage-fictif',
			seo_title: 'Maquillage fictif',
			pageTitle: TITLE_55,
		})
		const payload = await testPayload()
		const fetched = await readTalent(payload, 'maquillage-fictif')
		expect(fetched).toMatchObject({ titreDeLaPage: TITLE_55, titreAffiche: 'Maquillage fictif' })

		await expect(
			payload.update({ collection: 'talents', id: talent.id, data: { pageTitle: 'Trop court' } })
		).rejects.toThrow()
		await expect(
			payload.update({ collection: 'talents', id: talent.id, data: { pageTitle: 'x'.repeat(61) } })
		).rejects.toThrow()
		await expect(
			payload.update({ collection: 'talents', id: talent.id, data: { seo_title: TITLE_55 } })
		).rejects.toThrow()
		// Left empty, nothing is refused: the page keeps the title of the site online.
		await payload.update({ collection: 'talents', id: talent.id, data: { pageTitle: '' } })
		expect((await readTalent(payload, 'maquillage-fictif'))?.titreDeLaPage).toBe('')
	})

	test('un brouillon n’est pas lu par la page, un anonyme ne lit que le publié', async () => {
		await writeTalent({ slug: 'maquillage-fx', _status: 'draft' })
		expect(await readTalent(await testPayload(), 'maquillage-fx')).toBeNull()
	})
})
