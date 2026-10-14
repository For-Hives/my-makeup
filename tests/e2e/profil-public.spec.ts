import { expect, type Page, test } from '@playwright/test'
import { type ProfilDePage, poserLesProfilsDePage } from '../fixtures/profils-de-page'
import { ECRANS } from '../outils/e2e'

/**
 * The public page of a profile, end to end (tickets 101 to 103; plan 02 E43 and E44), on profiles of
 * the bench that have their own names (tests/fixtures/profils-de-page.ts). The page is read twice: as
 * the server sends it, with no JavaScript (what a search engine reads), and in the browser at both
 * screen sizes.
 */

/** The keys a page must never carry in what it sends: what is private or reserved. */
const CLES_PRIVEES =
	/"(?:pro|strapiId|legacyUsername|statut|motif|verifie|verifieLe|siret|noteInterne|score|superMaquilleuse|coordonnees|telephone|contactPublic|consentiLe|sourceConsentement|codeInsee|latitude|longitude)"\s*:/

const MOTS_INTERDITS = /\b(?:undefined|null|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

let profils: ReadonlyMap<string, ProfilDePage>

test.beforeAll(async () => {
	test.setTimeout(180_000)
	profils = await poserLesProfilsDePage()
})

const profil = (cle: string): ProfilDePage => {
	const trouve = profils.get(cle)
	if (!trouve) throw new Error(`pas de profil d’essai « ${cle} »`)
	return trouve
}

/** The text of the page as the server sends it, tags and scripts out: the words a visitor would read. */
function texteVisible(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/g, ' ')
		.replace(/<style[\s\S]*?<\/style>/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
}

async function sansDebordement(page: Page): Promise<boolean> {
	return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

test.describe('E43 : le profil public, rendu par le serveur', { tag: '@mobile' }, () => {
	test('@smoke le HTML du serveur donne le nom en h1, la spécialité, la zone et la description', async ({
		request,
	}) => {
		const { slug } = profil('reference')
		const reponse = await request.get(`/profil/${slug}`)
		expect(reponse.status()).toBe(200)
		const html = await reponse.text()

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toMatch(/<h1[^>]*>Page Alpha<\/h1>/)
		expect(html).toContain('Maquillage mariage')
		expect(html).toContain('Annecy et 30 km autour')
		expect(html).toContain('Disponible')
		expect(html).toContain('Vous en quelques mots')
		expect(html).toContain('Maquilleuse professionnelle installée à Annecy')
		// One Nav, one h1: the template and the page.
		expect(html.match(/<nav[\s>]/g)?.length).toBeGreaterThanOrEqual(1)
		expect(texteVisible(html)).not.toMatch(MOTS_INTERDITS)
		expect(html).not.toMatch(CLES_PRIVEES)
	})

	test('un profil indisponible le dit', async ({ request }) => {
		const html = await (await request.get(`/profil/${profil('indisponible').slug}`)).text()

		expect(html).toContain('Indisponible')
	})

	test('un profil vide : le nom neutre, la photo du site, aucun titre sans contenu', async ({ request }) => {
		const reponse = await request.get(`/profil/${profil('vide').slug}`)
		expect(reponse.status()).toBe(200)
		const html = await reponse.text()

		expect(html).toMatch(/<h1[^>]*>Maquilleuse professionnelle<\/h1>/)
		expect(html).not.toContain('Vous en quelques mots')
		expect(texteVisible(html)).not.toMatch(MOTS_INTERDITS)
	})

	test('aucune coordonnée non publiée dans la page', async ({ request }) => {
		const html = await (await request.get(`/profil/${profil('sans-contact-public').slug}`)).text()

		expect(html).not.toContain('06 39 98 10 08')
		expect(html).not.toContain('louise-girard.example.test')
		expect(html).not.toMatch(CLES_PRIVEES)
	})

	test('les textes les plus longs : pas de débordement à 390 px, ni à 1440 px', async ({ page }, testInfo) => {
		await page.goto(`/profil/${profil('textes-maximaux').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

		for (const ecran of [ECRANS.mobile, ECRANS.chromium]) {
			await page.setViewportSize(ecran)
			expect(await sansDebordement(page), `à ${ecran.width} px`).toBe(true)
		}
		await page.setViewportSize(ECRANS.mobile)
		await testInfo.attach('profil-textes-maximaux-390px', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})
	})
})
