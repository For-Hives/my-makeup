import { randomInt } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { type APIRequestContext, expect, request as pwRequest, test } from '@playwright/test'
import { type SearchProfile, setSearchProfiles, TEST_WORD } from '../fixtures/search-profiles'
import { buildByApplication, DISTANT_CITIES, removeByApplication } from '../support/profile-factory'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The search by a word, its pages and its brake (tickets 099 and 100; plan 02 E39, E40, E41, I29 and
 * I30 through the running application). The bench is shared with the other tests, which write their
 * own profiles: the tests look for the profiles they loaded themselves, by their address
 * (tests/fixtures/search-profiles.ts), and for the generated ones by a word of their own.
 */

const GENERATED = 45

// The word only the loaded profiles hold (ticket 225), with the word under test: a search for « mariage » alone
// is cut at 20 results, and the profiles of the other tests that speak of marriage push these ones off the page.
const KEYWORD = encodeURIComponent(TEST_WORD)

let profiles: ReadonlyMap<string, SearchProfile>
const profile = (cle: string): SearchProfile => {
	const found = profiles.get(cle)
	if (!found) throw new Error(`pas de profil d’essai « ${cle} »`)
	return found
}
const link = (cle: string) => `a[href="/profil/${profile(cle).slug}"]`

test.describe('Recherche par mot, par pages', () => {
	test.beforeAll(async () => {
		test.setTimeout(240_000)
		profiles = await setSearchProfiles()
	})

	// The pages keep the directory in the cache of Next: what an earlier request saw is not what the fixture holds.
	test.beforeEach(async ({ request }) => {
		await refreshProfilePages(request, profile('reference'))
	})

	// E39, adapted: the decisions of 13/10 make it a word and a city (the speciality is a word), with the filters in the address.
	test('E39 : un mot et une ville, la ville d’abord, les filtres dans l’adresse', {
		tag: ['@smoke', '@mobile'],
	}, async ({ page }) => {
		await page.goto('/search')
		await page.getByLabel('Prestation recherchée').fill(`mariage ${TEST_WORD}`)
		await page.getByLabel('Ville de la prestation').fill('Annecy')
		await page.getByRole('button', { name: 'Trouver une maquilleuse' }).click()

		await expect(page).toHaveURL(`/search?search=mariage+${KEYWORD}&city=Annecy`)
		const title = page.getByRole('heading', { level: 1 })
		await expect(title).toHaveCount(1)
		await expect(title).toHaveText(`5 résultats pour « mariage ${TEST_WORD} » à « Annecy »`)
		// The artists of Annecy whose profile speaks of marriage lead the list; the title counts them only.
		const first = page.locator('main ul').first()
		await expect(first.locator(link('reference'))).toHaveCount(1)
		const account = Number(((await title.textContent()) ?? '').match(/^(\d+)/)?.[1])
		expect(await first.locator('> li').count()).toBe(account)
		// Nantes and Annemasse are not in the first list, and not left out: they follow, under their own headings.
		await expect(first.locator(link('ville-eloignee'))).toHaveCount(0)
		await expect(page.locator('main section').locator(link('ville-eloignee'))).toHaveCount(1)
		// The form keeps what was typed.
		await expect(page.getByLabel('Prestation recherchée')).toHaveValue(`mariage ${TEST_WORD}`)
		await expect(page.getByLabel('Ville de la prestation')).toHaveValue('Annecy')
	})

	test('un mot qu’aucun profil de la ville ne porte le dit, et garde les autres sous leurs titres', async ({
		page,
	}) => {
		await page.goto(`/search?search=%C3%A9v%C3%A9nementiel+${KEYWORD}&city=Annecy`)

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			`Aucun résultat pour « événementiel ${TEST_WORD} » à « Annecy »`
		)
		await expect(
			page.getByText('Aucune maquilleuse n’indique « Annecy » (ville ou département) dans son profil.')
		).toBeVisible()
		// Chloé Bertin, in Nantes, is the one who writes it: she follows, she is not left out.
		await expect(page.locator(link('ville-eloignee'))).toHaveCount(1)
		await expect(page.locator(link('reference'))).toHaveCount(0)
	})

	test('sans accent et avec une faute, on trouve : « Anecy » et « evenementiel »', async ({ page }) => {
		await page.goto(`/search?search=Anecy+${KEYWORD}`)
		await expect(page.locator(link('reference'))).toHaveCount(1)

		await page.goto(`/search?search=evenementiel+${KEYWORD}`)
		await expect(page.locator(link('ville-eloignee'))).toHaveCount(1)
		await expect(page.locator(link('reference'))).toHaveCount(0)
	})

	test('les mots de la demande sont ignorés : « je cherche une maquilleuse pour mon mariage »', async ({ page }) => {
		await page.goto(`/search?search=je+cherche+une+maquilleuse+pour+mon+mariage+${KEYWORD}`)

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			new RegExp(`^\\d+ résultats? pour « je cherche une maquilleuse pour mon mariage ${TEST_WORD} »$`)
		)
		await expect(page.locator(link('reference'))).toHaveCount(1)
	})

	test('un profil masqué, indisponible ou vide ne sort jamais d’une recherche par mot', async ({ page }) => {
		await page.goto(`/search?search=mariage+${KEYWORD}`)

		const urls = await page
			.locator('main li a[href^="/profil/"]')
			.evaluateAll(liens => liens.map(lien => lien.getAttribute('href')))
		for (const key of ['reference', 'ville-voisine', 'actif-non-publiable', 'verifiee'])
			expect(urls, key).toContain(`/profil/${profile(key).slug}`)
		for (const key of ['indisponible', 'vide', 'masquee'])
			expect(urls, key).not.toContain(`/profil/${profile(key).slug}`)
	})

	// E40
	test('E40 : aucun résultat, un message utile', {
		tag: ['@smoke', '@mobile'],
	}, async ({ page }) => {
		await page.goto('/search?search=zzqqxxyy')

		const title = page.getByRole('heading', { level: 1 })
		await expect(title).toHaveCount(1)
		await expect(title).toHaveText('Aucun résultat pour « zzqqxxyy »')
		await expect(page.getByText('Essayez un autre mot (mariage, soirée, effets spéciaux…).')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Créez votre profil' })).toHaveAttribute('href', '/auth/signup')
		// Nothing overflows sideways, at 1440 px as at 390 px.
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		expect(overflow).toBeLessThanOrEqual(0)
	})

	test('E40 : avec une ville, on propose la recherche sans la ville et la zone voisine', async ({ page }) => {
		await page.goto('/search?search=zzqqxxyy&city=Annecy')

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucun résultat pour « zzqqxxyy » à « Annecy »')
		await expect(page.getByRole('link', { name: 'Chercher « zzqqxxyy » partout' })).toHaveAttribute(
			'href',
			'/search?search=zzqqxxyy'
		)
		const zone = page.getByRole('link', { name: 'Voir les maquilleuses du 74 (Haute-Savoie)' })
		await expect(zone).toHaveAttribute('href', '/search?city=74')
		await zone.click()
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^\d+ résultats? pour « 74 »$/)
		// Which profiles lead the list of the 74 is read among the ones this file loaded: the others' count moves.
		await page.goto(`/search?search=${KEYWORD}&city=74`)
		await expect(page.locator('main ul').first().locator(link('reference'))).toHaveCount(1)
	})

	test('I30 : la 61e recherche d’une adresse est refusée en 429, en français ; une autre adresse, les pages en cache et le profil passent', async ({
		request,
	}) => {
		test.setTimeout(120_000)
		// One address of the documentation range per run: the two projects of a run never share a counter.
		const ipAddress = `203.0.113.${randomInt(1, 255)}`
		const other = `198.51.100.${randomInt(1, 255)}`
		const headers = { 'x-forwarded-for': ipAddress }
		for (let i = 1; i <= 60; i += 1) {
			const response = await request.get(`/search?city=Annecy&page=${i}`, { headers: headers })
			expect(response.status(), `recherche ${i}`).toBe(200)
		}
		const refused = await request.get('/search?city=Annecy', { headers: headers })
		expect(refused.status()).toBe(429)
		expect(refused.headers()['retry-after']).toMatch(/^\d+$/)
		expect(refused.headers()['x-robots-tag']).toContain('noindex')
		expect(await refused.text()).toContain('Trop de recherches en peu de temps')

		// The pages that are cached are not braked, and neither is another address.
		for (const path of ['/', `/profil/${profile('reference').slug}`])
			expect((await request.get(path, { headers: headers })).status(), path).toBe(200)
		expect((await request.get('/search?city=Annecy', { headers: { 'x-forwarded-for': other } })).status()).toBe(200)
	})
})

// The pages need more than 20 results, which the bench does not hold: 45 profiles are created through the
// application for these tests and removed after them. They are far from Annecy and Nantes and none travels,
// so for every other search of the shared bench they come last, under « Autres maquilleuses ».
test.describe('Pages de résultats', () => {
	test.describe.configure({ mode: 'serial' })

	let created: { pros: number[]; profils: number[] } | undefined
	let context: APIRequestContext | undefined
	// Each project (screen size) runs in its own worker at the same time: its own profiles, its own word.
	let marker = ''

	test.beforeAll(async () => {
		test.setTimeout(240_000)
		const project = test.info().project
		const prefix = `e41${project.name.slice(0, 1)}`
		// Two words that no typo links: a search for one never finds the profiles of the other project.
		marker = project.name === 'chromium' ? 'zyglotest' : 'quarkenstein'
		profiles = await setSearchProfiles()
		context = await pwRequest.newContext({ baseURL: project.use.baseURL })
		created = await buildByApplication(context, GENERATED, {
			prefixe: prefix,
			marqueur: marker,
			communes: DISTANT_CITIES,
			seDeplacent: false,
		})
	})

	test.afterAll(async () => {
		test.setTimeout(120_000)
		if (context && created) await removeByApplication(context, created)
		await context?.dispose()
	})

	// E41
	test('E41 : 45 résultats en trois pages de 20, 20 et 5, sans doublon', async ({ page }) => {
		const resultsPath = `/search?search=${marker}`
		await page.goto(resultsPath)
		const seen: string[] = []
		const cards = () =>
			page
				.locator('main li a[href^="/profil/"]')
				.evaluateAll(liens => liens.map(lien => lien.getAttribute('href') ?? ''))

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${GENERATED} résultats pour « ${marker} »`)
		await expect(page.getByText('Page 1 sur 3')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Page précédente' })).toHaveCount(0)
		seen.push(...(await cards()))
		expect(seen).toHaveLength(20)

		await page.getByRole('link', { name: 'Page suivante' }).click()
		await expect(page).toHaveURL(current => current.pathname + current.search === `${resultsPath}&page=2`)
		await expect(page.getByText('Page 2 sur 3')).toBeVisible()
		// The title still counts everything, and the form keeps the word.
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${GENERATED} résultats pour « ${marker} »`)
		await expect(page.getByLabel('Prestation recherchée')).toHaveValue(marker)
		const second = await cards()
		expect(second).toHaveLength(20)
		seen.push(...second)

		await page.getByRole('link', { name: 'Page suivante' }).click()
		await expect(page.getByText('Page 3 sur 3')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Page suivante' })).toHaveCount(0)
		const third = await cards()
		expect(third).toHaveLength(GENERATED - 40)
		seen.push(...third)

		expect(new Set(seen).size).toBe(GENERATED)
		await page.getByRole('link', { name: 'Page précédente' }).click()
		await expect(page.getByText('Page 2 sur 3')).toBeVisible()
	})

	test('E41 : avec une ville, les pages coupent les sections sans rien répéter ; une page hors bornes est la dernière', async ({
		page,
	}) => {
		const seen: string[] = []
		for (const number of [1, 2, 3]) {
			await page.goto(`/search?search=${marker}&city=Annecy${number > 1 ? `&page=${number}` : ''}`)
			await expect(page.getByText(`Page ${number} sur 3`)).toBeVisible()
			seen.push(
				...(await page
					.locator('main li a[href^="/profil/"]')
					.evaluateAll(liens => liens.map(l => l.getAttribute('href') ?? '')))
			)
		}
		expect(seen).toHaveLength(GENERATED)
		expect(new Set(seen).size).toBe(GENERATED)

		await page.goto(`/search?search=${marker}&page=999`)
		await expect(page.getByText('Page 3 sur 3')).toBeVisible()
		await page.goto(`/search?search=${marker}&page=abc`)
		await expect(page.getByText('Page 1 sur 3')).toBeVisible()
	})

	test('I29 : une page de 20 résultats pèse moins de 50 Ko transmis et ne porte aucune coordonnée', async ({
		request,
	}) => {
		const response = await request.get(`/search?search=${marker}`)
		expect(response.status()).toBe(200)
		const html = await response.text()
		expect(html.match(/href="\/profil\//g)?.length).toBe(20)
		// The server compresses what it sends: the size that crosses the network is the gzip one.
		const forwarded = gzipSync(html).length
		console.info(`I29 : 20 cartes, ${html.length} octets de HTML, ${forwarded} octets transmis (gzip)`)
		expect(forwarded).toBeLessThan(50_000)
		for (const forbidden of ['latitude', 'longitude', 'codeInsee', '06 39 98', 'example.test'])
			expect(html, forbidden).not.toContain(forbidden)
	})
})
