import { expect, test } from '@playwright/test'
import { type ProfilDePage, poserLesProfilsDePage, profilsDePageSousLePrefixe } from '../fixtures/page-profiles'
import { payloadDeTest } from '../support/payload-test'
import { schemaDuProfil } from '../support/profile-json-ld-schema'

/**
 * The head of the public page of a profile, end to end (ticket 105; plan 02 E64 for the profile
 * pages and E65): one title per page, a description, a canonical address and a single h1; the
 * structured data valid against the schema, and the same as the page says. The Open Graph tags are
 * ticket 116's.
 */

let profils: ReadonlyMap<string, ProfilDePage>

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
	test.setTimeout(180_000)
	// Profiles of its own (« Seo … »): the page spec takes its « Page … » ones away at its end, side by side with this one.
	profils = await poserLesProfilsDePage(profilsDePageSousLePrefixe('Seo'))
})

// Taken away at the end, as in tests/e2e/profil-public.spec.ts: left in the bench they crowd the search specs.
test.afterAll(async () => {
	test.setTimeout(180_000)
	const payload = await payloadDeTest()
	for (const { id } of profils.values()) {
		const profil = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profil) continue
		await payload.delete({ collection: 'profiles', id })
		const pro = typeof profil.pro === 'object' ? profil.pro.id : profil.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

const entetes = (html: string) => ({
	titre: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '',
	description: /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '',
	canonique: /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
	robots: /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? null,
	h1: html.match(/<h1[\s>]/g)?.length ?? 0,
})

const donneesStructurees = (html: string): unknown[] =>
	[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1] ?? 'null'))

test.describe('E64 : les profils, titre, description, adresse canonique, un seul h1', () => {
	test('les profils visibles du banc : un titre à chacun, une description de 70 à 155 caractères', async ({
		request,
	}) => {
		const titres = new Set<string>()
		let lus = 0
		for (const [cle, { slug, type }] of profils) {
			const reponse = await request.get(`/profil/${slug}`)
			// A hidden profile is a 404; a draft is a page in noindex without a canonical address (ticket 104).
			if (type.attendu.status === 'hidden') {
				expect(reponse.status(), cle).toBe(404)
				continue
			}
			if (type.attendu.status !== 'published') {
				expect(reponse.status(), cle).toBe(200)
				const brouillon = entetes(await reponse.text())
				expect(brouillon.canonique, cle).toBeNull()
				expect(brouillon.robots, cle).toBe('noindex, follow')
				continue
			}
			expect(reponse.status(), cle).toBe(200)
			const tetes = entetes(await reponse.text())
			lus += 1
			expect(tetes.h1, cle).toBe(1)
			expect(tetes.titre.length, cle).toBeGreaterThan(0)
			expect(tetes.titre.length, cle).toBeLessThanOrEqual(60)
			expect(tetes.titre, cle).not.toMatch(/\b(?:null|undefined)\b/)
			expect(tetes.description.length, cle).toBeGreaterThanOrEqual(70)
			expect(tetes.description.length, cle).toBeLessThanOrEqual(155)
			if (type.attendu.publishable) {
				expect(tetes.canonique, cle).toBe(`https://my-makeup.fr/profil/${slug}`)
				expect(tetes.robots, cle).toBeNull()
			} else {
				expect(tetes.canonique, cle).toBeNull()
				expect(tetes.robots, cle).toBe('noindex, follow')
			}
			titres.add(tetes.titre)
		}
		expect(lus).toBeGreaterThan(7)
		expect(titres.size, 'un titre par page').toBe(lus)
	})
})

test.describe('E65 : les données structurées du profil, valides et cohérentes avec la page', () => {
	test('chaque profil visible : le schéma passe, le nom est celui du h1, aucune coordonnée non publiée', async ({
		request,
	}) => {
		for (const [cle, { slug, type }] of profils) {
			if (type.attendu.status !== 'published') continue
			const html = await (await request.get(`/profil/${slug}`)).text()
			const blocs = donneesStructurees(html)
			expect(blocs, cle).toHaveLength(1)
			const donnees = schemaDuProfil.parse(blocs[0])
			// The script cannot be closed from inside, whatever the profile wrote.
			expect(html.match(/<script type="application\/ld\+json">/g), cle).toHaveLength(1)
			const texte = JSON.stringify(donnees)
			expect(texte, cle).not.toMatch(/AggregateRating|PostalAddress|"(?:telephone|email)"|mailto:|tel:/)
			const { phone: telephone, email } = type.profil.contactDetails ?? {}
			if (type.profil.publicContact !== true)
				for (const coordonnee of [telephone, email]) if (coordonnee) expect(html, cle).not.toContain(coordonnee)
			if (donnees['@graph'].length === 2) {
				const [page] = donnees['@graph']
				const nom = page?.mainEntity.name ?? ''
				expect(html, cle).toMatch(new RegExp(`<h1[^>]*>${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`))
			} else expect(type.attendu.publishable, cle).toBe(false)
		}
	})

	test('le profil de référence : ses offres en euros, son prix minimal est un prix de la page', async ({ request }) => {
		const { slug } = profils.get('reference') ?? { slug: '' }
		const html = await (await request.get(`/profil/${slug}`)).text()
		const donnees = schemaDuProfil.parse(donneesStructurees(html)[0])
		const page = donnees['@graph'][0]
		if (page?.['@type'] !== 'ProfilePage') throw new Error('le profil de référence est publiable')
		const prix = (page.mainEntity.makesOffer ?? []).flatMap(offre => offre.price ?? [])
		expect(prix.length).toBeGreaterThan(0)
		const minimal = Math.min(...prix)
		expect(html).toContain(`${minimal}\u00a0€`)
	})
})
