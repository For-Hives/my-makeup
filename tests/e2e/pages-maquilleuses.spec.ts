import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { check, mainTitles, type OldSiteTitles, type ParityCase, titleWaiting } from '../support/url-parity'

/**
 * The fixed pages for makeup artists and « À propos » (ticket 110): 200, a single h1, a canonical address,
 * and I45 (plan 02 §7.3) for these four addresses: the table promises 200, and the h1 is the old one where
 * the old page had one h1, a single one otherwise.
 */
const anciens: OldSiteTitles = JSON.parse(
	readFileSync(new URL('../fixtures/url-parity-h1.json', import.meta.url), 'utf8')
)

const ADRESSES = [
	'/a-propos',
	'/maquilleuse/partenariats',
	'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
	'/solutions/pour-les-maquilleuses',
] as const

test.describe('Pages fixes côté maquilleuses et À propos', () => {
	for (const adresse of ADRESSES) {
		test(`I45 et E64 : ${adresse} répond 200 avec un seul h1 et une canonique`, async ({ request, page, baseURL }) => {
			const cas: ParityCase = {
				adresse,
				etiquette: adresse,
				famille: 'pages-fixes',
				statuts: [200],
				statutFinal: 200,
				titre: titleWaiting(adresse, 200, anciens),
			}
			const resultat = await check(cas, async chemin => {
				const reponse = await request.get(`${baseURL}${chemin}`, { maxRedirects: 0, failOnStatusCode: false })
				const entetes = reponse.headers()
				return {
					status: reponse.status(),
					location: entetes.location ?? null,
					contentType: entetes['content-type'] ?? null,
					corps: () => reponse.text(),
				}
			})
			expect(resultat).toMatchObject({ etat: 'vert' })

			// The text is in the HTML the server sends, without JavaScript.
			const html = await (await request.get(adresse)).text()
			expect(mainTitles(html)).toHaveLength(1)
			expect(html).not.toMatch(/milliers|paiement sécurisé|avis vérifiés|r[ée]servation/i)

			const reponse = await page.goto(adresse)
			expect(reponse?.status()).toBe(200)
			const titre = await page.title()
			expect(titre.length).toBeLessThanOrEqual(60)
			const description = await page.locator('meta[name="description"]').getAttribute('content')
			expect(description?.length).toBeGreaterThanOrEqual(70)
			expect(description?.length).toBeLessThanOrEqual(155)
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://my-makeup.fr${adresse}`)
			await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		})
	}
})
