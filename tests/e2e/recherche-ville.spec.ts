import { expect, test } from '@playwright/test'
import { MOT_DES_ESSAIS, type ProfilDeRecherche, poserLesProfilsDeRecherche } from '../fixtures/profils-de-recherche'
import { rafraichirLesPagesDesProfils } from '../outils/pages-publiques'

/**
 * The search by city (ticket 098; plan 02 E38 and E42). The bench is shared with the other tests, which
 * write their own profiles: the tests count the profiles they loaded themselves
 * (tests/fixtures/profils-de-recherche.ts), by their address.
 *
 * Every search carries the word only those profiles hold (ticket 225): the city places them, and no profile of
 * another test, in Annecy or anywhere, can change a count or push one of them onto a second page.
 */

const MOT = encodeURIComponent(MOT_DES_ESSAIS)
const chercher = (ville: string) => `/search?search=${MOT}&city=${encodeURIComponent(ville)}`

// What the fixture holds, by the rule of the directory: listed, whatever the profile can be published or not.
const LISTES = [
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

let profils: ReadonlyMap<string, ProfilDeRecherche>
const profil = (cle: string): ProfilDeRecherche => {
	const trouve = profils.get(cle)
	if (!trouve) throw new Error(`pas de profil d’essai « ${cle} »`)
	return trouve
}

test.describe('Recherche par ville', () => {
	test.beforeAll(async () => {
		test.setTimeout(180_000)
		profils = await poserLesProfilsDeRecherche()
	})

	// The pages of the search keep the directory in the cache of Next: what an earlier request of the run saw
	// is not what the fixture holds. The application refreshes it, as it does when a profile is saved.
	test.beforeEach(async ({ request }) => {
		await rafraichirLesPagesDesProfils(request, profil('reference'))
	})

	// E38
	test('E38 : par ville, des cartes avec nom, spécialité, zone et photo, et un titre qui ne compte que la ville', {
		tag: ['@smoke', '@mobile'],
	}, async ({ page }) => {
		await page.goto(chercher('Annecy'))

		const titre = page.getByRole('heading', { level: 1 })
		await expect(titre).toHaveCount(1)
		await expect(titre).toHaveText(`${A_ANNECY.length} résultats pour « ${MOT_DES_ESSAIS} » à « Annecy »`)
		const compte = Number(((await titre.textContent()) ?? '').match(/^(\d+)/)?.[1])
		// The title counts the artists of Annecy: the first list, before the first section.
		expect(await page.locator('main ul').first().locator('> li').count()).toBe(compte)
		const total = await page.locator('main li a[href^="/profil/"]').count()
		expect(total).toBe(LISTES.length)

		const reference = profil('reference')
		const carte = page.locator(`a[href="/profil/${reference.slug}"]`)
		await expect(carte).toHaveCount(1)
		await expect(carte.getByRole('heading', { level: 3, name: reference.nom })).toBeVisible()
		await expect(carte).toContainText(reference.specialite ?? '')
		await expect(carte).toContainText('Annecy et 30 km autour')
		const photo = carte.locator('img')
		await expect(photo).toBeVisible()
		await expect(photo).toHaveAttribute('alt', `Photo de ${reference.nom}`)
		// The photo is its own, not the default one.
		await expect(photo).toHaveAttribute('src', /essai-reference-principale/)

		// Nothing overflows sideways, at 1440 px as at 390 px.
		const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
		expect(debordement).toBeLessThanOrEqual(0)
	})

	test('les maquilleuses de la ville d’abord, puis le même département, puis celles qui se déplacent', async ({
		page,
	}) => {
		await page.goto(chercher('Annecy'))

		// The sections under the artists of the city: the list of the city has its own, with a hidden title.
		const sections = page.locator('main section').filter({ hasNot: page.locator('#recherche-titre-locaux') })
		await expect(sections.first().getByRole('heading', { level: 2 })).toHaveText(
			'Autres maquilleuses du 74 (Haute-Savoie)'
		)
		for (const cle of ['ville-voisine', 'ancien-nom-accentue'])
			await expect(sections.first().locator(`a[href="/profil/${profil(cle).slug}"]`)).toHaveCount(1)
		const deplacent = sections.filter({
			has: page.getByRole('heading', { level: 2, name: 'Autres maquilleuses qui se déplacent' }),
		})
		await expect(deplacent.locator(`a[href="/profil/${profil('ville-eloignee').slug}"]`)).toHaveCount(1)
		// The ones of the city are not repeated under a section.
		for (const cle of A_ANNECY) await expect(sections.locator(`a[href="/profil/${profil(cle).slug}"]`)).toHaveCount(0)
	})

	test('un département tapé ouvre la liste par ses maquilleuses', async ({ page }) => {
		await page.goto(chercher('Haute-Savoie'))

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			`${LISTES.length - 1} résultats pour « ${MOT_DES_ESSAIS} » à « Haute-Savoie »`
		)
		const premiere = page.locator('main ul').first()
		for (const cle of [...A_ANNECY, 'ville-voisine', 'ancien-nom-accentue'] as const)
			await expect(premiere.locator(`a[href="/profil/${profil(cle).slug}"]`)).toHaveCount(1)
	})

	test('une ville où personne ne travaille le dit, et garde les autres sous leurs titres', async ({ page }) => {
		await page.goto(chercher('Grenoble'))

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			`Aucun résultat pour « ${MOT_DES_ESSAIS} » à « Grenoble »`
		)
		await expect(
			page.getByText('Aucune maquilleuse n’indique « Grenoble » (ville ou département) dans son profil.')
		).toBeVisible()
		await expect(page.getByRole('heading', { level: 2, name: 'Autres maquilleuses qui se déplacent' })).toBeVisible()
	})

	// E42, as the decisions of 09/10 and 13/10 changed it: empty, unavailable and hidden are absent; a
	// profile that is active but cannot be published is there.
	test('E42 : vide, indisponible et masqué sont absents ; actif non publiable est présent', async ({ page }) => {
		await page.goto(chercher('Annecy'))

		const adresses = await page
			.locator('main li a[href^="/profil/"]')
			.evaluateAll(liens => liens.map(lien => lien.getAttribute('href')))
		for (const cle of LISTES) expect(adresses, cle).toContain(`/profil/${profil(cle).slug}`)
		for (const cle of ABSENTS) expect(adresses, cle).not.toContain(`/profil/${profil(cle).slug}`)
		expect(new Set(adresses).size).toBe(adresses.length)
	})

	test('chaque carte mène à l’adresse définitive du profil, et la page ne porte aucune coordonnée', async ({
		page,
		request,
	}) => {
		await page.goto(chercher('Annecy'))
		const adresses = await page
			.locator('main li a[href^="/profil/"]')
			.evaluateAll(liens => liens.map(lien => lien.getAttribute('href')))
		for (const adresse of adresses) expect(adresse).toMatch(/^\/profil\/[a-z0-9]+(?:-[a-z0-9]+)*$/)

		const reponse = await request.get('/search?city=Annecy')
		const html = await reponse.text()
		for (const interdit of ['latitude', 'longitude', 'codeInsee', '06 39 98', 'example.test'])
			expect(html, interdit).not.toContain(interdit)
	})

	test('la recherche ne s’indexe jamais : noindex en en-tête et en balise, sans adresse canonique', async ({
		page,
	}) => {
		const reponse = await page.goto('/search?city=Annecy')

		expect(reponse?.headers()['x-robots-tag']).toBe('noindex, follow')
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
