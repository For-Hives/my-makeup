import { randomInt } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { type APIRequestContext, expect, request as pwRequest, test } from '@playwright/test'
import { MOT_DES_ESSAIS, type ProfilDeRecherche, poserLesProfilsDeRecherche } from '../fixtures/profils-de-recherche'
import { COMMUNES_ELOIGNEES, fabriquerParLApplication, retirerParLApplication } from '../outils/fabrique-profils'
import { rafraichirLesPagesDesProfils } from '../outils/pages-publiques'

/**
 * The search by a word, its pages and its brake (tickets 099 and 100; plan 02 E39, E40, E41, I29 and
 * I30 through the running application). The bench is shared with the other tests, which write their
 * own profiles: the tests look for the profiles they loaded themselves, by their address
 * (tests/fixtures/profils-de-recherche.ts), and for the generated ones by a word of their own.
 */

const GENEREES = 45

// The word only the loaded profiles hold (ticket 225), with the word under test: a search for « mariage » alone
// is cut at 20 results, and the profiles of the other tests that speak of marriage push these ones off the page.
const MOT = encodeURIComponent(MOT_DES_ESSAIS)

let profils: ReadonlyMap<string, ProfilDeRecherche>
const profil = (cle: string): ProfilDeRecherche => {
	const trouve = profils.get(cle)
	if (!trouve) throw new Error(`pas de profil d’essai « ${cle} »`)
	return trouve
}
const lien = (cle: string) => `a[href="/profil/${profil(cle).slug}"]`

test.describe('Recherche par mot, par pages', () => {
	test.beforeAll(async () => {
		test.setTimeout(240_000)
		profils = await poserLesProfilsDeRecherche()
	})

	// The pages keep the directory in the cache of Next: what an earlier request saw is not what the fixture holds.
	test.beforeEach(async ({ request }) => {
		await rafraichirLesPagesDesProfils(request, profil('reference'))
	})

	// E39, adapted: the decisions of 13/10 make it a word and a city (the speciality is a word), with the filters in the address.
	test('E39 : un mot et une ville, la ville d’abord, les filtres dans l’adresse', {
		tag: ['@smoke', '@mobile'],
	}, async ({ page }) => {
		await page.goto('/search')
		await page.getByLabel('Prestation recherchée').fill(`mariage ${MOT_DES_ESSAIS}`)
		await page.getByLabel('Ville de la prestation').fill('Annecy')
		await page.getByRole('button', { name: 'Trouver une maquilleuse' }).click()

		await expect(page).toHaveURL(`/search?search=mariage+${MOT}&city=Annecy`)
		const titre = page.getByRole('heading', { level: 1 })
		await expect(titre).toHaveCount(1)
		await expect(titre).toHaveText(`5 résultats pour « mariage ${MOT_DES_ESSAIS} » à « Annecy »`)
		// The artists of Annecy whose profile speaks of marriage lead the list; the title counts them only.
		const premiere = page.locator('main ul').first()
		await expect(premiere.locator(lien('reference'))).toHaveCount(1)
		const compte = Number(((await titre.textContent()) ?? '').match(/^(\d+)/)?.[1])
		expect(await premiere.locator('> li').count()).toBe(compte)
		// Nantes and Annemasse are not in the first list, and not left out: they follow, under their own headings.
		await expect(premiere.locator(lien('ville-eloignee'))).toHaveCount(0)
		await expect(page.locator('main section').locator(lien('ville-eloignee'))).toHaveCount(1)
		// The form keeps what was typed.
		await expect(page.getByLabel('Prestation recherchée')).toHaveValue(`mariage ${MOT_DES_ESSAIS}`)
		await expect(page.getByLabel('Ville de la prestation')).toHaveValue('Annecy')
	})

	test('un mot qu’aucun profil de la ville ne porte le dit, et garde les autres sous leurs titres', async ({
		page,
	}) => {
		await page.goto(`/search?search=%C3%A9v%C3%A9nementiel+${MOT}&city=Annecy`)

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			`Aucun résultat pour « événementiel ${MOT_DES_ESSAIS} » à « Annecy »`
		)
		await expect(
			page.getByText('Aucune maquilleuse n’indique « Annecy » (ville ou département) dans son profil.')
		).toBeVisible()
		// Chloé Bertin, in Nantes, is the one who writes it: she follows, she is not left out.
		await expect(page.locator(lien('ville-eloignee'))).toHaveCount(1)
		await expect(page.locator(lien('reference'))).toHaveCount(0)
	})

	test('sans accent et avec une faute, on trouve : « Anecy » et « evenementiel »', async ({ page }) => {
		await page.goto(`/search?search=Anecy+${MOT}`)
		await expect(page.locator(lien('reference'))).toHaveCount(1)

		await page.goto(`/search?search=evenementiel+${MOT}`)
		await expect(page.locator(lien('ville-eloignee'))).toHaveCount(1)
		await expect(page.locator(lien('reference'))).toHaveCount(0)
	})

	test('les mots de la demande sont ignorés : « je cherche une maquilleuse pour mon mariage »', async ({ page }) => {
		await page.goto(`/search?search=je+cherche+une+maquilleuse+pour+mon+mariage+${MOT}`)

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			new RegExp(`^\\d+ résultats? pour « je cherche une maquilleuse pour mon mariage ${MOT_DES_ESSAIS} »$`)
		)
		await expect(page.locator(lien('reference'))).toHaveCount(1)
	})

	test('un profil masqué, indisponible ou vide ne sort jamais d’une recherche par mot', async ({ page }) => {
		await page.goto(`/search?search=mariage+${MOT}`)

		const adresses = await page
			.locator('main li a[href^="/profil/"]')
			.evaluateAll(liens => liens.map(lien => lien.getAttribute('href')))
		for (const cle of ['reference', 'ville-voisine', 'actif-non-publiable', 'verifiee'])
			expect(adresses, cle).toContain(`/profil/${profil(cle).slug}`)
		for (const cle of ['indisponible', 'vide', 'masquee'])
			expect(adresses, cle).not.toContain(`/profil/${profil(cle).slug}`)
	})

	// E40
	test('E40 : aucun résultat, un message utile', {
		tag: ['@smoke', '@mobile'],
	}, async ({ page }) => {
		await page.goto('/search?search=zzqqxxyy')

		const titre = page.getByRole('heading', { level: 1 })
		await expect(titre).toHaveCount(1)
		await expect(titre).toHaveText('Aucun résultat pour « zzqqxxyy »')
		await expect(page.getByText('Essayez un autre mot (mariage, soirée, effets spéciaux…).')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Créez votre profil' })).toHaveAttribute('href', '/auth/signup')
		// Nothing overflows sideways, at 1440 px as at 390 px.
		const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		expect(debordement).toBeLessThanOrEqual(0)
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
		await page.goto(`/search?search=${MOT}&city=74`)
		await expect(page.locator('main ul').first().locator(lien('reference'))).toHaveCount(1)
	})

	test('I30 : la 61e recherche d’une adresse est refusée en 429, en français ; une autre adresse, les pages en cache et le profil passent', async ({
		request,
	}) => {
		test.setTimeout(120_000)
		// One address of the documentation range per run: the two projects of a run never share a counter.
		const adresse = `203.0.113.${randomInt(1, 255)}`
		const autre = `198.51.100.${randomInt(1, 255)}`
		const entetes = { 'x-forwarded-for': adresse }
		for (let i = 1; i <= 60; i += 1) {
			const reponse = await request.get(`/search?city=Annecy&page=${i}`, { headers: entetes })
			expect(reponse.status(), `recherche ${i}`).toBe(200)
		}
		const refusee = await request.get('/search?city=Annecy', { headers: entetes })
		expect(refusee.status()).toBe(429)
		expect(refusee.headers()['retry-after']).toMatch(/^\d+$/)
		expect(refusee.headers()['x-robots-tag']).toContain('noindex')
		expect(await refusee.text()).toContain('Trop de recherches en peu de temps')

		// The pages that are cached are not braked, and neither is another address.
		for (const chemin of ['/', `/profil/${profil('reference').slug}`])
			expect((await request.get(chemin, { headers: entetes })).status(), chemin).toBe(200)
		expect((await request.get('/search?city=Annecy', { headers: { 'x-forwarded-for': autre } })).status()).toBe(200)
	})
})

// The pages need more than 20 results, which the bench does not hold: 45 profiles are created through the
// application for these tests and removed after them. They are far from Annecy and Nantes and none travels,
// so for every other search of the shared bench they come last, under « Autres maquilleuses ».
test.describe('Pages de résultats', () => {
	test.describe.configure({ mode: 'serial' })

	let creees: { pros: number[]; profils: number[] } | undefined
	let contexte: APIRequestContext | undefined
	// Each project (screen size) runs in its own worker at the same time: its own profiles, its own word.
	let marqueur = ''

	test.beforeAll(async () => {
		test.setTimeout(240_000)
		const projet = test.info().project
		const prefixe = `e41${projet.name.slice(0, 1)}`
		// Two words that no typo links: a search for one never finds the profiles of the other project.
		marqueur = projet.name === 'chromium' ? 'zyglotest' : 'quarkenstein'
		profils = await poserLesProfilsDeRecherche()
		contexte = await pwRequest.newContext({ baseURL: projet.use.baseURL })
		creees = await fabriquerParLApplication(contexte, GENEREES, {
			prefixe,
			marqueur,
			communes: COMMUNES_ELOIGNEES,
			seDeplacent: false,
		})
	})

	test.afterAll(async () => {
		test.setTimeout(120_000)
		if (contexte && creees) await retirerParLApplication(contexte, creees)
		await contexte?.dispose()
	})

	// E41
	test('E41 : 45 résultats en trois pages de 20, 20 et 5, sans doublon', async ({ page }) => {
		const adresse = `/search?search=${marqueur}`
		await page.goto(adresse)
		const vues: string[] = []
		const cartes = () =>
			page
				.locator('main li a[href^="/profil/"]')
				.evaluateAll(liens => liens.map(lien => lien.getAttribute('href') ?? ''))

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${GENEREES} résultats pour « ${marqueur} »`)
		await expect(page.getByText('Page 1 sur 3')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Page précédente' })).toHaveCount(0)
		vues.push(...(await cartes()))
		expect(vues).toHaveLength(20)

		await page.getByRole('link', { name: 'Page suivante' }).click()
		await expect(page).toHaveURL(url => url.pathname + url.search === `${adresse}&page=2`)
		await expect(page.getByText('Page 2 sur 3')).toBeVisible()
		// The title still counts everything, and the form keeps the word.
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${GENEREES} résultats pour « ${marqueur} »`)
		await expect(page.getByLabel('Prestation recherchée')).toHaveValue(marqueur)
		const deuxieme = await cartes()
		expect(deuxieme).toHaveLength(20)
		vues.push(...deuxieme)

		await page.getByRole('link', { name: 'Page suivante' }).click()
		await expect(page.getByText('Page 3 sur 3')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Page suivante' })).toHaveCount(0)
		const troisieme = await cartes()
		expect(troisieme).toHaveLength(GENEREES - 40)
		vues.push(...troisieme)

		expect(new Set(vues).size).toBe(GENEREES)
		await page.getByRole('link', { name: 'Page précédente' }).click()
		await expect(page.getByText('Page 2 sur 3')).toBeVisible()
	})

	test('E41 : avec une ville, les pages coupent les sections sans rien répéter ; une page hors bornes est la dernière', async ({
		page,
	}) => {
		const vues: string[] = []
		for (const numero of [1, 2, 3]) {
			await page.goto(`/search?search=${marqueur}&city=Annecy${numero > 1 ? `&page=${numero}` : ''}`)
			await expect(page.getByText(`Page ${numero} sur 3`)).toBeVisible()
			vues.push(
				...(await page
					.locator('main li a[href^="/profil/"]')
					.evaluateAll(liens => liens.map(l => l.getAttribute('href') ?? '')))
			)
		}
		expect(vues).toHaveLength(GENEREES)
		expect(new Set(vues).size).toBe(GENEREES)

		await page.goto(`/search?search=${marqueur}&page=999`)
		await expect(page.getByText('Page 3 sur 3')).toBeVisible()
		await page.goto(`/search?search=${marqueur}&page=abc`)
		await expect(page.getByText('Page 1 sur 3')).toBeVisible()
	})

	test('I29 : une page de 20 résultats pèse moins de 50 Ko transmis et ne porte aucune coordonnée', async ({
		request,
	}) => {
		const reponse = await request.get(`/search?search=${marqueur}`)
		expect(reponse.status()).toBe(200)
		const html = await reponse.text()
		expect(html.match(/href="\/profil\//g)?.length).toBe(20)
		// The server compresses what it sends: the size that crosses the network is the gzip one.
		const transmis = gzipSync(html).length
		console.info(`I29 : 20 cartes, ${html.length} octets de HTML, ${transmis} octets transmis (gzip)`)
		expect(transmis).toBeLessThan(50_000)
		for (const interdit of ['latitude', 'longitude', 'codeInsee', '06 39 98', 'example.test'])
			expect(html, interdit).not.toContain(interdit)
	})
})
