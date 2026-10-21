import { expect, test } from '@playwright/test'
import { ofName } from '../../src/lib/french-elision'
import { type SearchProfile, setSearchProfiles, TEST_WORD } from '../fixtures/search-profiles'
import {
	refreshDirectory,
	setZoneSearchProfiles,
	ZONE_WORD,
	type ZoneSearchProfile,
} from '../fixtures/zone-search-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The search by city (ticket 098; plan 02 E38 and E42). The bench is shared with the other tests, which
 * write their own profiles: the tests count the profiles they loaded themselves
 * (tests/fixtures/search-profiles.ts), by their address.
 *
 * Every search carries the word only those profiles hold (ticket 225): the city places them, and no profile of
 * another test, in Annecy or anywhere, can change a count or push one of them onto a second page.
 */

const KEYWORD = encodeURIComponent(TEST_WORD)
const find = (ville: string) => `/search?search=${KEYWORD}&city=${encodeURIComponent(ville)}`

// What the fixture holds, by the rule of the directory: listed, whatever the profile can be published or not.
const LISTS = [
	'reference',
	'ville-voisine',
	'ville-eloignee',
	'disponibilite-inconnue',
	'actif-non-publiable',
	'sans-contact-public',
	'ancien-nom-accentue',
	'verifiee',
] as const
const ABSENTS = ['indisponible', 'vide', 'masquee'] as const
// The profiles of the fixture in Annecy that are listed.
const A_ANNECY = [
	'reference',
	'disponibilite-inconnue',
	'actif-non-publiable',
	'sans-contact-public',
	'verifiee',
] as const

let profiles: ReadonlyMap<string, SearchProfile>
const profile = (cle: string): SearchProfile => {
	const found = profiles.get(cle)
	if (!found) throw new Error(`pas de profil d’essai « ${cle} »`)
	return found
}

test.describe('Recherche par ville', () => {
	test.beforeAll(async () => {
		test.setTimeout(180_000)
		profiles = await setSearchProfiles()
	})

	// The pages of the search keep the directory in the cache of Next: what an earlier request of the run saw
	// is not what the fixture holds. The application refreshes it, as it does when a profile is saved.
	test.beforeEach(async ({ request }) => {
		await refreshProfilePages(request, profile('reference'))
	})

	// E38
	test('E38 : par ville, des cartes avec nom, spécialité, zone et photo, et un titre qui ne compte que la ville', {
		tag: ['@smoke', '@mobile'],
	}, async ({ page }) => {
		await page.goto(find('Annecy'))

		const title = page.getByRole('heading', { level: 1 })
		await expect(title).toHaveCount(1)
		await expect(title).toHaveText(`${A_ANNECY.length} résultats pour « ${TEST_WORD} » à « Annecy »`)
		const account = Number(((await title.textContent()) ?? '').match(/^(\d+)/)?.[1])
		// The title counts the artists of Annecy: the first list, before the first section.
		expect(await page.locator('main ul').first().locator('> li').count()).toBe(account)
		const total = await page.locator('main li a[href^="/profil/"]').count()
		expect(total).toBe(LISTS.length)

		const reference = profile('reference')
		const card = page.locator(`a[href="/profil/${reference.slug}"]`)
		await expect(card).toHaveCount(1)
		await expect(card.getByRole('heading', { level: 3, name: reference.nom })).toBeVisible()
		await expect(card).toContainText(reference.specialite ?? '')
		await expect(card).toContainText('Annecy et 30 km autour')
		const photo = card.locator('img')
		await expect(photo).toBeVisible()
		await expect(photo).toHaveAttribute('alt', `Photo ${ofName(reference.nom)}`)
		// The photo is its own, not the default one.
		await expect(photo).toHaveAttribute('src', /essai-reference-principale/)

		// Nothing overflows sideways, at 1440 px as at 390 px.
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		expect(overflow).toBeLessThanOrEqual(0)
	})

	test('les maquilleuses de la ville d’abord, puis le même département, puis celles qui se déplacent', async ({
		page,
	}) => {
		await page.goto(find('Annecy'))

		// The sections under the artists of the city: the list of the city has its own, with a hidden title.
		const sections = page.locator('main section').filter({ hasNot: page.locator('#recherche-titre-locaux') })
		await expect(sections.first().getByRole('heading', { level: 2 })).toHaveText(
			'Autres maquilleuses du 74 (Haute-Savoie)'
		)
		for (const key of ['ville-voisine', 'ancien-nom-accentue'])
			await expect(sections.first().locator(`a[href="/profil/${profile(key).slug}"]`)).toHaveCount(1)
		const move = sections.filter({
			has: page.getByRole('heading', { level: 2, name: 'Autres maquilleuses qui se déplacent' }),
		})
		await expect(move.locator(`a[href="/profil/${profile('ville-eloignee').slug}"]`)).toHaveCount(1)
		// The ones of the city are not repeated under a section.
		for (const key of A_ANNECY) await expect(sections.locator(`a[href="/profil/${profile(key).slug}"]`)).toHaveCount(0)
	})

	test('un département tapé ouvre la liste par ses maquilleuses', async ({ page }) => {
		await page.goto(find('Haute-Savoie'))

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			`${LISTS.length - 1} résultats pour « ${TEST_WORD} » à « Haute-Savoie »`
		)
		const first = page.locator('main ul').first()
		for (const key of [...A_ANNECY, 'ville-voisine', 'ancien-nom-accentue'] as const)
			await expect(first.locator(`a[href="/profil/${profile(key).slug}"]`)).toHaveCount(1)
	})

	test('une ville où personne ne travaille le dit, et garde les autres sous leurs titres', async ({ page }) => {
		await page.goto(find('Grenoble'))

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			`Aucun résultat pour « ${TEST_WORD} » à « Grenoble »`
		)
		await expect(
			page.getByText('Aucune maquilleuse n’indique « Grenoble » (ville ou département) dans son profil.')
		).toBeVisible()
		await expect(page.getByRole('heading', { level: 2, name: 'Autres maquilleuses qui se déplacent' })).toBeVisible()
	})

	// E42, as the decisions of 09/10 and 13/10 changed it: empty, unavailable and hidden are absent; a
	// profile that is active but cannot be published is there.
	test('E42 : vide, indisponible et masqué sont absents ; actif non publiable est présent', async ({ page }) => {
		await page.goto(find('Annecy'))

		const urls = await page
			.locator('main li a[href^="/profil/"]')
			.evaluateAll(liens => liens.map(lien => lien.getAttribute('href')))
		for (const key of LISTS) expect(urls, key).toContain(`/profil/${profile(key).slug}`)
		for (const key of ABSENTS) expect(urls, key).not.toContain(`/profil/${profile(key).slug}`)
		expect(new Set(urls).size).toBe(urls.length)
	})

	test('chaque carte mène à l’adresse définitive du profil, et la page ne porte aucune coordonnée', async ({
		page,
		request,
	}) => {
		await page.goto(find('Annecy'))
		const urls = await page
			.locator('main li a[href^="/profil/"]')
			.evaluateAll(liens => liens.map(lien => lien.getAttribute('href')))
		for (const url of urls) expect(url).toMatch(/^\/profil\/[a-z0-9]+(?:-[a-z0-9]+)*$/)

		const response = await request.get('/search?city=Annecy')
		const html = await response.text()
		for (const forbidden of ['latitude', 'longitude', 'codeInsee', '06 39 98', 'example.test'])
			expect(html, forbidden).not.toContain(forbidden)
	})

	test('la recherche ne s’indexe jamais : noindex en en-tête et en balise, sans adresse canonique', async ({
		page,
	}) => {
		const response = await page.goto('/search?city=Annecy')

		expect(response?.headers()['x-robots-tag']).toBe('noindex, follow')
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
	})

	test('sans ville ni mot, une invitation et un seul h1 ; le formulaire est prérempli par l’adresse', async ({
		page,
	}) => {
		await page.goto('/search')
		await expect(page.getByRole('heading', { level: 1, name: 'Rechercher une maquilleuse' })).toBeVisible()

		await page.goto('/search?city=Lyon%20%20%20Part-Dieu')
		await expect(page.getByLabel('Ville de la prestation')).toHaveValue('Lyon Part-Dieu')
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
	})
})

/**
 * The search by postal code and by country (ticket 263; PLAN-ZONES.md §3.3 and §3.4), on the zone profiles of the
 * fictional set under names of their own (tests/fixtures/zone-search-profiles.ts), found by the word only they carry.
 * Valbrume and Hautcombe are two fictional communes that share the postal code 74990.
 */
test.describe('Recherche par code postal et par pays', () => {
	let zones: ReadonlyMap<string, ZoneSearchProfile>
	const zone = (key: string): ZoneSearchProfile => {
		const found = zones.get(key)
		if (!found) throw new Error(`pas de profil d’essai « ${key} »`)
		return found
	}
	const search = (city: string, word = ZONE_WORD) =>
		`/search?search=${encodeURIComponent(word)}&city=${encodeURIComponent(city)}`

	test.beforeAll(async () => {
		test.setTimeout(180_000)
		zones = await setZoneSearchProfiles()
	})

	// The directory the search ranks is kept in the cache of Next: the application refreshes it, as a save does.
	test.beforeEach(async ({ request }) => {
		await refreshDirectory(request, zone('code-postal-partage-a'))
	})

	test(
		'un code postal partagé : les deux communes au premier rang, un h1 qui les compte, une phrase qui les nomme',
		{
			tag: '@mobile',
		},
		async ({ page }, testInfo) => {
			await page.goto(search('74990'))

			await expect(page.getByRole('heading', { level: 1 })).toHaveText(`2 résultats pour « ${ZONE_WORD} » à « 74990 »`)
			await expect(
				page.getByText(/^Dans les communes de (Valbrume et Hautcombe|Hautcombe et Valbrume)\.$/)
			).toBeVisible()
			const first = page.locator('main ul').first()
			for (const key of ['code-postal-partage-a', 'code-postal-partage-b'])
				await expect(first.locator(`a[href="/profil/${zone(key).slug}"]`)).toHaveCount(1)
			// A zone of several countries travels; a zone of one country with no radius comes last.
			await expect(
				page
					.locator('main section')
					.filter({ has: page.getByRole('heading', { level: 2, name: 'Autres maquilleuses qui se déplacent' }) })
					.locator(`a[href="/profil/${zone('zone-france-italie').slug}"]`)
			).toHaveCount(1)
			// Each card says the name of the commune, never the postal code.
			await expect(first).toContainText(/Valbrume|Hautcombe/)
			await expect(first).not.toContainText('74990')

			for (const screen of [SCREENS.mobile, SCREENS.chromium]) {
				await page.setViewportSize(screen)
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
					`${screen.width} px`
				).toBeLessThanOrEqual(0)
			}
			expect(await violationsSevere(page)).toEqual([])
			await page.setViewportSize(SCREENS.mobile)
			await testInfo.attach('recherche-code-postal-390px', {
				body: await page.screenshot({ fullPage: true }),
				contentType: 'image/png',
			})
		}
	)

	test('un code postal où personne ne travaille le dit, avec les mêmes liens, au vouvoiement', async ({ page }) => {
		await page.goto(search('62149', 'zzqqxxyy'))

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucun résultat pour « zzqqxxyy » à « 62149 »')
		await expect(
			page.getByText('Aucune maquilleuse n’est inscrite dans les communes du 62149 pour le moment.')
		).toBeVisible()
		await expect(page.getByRole('link', { name: 'Voir les maquilleuses du 62 (Pas-de-Calais)' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Créez votre profil' })).toBeVisible()
		expect(await violationsSevere(page)).toEqual([])
	})

	test(
		'« Belgique » et « Italie » : les profils de pays au premier rang, le pays écrit, le drapeau décoratif',
		{
			tag: '@mobile',
		},
		async ({ page }, testInfo) => {
			await page.goto(search('Belgique'))
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(
				`1 résultat pour « ${ZONE_WORD} » à « Belgique »`
			)
			const card = page.locator(`a[href="/profil/${zone('zone-belgique').slug}"]`)
			await expect(card).toContainText('Bruxelles (Belgique)')
			await expect(card.locator('[aria-hidden="true"]', { hasText: '🇧🇪' })).toHaveCount(1)

			await page.goto(search('Italie'))
			const several = page.locator(`a[href="/profil/${zone('zone-france-italie').slug}"]`)
			await expect(several).toContainText('France et Italie')
			await expect(several.locator('[aria-hidden="true"]', { hasText: '🇫🇷 🇮🇹' })).toHaveCount(1)
			await page.setViewportSize(SCREENS.mobile)
			await testInfo.attach('carte-pays-390px', { body: await several.screenshot(), contentType: 'image/png' })
			expect(await violationsSevere(page)).toEqual([])
		}
	)

	test(
		'la page d’un profil de pays : la zone écrite, le drapeau décoratif, l’adresse canonique, aucune violation grave',
		{
			tag: '@mobile',
		},
		async ({ page, request }, testInfo) => {
			const { slug } = zone('zone-belgique')
			const html = await (await request.get(`/profil/${slug}`)).text()
			expect(html).toContain('<span aria-hidden="true">🇧🇪</span> Bruxelles (Belgique)')
			// The title says the name; its place goes in only when it fits in 60 characters (tests/unit/profile-seo.test.ts).
			expect(html).toMatch(/<title>Essai Zone Uniform/)
			expect(/<link rel="canonical" href="([^"]*)"/.exec(html)?.[1]).toMatch(new RegExp(`/profil/${slug}$`))
			expect(html).not.toMatch(/<meta name="robots" content="noindex/)
			// The structured data names the town inside its country.
			expect(html).toContain('"containedInPlace":{"@type":"Country","name":"Belgique"}')

			await page.goto(`/profil/${slug}`)
			await page.setViewportSize(SCREENS.mobile)
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			expect(await violationsSevere(page)).toEqual([])
			await testInfo.attach('profil-zone-belgique-390px', {
				body: await page.screenshot({ fullPage: true }),
				contentType: 'image/png',
			})

			const sitemap = await (await request.get('/sitemap.xml')).text()
			for (const key of ['zone-belgique', 'zone-france-italie'])
				expect(sitemap, key).toContain(`/profil/${zone(key).slug}<`)
		}
	)
})
