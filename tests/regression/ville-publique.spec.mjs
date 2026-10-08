// UI-11: a postal address typed as the city, against the fake Strapi
// (tests/regression/mock-api.mjs, profile adele-adresse of
// donnees-publiques.mjs, made up), launched by tests/regression/run.mjs:
// the profile is publiable by its commune (h1, no noindex, in the sitemap,
// the commune in the JSON-LD), and the street is published nowhere: not in
// the HTML, not in __NEXT_DATA__, not on a search card. The artist's space
// keeps what she typed and says what her page shows. A street glued to the
// commune (profile ines-virgule) is published nowhere either, and the
// profile stays noindex and out of the sitemap.
// Web-first waits only, no fixed timeout.
import { expect, test } from '@playwright/test'
import { getElementsByTagName, removeElement } from 'domutils'
import { parseDocument } from 'htmlparser2'
import {
	ADRESSE_FICTIVE,
	PROFILS_PUBLICS,
	RUE_COLLEE,
	RUE_FICTIVE,
} from './donnees-publiques.mjs'
import { COMPTE_TEST } from './mock-api.mjs'

const API = process.env.RG_API ?? 'http://127.0.0.1:4112'
const APP = process.env.RG_APP ?? 'http://localhost:3996'

// Never against the production: local hosts only
for (const cible of [API, APP])
	if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(cible).hostname))
		throw new Error(`cible non locale refusée : ${cible}`)

test.use({ testIdAttribute: 'data-cy' })

async function piloter(chemin, corps) {
	const reponse = await fetch(
		API + chemin,
		corps === undefined ? {} : { method: 'POST', body: JSON.stringify(corps) }
	)
	return reponse.json()
}

test.beforeEach(async () => {
	await piloter('/__reset', {})
})

const PROFIL = PROFILS_PUBLICS.find(p => p.attendu.slug === 'adele-adresse')
const { slug: SLUG, ville: VILLE, commune: COMMUNE } = PROFIL.attendu

// --- raw HTML, read with a parser ---
function textes(noeud, acc = []) {
	if (noeud.type === 'text') acc.push(noeud.data)
	for (const enfant of noeud.children ?? []) textes(enfant, acc)
	return acc
}
function texteVisible(html) {
	const document = parseDocument(html)
	for (const script of getElementsByTagName('script', document))
		removeElement(script)
	return textes(document).join(' ')
}
const elements = (html, balise) =>
	getElementsByTagName(balise, parseDocument(html))
const meta = (html, cle) =>
	elements(html, 'meta').find(
		e => e.attribs.name === cle || e.attribs.property === cle
	)?.attribs.content
const canonical = html =>
	elements(html, 'link').find(e => e.attribs.rel === 'canonical')?.attribs
		.href ?? null
const scripts = (html, filtre) =>
	elements(html, 'script')
		.filter(filtre)
		.map(e => JSON.parse(textes(e).join('')))
const jsonLd = html =>
	scripts(html, e => e.attribs.type === 'application/ld+json')
const nextData = html => scripts(html, e => e.attribs.id === '__NEXT_DATA__')[0]

// the street nowhere in a text, case ignored
function sansRue(texte, ou) {
	for (const morceau of RUE_FICTIVE)
		expect(texte.toLowerCase(), `${ou} : « ${morceau} »`).not.toContain(
			morceau.toLowerCase()
		)
}

test.describe('UI-11 adresse postale tapée comme ville', () => {
	test('fiche, HTML brut sans JavaScript : un h1, indexée, la commune affichée et dans le JSON-LD ; la rue nulle part, ni dans __NEXT_DATA__', async ({
		request,
	}) => {
		const reponse = await request.get(`/profil/${SLUG}`, { maxRedirects: 0 })
		expect(reponse.status()).toBe(200)
		const html = await reponse.text()

		expect(elements(html, 'h1').map(e => textes(e).join('').trim())).toEqual([
			'Adèle Fictive',
		])
		// publiable: indexed, canonical on the slug
		expect(meta(html, 'robots')).toBeUndefined()
		expect(reponse.headers()['x-robots-tag']).toBeUndefined()
		expect(canonical(html)).toBe(`${APP}/profil/${SLUG}`)

		// the commune and its département, on the page and in the titles
		const texte = texteVisible(html)
		expect(texte).toContain(`${VILLE} et 30 km autour`)
		expect(meta(html, 'og:title')).toContain(VILLE)

		// JSON-LD: the commune alone, as the place and the area served
		const [personne] = jsonLd(html)
		expect(personne['@type']).toBe('Person')
		expect(personne.workLocation).toEqual({ '@type': 'Place', name: COMMUNE })
		for (const offre of personne.makesOffer)
			expect(offre.itemOffered.areaServed).toEqual({
				'@type': 'City',
				name: COMMUNE,
			})

		// the props of the page carry the public city only
		const donnees = nextData(html)
		expect(donnees.props.pageProps.profilData.attributes.city).toBe(VILLE)

		// the street: not in the whole HTML (text, attributes, JSON-LD,
		// __NEXT_DATA__)
		sansRue(html, 'HTML')
		sansRue(JSON.stringify(donnees), '__NEXT_DATA__')
		expect(html).not.toContain(ADRESSE_FICTIVE)
	})

	test('sitemap : le profil y est', async ({ request }) => {
		const reponse = await request.get('/sitemap.xml')
		expect(reponse.status()).toBe(200)
		const xml = await reponse.text()
		expect(xml).toContain(`<loc>${APP}/profil/${SLUG}</loc>`)
		sansRue(xml, 'sitemap')
	})

	test('dans un navigateur : même rendu une fois hydraté, aucune erreur, la rue nulle part', async ({
		page,
	}) => {
		const erreurs = []
		page.on('pageerror', e => erreurs.push(e.message))
		page.on('console', m => {
			// the pictures of the fake Strapi are not on an allowed host of
			// next/image: their 400 is expected here
			if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
				erreurs.push(m.text())
		})
		await page.goto(`/profil/${SLUG}`)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Adèle Fictive'
		)
		await expect(page.getByTestId('resume-city-action-radius')).toHaveText(
			`${VILLE} et 30 km autour`
		)
		sansRue(await page.content(), 'DOM hydraté')
		expect(erreurs).toEqual([])
	})

	test('un code de département puis du texte (« 74 et alentours ») : affiché tel quel, noindex, hors du sitemap', async ({
		request,
	}) => {
		const reponse = await request.get('/profil/lea-alentours', {
			maxRedirects: 0,
		})
		expect(reponse.status()).toBe(200)
		const html = await reponse.text()
		expect(meta(html, 'robots')).toBe('noindex,follow')
		expect(texteVisible(html)).toContain('74 et alentours et 30 km autour')
		expect(meta(html, 'og:title')).toContain('à 74 et alentours')
		expect(html).not.toMatch(/Et Alentours/)
		expect(nextData(html).props.pageProps.profilData.attributes.city).toBe(
			'74 et alentours'
		)
		const xml = await (await request.get('/sitemap.xml')).text()
		expect(xml).not.toContain('lea-alentours')
	})

	test('une rue collée à la commune par une virgule (« Fictiville,impasse … ») : noindex, hors du sitemap, la rue nulle part', async ({
		request,
	}) => {
		const reponse = await request.get('/profil/ines-virgule', {
			maxRedirects: 0,
		})
		expect(reponse.status()).toBe(200)
		const html = await reponse.text()
		expect(elements(html, 'h1').map(e => textes(e).join('').trim())).toEqual([
			'Inès Fictive',
		])
		expect(meta(html, 'robots')).toBe('noindex,follow')
		expect(canonical(html)).toBeNull()
		const donnees = nextData(html)
		expect(donnees.props.pageProps.profilData.attributes.city).toBeNull()
		sansRue(html, 'HTML')
		sansRue(JSON.stringify(donnees), '__NEXT_DATA__')
		expect(html).not.toContain(RUE_COLLEE)
		expect(html).not.toContain('Fictiville')
		const xml = await (await request.get('/sitemap.xml')).text()
		expect(xml).not.toContain('ines-virgule')
	})

	test('carte de recherche : la commune, jamais la rue', async ({ page }) => {
		// one more profile whose city is an address (made up)
		await piloter('/__multiplier', {
			n: 1,
			city: '9 rue des Essais Fictifs 74000 Annecy',
		})
		await page.goto('/search?search=Numéro')
		const carte = page.getByTestId('search-result').filter({
			hasText: 'Fictive Numéro 1',
		})
		await expect(carte).toHaveCount(1)
		await expect(carte).toContainText('Annecy (74) et 10 km autour')
		sansRue(await page.content(), 'page de recherche')
	})

	test('espace de la maquilleuse : ce qu’elle a tapé, ce que montre sa page et l’aide', async ({
		page,
	}) => {
		await piloter('/__profil', { city: ADRESSE_FICTIVE, action_radius: 30 })
		const requete = page.context().request
		const { csrfToken } = await (await requete.get('/api/auth/csrf')).json()
		await requete.post('/api/auth/callback/credentials', {
			form: {
				csrfToken,
				email: COMPTE_TEST.email,
				password: COMPTE_TEST.password,
				json: 'true',
			},
		})
		const session = page.waitForResponse(r =>
			r.url().endsWith('/api/auth/session')
		)
		await page.goto('/auth/profil')
		await session
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')

		// her own space keeps the value she typed
		await expect(page.getByText(ADRESSE_FICTIVE).first()).toBeVisible()
		await expect(page.getByTestId('location-city-public')).toHaveText(
			`Sur ta page publique : ${VILLE}`
		)
		const aide =
			'Indique ta ville (et ton code postal), pas ton adresse : elle est publique.'
		await expect(page.getByTestId('location-city-help')).toHaveText(aide)

		// the field of the modal, with the same help
		await page.getByTestId('update-location-button').click()
		await expect(page.getByTestId('city-input')).toHaveValue(ADRESSE_FICTIVE)
		await expect(page.getByTestId('city-help')).toHaveText(aide)
		await expect(page.getByTestId('city-input')).toHaveAttribute(
			'aria-describedby',
			'city-aide'
		)
	})
})
