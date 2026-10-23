import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Profiles } from '../../src/collections/Profiles'
import { DEMO_PROFILES, LOADED_DEMO_PROFILES } from '../../src/demo-data/profiles'
import { setBenchDataset } from '../fixtures/bench-dataset'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * Tickets 165 and 166 (plan 01 §3.4, plan 02 §7.4): the admin finds a profile in the list with the
 * filters of the panel, which are the `where` of the REST API; the sort by last activity is right; a
 * value that is not a choice is refused with a message. The admin hides a profile from its sheet
 * (`chosenStatus`), and publishing it again brings it back; the editorial role changes no status.
 * The twelve profiles of the set of the bench are the base: their expected state is in
 * src/demo-data/profiles.ts.
 */

const resetToZero = () => Promise.all([emptyBase(), emptyStorage()])

beforeAll(async () => {
	await resetToZero()
	await setBenchDataset()
}, 60_000)

afterAll(resetToZero)

interface List {
	totalDocs: number
	docs: { id: number; slug: string; status: string; updatedAt: string }[]
}

/** The seventeen profiles of the set, among the profiles of the fixed accounts: the way the panel counts them. */
const DATASET_FILTER = 'where[and][0][pro.email][like]=jeu-profil-'

/** The list of profiles the admin panel asks for, with one `where` clause on the profiles of the set. */
async function listAll(enTetes: Record<string, string>, requete: string) {
	const response = await callRest(
		'GET',
		`/api/profiles?limit=50&depth=0&${DATASET_FILTER}&${requete.replace(/^where\[/, 'where[and][1][')}`,
		{
			enTetes,
		}
	)
	return { statut: response.statut, liste: response.corps as List, texte: response.texte }
}

/** The slugs the set expects for a filter on the expected state. */
const expected = (garde: (profil: (typeof LOADED_DEMO_PROFILES)[number]) => boolean) =>
	LOADED_DEMO_PROFILES.filter(garde)
		.map(({ attendu }) => attendu.slug)
		.sort()

describe('La liste des profils de l’admin (ticket 165)', () => {
	test('la liste montre l’adresse, la commune, la complétude, le caractère publiable, le statut, la zone à revoir et la dernière activité, la plus récente d’abord', () => {
		expect(Profiles.admin?.defaultColumns).toEqual([
			// The person first (ticket 308): photo and name, then her zone as the public pages write it.
			'listName',
			'listZone',
			'slug',
			'completeness',
			'publishable',
			'status',
			// The zone the import could not decide (ticket 259).
			'zoneReview.reason',
			'updatedAt',
		])
		expect(Profiles.defaultSort).toBe('-updatedAt')
	})

	test('chaque filtre rend le nombre attendu sur les 17 profils du banc', async () => {
		const admin = await createAccount('admin')
		const { enTetes: headers } = admin.session

		const all = await listAll(headers, 'sort=slug')
		expect(all.liste.totalDocs).toBe(17)

		const testCase: [string, string, string[]][] = [
			['non publiables', 'where[publishable][equals]=false', expected(p => !p.attendu.publishable)],
			['publiables', 'where[publishable][equals]=true', expected(p => p.attendu.publishable)],
			['vides', 'where[fullyEmpty][equals]=true', expected(p => p.attendu.fullyEmpty)],
			['draft', 'where[status][equals]=draft', expected(p => p.attendu.status === 'draft')],
			['publié', 'where[status][equals]=published', expected(p => p.attendu.status === 'published')],
			['masqué', 'where[status][equals]=hidden', expected(p => p.attendu.status === 'hidden')],
		]
		for (const [name, request, slugs] of testCase) {
			const { statut: status, liste: list } = await listAll(headers, request)
			expect({ nom: name, statut: status, slugs: list.docs.map(({ slug }) => slug).sort() }).toEqual({
				nom: name,
				statut: 200,
				slugs,
			})
		}
		// The set holds at least one profile of each of these, so that no filter passes by being empty.
		for (const [, , slugs] of testCase) expect(slugs.length).toBeGreaterThan(0)
		// The three statuses cover the seventeen profiles.
		const byStatus = await Promise.all(
			['draft', 'published', 'hidden'].map(
				async s => (await listAll(headers, `where[status][equals]=${s}`)).liste.totalDocs
			)
		)
		expect(byStatus.reduce((a, b) => a + b, 0)).toBe(17)
	}, 30_000)

	test('la recherche du panneau retrouve un profil par son adresse ou sa commune', async () => {
		const admin = await createAccount('admin')
		const { enTetes: headers } = admin.session
		const reference = DEMO_PROFILES.find(({ cle }) => cle === 'reference')
		if (!reference) throw new Error('Le jeu n’a pas de profil de référence.')

		const byUrl = await listAll(headers, `where[slug][like]=${reference.attendu.slug}`)
		expect(byUrl.liste.docs.map(({ slug }) => slug)).toEqual([reference.attendu.slug])
		const cities = await listAll(headers, 'where[city.name][like]=Nantes')
		expect(cities.liste.totalDocs).toBeGreaterThan(0)
		expect(cities.liste.totalDocs).toBeLessThan(17)
	})

	test('le tri par dernière activité est juste, dans les deux sens, et un profil qu’on corrige remonte', async () => {
		const admin = await createAccount('admin')
		const { enTetes: headers } = admin.session

		const recent = (await listAll(headers, 'sort=-updatedAt')).liste.docs
		const old = (await listAll(headers, 'sort=updatedAt')).liste.docs
		const dates = recent.map(({ updatedAt }) => Date.parse(updatedAt))
		expect(dates).toEqual([...dates].sort((a, b) => b - a))
		expect(old.map(({ id }) => id)).toEqual(recent.map(({ id }) => id).reverse())

		// She who is corrected is the oldest one: after the correction, she is the first.
		const last = recent.at(-1)
		if (!last) throw new Error('La liste est vide.')
		const correction = await callRest('PATCH', `/api/profiles/${last.id}`, {
			enTetes: headers,
			corps: { internalNote: 'Corrigé par l’admin.' },
		})
		expect(correction.statut).toBe(200)
		const after = (await listAll(headers, 'sort=-updatedAt')).liste.docs
		expect(after[0]?.id).toBe(last.id)
	}, 30_000)

	test('une valeur qui n’est pas un choix est refusée avec un message, sur la fiche et dans le filtre', async () => {
		const admin = await createAccount('admin')
		const { enTetes: headers } = admin.session
		const profile = (await listAll(headers, 'sort=slug')).liste.docs[0]
		if (!profile) throw new Error('La liste est vide.')

		const payload = await testPayload()
		const before = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
		const refusal = await callRest('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'archive' },
		})
		expect(refusal.statut).toBe(400)
		expect(refusal.texte).toContain('chosenStatus')
		expect(refusal.texte).toContain('Ce statut n’existe pas')
		const after = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
		expect([after.chosenStatus, after.status]).toEqual([before.chosenStatus, before.status])

		// The filter on a status nobody holds is refused with a sentence, not a 500 of the database.
		const filter = await listAll(headers, 'where[status][equals]=archive')
		expect(filter.statut).toBe(400)
		expect(filter.texte).toContain('statut qui n’existe pas')
		const inOrFilter = await callRest('GET', '/api/profiles?where[or][0][status][in]=published,archive', {
			enTetes: headers,
		})
		expect(inOrFilter.statut).toBe(400)
	})
})

describe('Masquer un profil depuis sa fiche (ticket 166)', () => {
	/** The slug of the profile of the set that is published and publishable: the reference one. */
	const reference = () => {
		const profile = DEMO_PROFILES.find(({ cle }) => cle === 'reference')
		if (!profile) throw new Error('Le jeu n’a pas de profil de référence.')
		return profile.attendu.slug
	}

	/** What an anonymous visitor reads: the public list of profiles, by slug. */
	const readByPublic = async (slug: string) =>
		(
			(await callRest('GET', `/api/profiles?depth=0&where[slug][equals]=${slug}`)).corps as {
				docs: { slug: string }[]
			}
		).docs.map(d => d.slug)

	test('masqué, le profil n’est plus lu par le public ; republié, il revient publiable', async () => {
		const admin = await createAccount('admin')
		const { enTetes: headers } = admin.session
		const slug = reference()
		const id = (await listAll(headers, `where[slug][equals]=${slug}`)).liste.docs[0]?.id ?? 0
		expect(await readByPublic(slug)).toEqual([slug])

		const hidden = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'hidden', reason: 'Essai de modération.' },
		})
		expect(hidden.statut).toBe(200)
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'profiles', id, depth: 0 })).status).toBe('hidden')
		expect(await readByPublic(slug)).toEqual([])

		const republished = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'automatic', reason: 'Photos remplacées, profil conforme.' },
		})
		expect(republished.statut).toBe(200)
		const returned = await payload.findByID({ collection: 'profiles', id, depth: 0 })
		expect([returned.status, returned.publishable]).toEqual(['published', true])
		expect(await readByPublic(slug)).toEqual([slug])
	}, 30_000)

	test('la rédaction ne change pas le statut d’un profil', async () => {
		const [editor, admin] = await Promise.all([createAccount('redaction'), createAccount('admin')])
		const slug = reference()
		const id = (await listAll(admin.session.enTetes, `where[slug][equals]=${slug}`)).liste.docs[0]?.id ?? 0

		const response = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: editor.session.enTetes,
			corps: { chosenStatus: 'hidden' },
		})
		expect(response.statut).toBeGreaterThanOrEqual(400)
		const after = await (await testPayload()).findByID({ collection: 'profiles', id, depth: 0 })
		expect([after.chosenStatus, after.status]).toEqual(['automatic', 'published'])
	})
})
