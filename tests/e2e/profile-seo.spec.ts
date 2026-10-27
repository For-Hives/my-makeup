import { expect, test } from '@playwright/test'
import { type PageProfile, pageProfilesUnderPrefix, setPageProfiles } from '../fixtures/page-profiles'
import { testPayload } from '../support/payload-test'
import { profileSchema } from '../support/profile-json-ld-schema'

/**
 * The head of the public page of a profile, end to end (ticket 105; plan 02 E64 for the profile
 * pages and E65): one title per page, a description, a canonical address and a single h1; the
 * structured data valid against the schema, and the same as the page says. The Open Graph tags are
 * ticket 116's.
 */

let profiles: ReadonlyMap<string, PageProfile>

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
	test.setTimeout(180_000)
	// Profiles of its own (« Seo … »): the page spec takes its « Page … » ones away at its end, side by side with this one.
	profiles = await setPageProfiles(pageProfilesUnderPrefix('Seo'))
})

// Taken away at the end, as in tests/e2e/public-profile.spec.ts: left in the bench they crowd the search specs.
test.afterAll(async () => {
	test.setTimeout(180_000)
	const payload = await testPayload()
	for (const { id } of profiles.values()) {
		const profile = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profile) continue
		await payload.delete({ collection: 'profiles', id })
		const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

const headers = (html: string) => ({
	titre: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '',
	description: /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '',
	canonique: /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
	robots: /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? null,
	h1: html.match(/<h1[\s>]/g)?.length ?? 0,
})

const structuredData = (html: string): unknown[] =>
	[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1] ?? 'null'))

test.describe('E64 : les profils, titre, description, adresse canonique, un seul h1', () => {
	test('les profils visibles du banc : un titre à chacun, une description de 70 à 155 caractères', async ({
		request,
	}) => {
		const titles = new Set<string>()
		let read = 0
		for (const [key, { slug, type }] of profiles) {
			const response = await request.get(`/profil/${slug}`)
			// A hidden profile is a 404; a draft is a page in noindex without a canonical address (ticket 104).
			if (type.attendu.status === 'hidden') {
				expect(response.status(), key).toBe(404)
				continue
			}
			if (type.attendu.status !== 'published') {
				expect(response.status(), key).toBe(200)
				const draft = headers(await response.text())
				expect(draft.canonique, key).toBeNull()
				expect(draft.robots, key).toBe('noindex, follow')
				continue
			}
			expect(response.status(), key).toBe(200)
			const heads = headers(await response.text())
			read += 1
			expect(heads.h1, key).toBe(1)
			expect(heads.titre.length, key).toBeGreaterThan(0)
			expect(heads.titre.length, key).toBeLessThanOrEqual(60)
			expect(heads.titre, key).not.toMatch(/\b(?:null|undefined)\b/)
			expect(heads.description.length, key).toBeGreaterThanOrEqual(70)
			expect(heads.description.length, key).toBeLessThanOrEqual(155)
			if (type.attendu.indexable) {
				expect(heads.canonique, key).toBe(`https://my-makeup.fr/profil/${slug}`)
				expect(heads.robots, key).toBeNull()
			} else {
				expect(heads.canonique, key).toBeNull()
				expect(heads.robots, key).toBe('noindex, follow')
			}
			titles.add(heads.titre)
		}
		expect(read).toBeGreaterThan(7)
		expect(titles.size, 'un titre par page').toBe(read)
	})
})

test.describe('E65 : les données structurées du profil, valides et cohérentes avec la page', () => {
	test('chaque profil visible : le schéma passe, le nom est celui du h1, aucune coordonnée non publiée', async ({
		request,
	}) => {
		for (const [key, { slug, type }] of profiles) {
			if (type.attendu.status !== 'published') continue
			const html = await (await request.get(`/profil/${slug}`)).text()
			const blocks = structuredData(html)
			expect(blocks, key).toHaveLength(1)
			const data = profileSchema.parse(blocks[0])
			// The script cannot be closed from inside, whatever the profile wrote.
			expect(html.match(/<script type="application\/ld\+json">/g), key).toHaveLength(1)
			const text = JSON.stringify(data)
			expect(text, key).not.toMatch(/AggregateRating|PostalAddress|"(?:telephone|email)"|mailto:|tel:/)
			const { phone, email } = type.profil.contactDetails ?? {}
			if (type.profil.publicContact !== true)
				for (const contactDetail of [phone, email]) if (contactDetail) expect(html, key).not.toContain(contactDetail)
			if (data['@graph'].length === 2) {
				const [page] = data['@graph']
				const name = page?.mainEntity.name ?? ''
				expect(html, key).toMatch(new RegExp(`<h1[^>]*>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`))
			} else expect(type.attendu.indexable, key).toBe(false)
		}
	})

	test('le profil de référence : ses offres en euros, son prix minimal est un prix de la page', async ({ request }) => {
		const { slug } = profiles.get('reference') ?? { slug: '' }
		const html = await (await request.get(`/profil/${slug}`)).text()
		const data = profileSchema.parse(structuredData(html)[0])
		const page = data['@graph'][0]
		if (page?.['@type'] !== 'ProfilePage') throw new Error('le profil de référence est publiable')
		const price = (page.mainEntity.makesOffer ?? []).flatMap(offre => offre.price ?? [])
		expect(price.length).toBeGreaterThan(0)
		const minimal = Math.min(...price)
		expect(html).toContain(`${minimal}\u00a0€`)
	})
})
