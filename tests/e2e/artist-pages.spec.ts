import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { check, mainTitles, type OldSiteTitles, type ParityCase, titleWaiting } from '../support/url-parity'

/**
 * The fixed pages for makeup artists and « À propos » (ticket 110): 200, a single h1, a canonical address,
 * and I45 (plan 02 §7.3) for these four addresses: the table promises 200, and the h1 is the old one where
 * the old page had one h1, a single one otherwise.
 */
const old: OldSiteTitles = JSON.parse(readFileSync(new URL('../fixtures/url-parity-h1.json', import.meta.url), 'utf8'))

const URLS = [
	'/a-propos',
	'/maquilleuse/partenariats',
	'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
	'/solutions/pour-les-maquilleuses',
] as const

test.describe('Pages fixes côté maquilleuses et À propos', () => {
	for (const url of URLS) {
		test(`I45 et E64 : ${url} répond 200 avec un seul h1 et une canonique`, async ({ request, page, baseURL }) => {
			const testCase: ParityCase = {
				adresse: url,
				etiquette: url,
				famille: 'pages-fixes',
				statuts: [200],
				statutFinal: 200,
				titre: titleWaiting(url, 200, old),
			}
			const result = await check(testCase, async chemin => {
				const response = await request.get(`${baseURL}${chemin}`, { maxRedirects: 0, failOnStatusCode: false })
				const headers = response.headers()
				return {
					status: response.status(),
					location: headers.location ?? null,
					contentType: headers['content-type'] ?? null,
					corps: () => response.text(),
				}
			})
			expect(result).toMatchObject({ etat: 'vert' })

			// The text is in the HTML the server sends, without JavaScript.
			const html = await (await request.get(url)).text()
			expect(mainTitles(html)).toHaveLength(1)
			expect(html).not.toMatch(/milliers|paiement sécurisé|avis vérifiés|r[ée]servation/i)

			const response = await page.goto(url)
			expect(response?.status()).toBe(200)
			const title = await page.title()
			expect(title.length).toBeLessThanOrEqual(60)
			const description = await page.locator('meta[name="description"]').getAttribute('content')
			expect(description?.length).toBeGreaterThanOrEqual(70)
			expect(description?.length).toBeLessThanOrEqual(155)
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://my-makeup.fr${url}`)
			await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		})
	}
})
