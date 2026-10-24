import { expect, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'

/**
 * The five fixed pages for the people looking for a makeup artist and the thank-you page, end to end
 * (ticket 109; plan 02 I45 for these addresses is in tests/e2e/url-parity.spec.ts): 200 with one h1 in the
 * HTML of the server, the thank-you page in noindex, and no horizontal scroll at 390 px.
 */

const PAGES = [
	{
		chemin: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
		h1: /Pourquoi utiliser\s+My\s*Makeup\s+en tant que particulier/,
	},
	{ chemin: '/particulier/trouver-une-maquilleuse', h1: /Trouver une maquilleuse, avec/ },
	{ chemin: '/particulier/centraliser-ses-recherches', h1: /Centraliser ses recherches avec/ },
	{ chemin: '/particulier/explorer-les-profils', h1: /Explorer les profils avec/ },
	{ chemin: '/solutions/pour-les-particuliers', h1: /Trouvez Votre Maquilleuse Idéale avec/ },
] as const

test.describe('Les pages pour les particuliers', { tag: '@mobile' }, () => {
	for (const { chemin: path, h1 } of PAGES) {
		test(`${path} : 200, un seul h1, indexable, lisible sans JavaScript`, async ({ page, request }) => {
			const raw = await request.get(path)
			expect(raw.status()).toBe(200)
			const html = await raw.text()
			expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
			expect(html).toContain(`href="https://my-makeup.fr${path}"`)
			expect(html).not.toMatch(/<meta name="robots" content="noindex/)

			const response = await page.goto(path)
			expect(response?.status()).toBe(200)
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1)
			await expect(page.getByRole('link', { name: 'Trouver ma maquilleuse' })).toHaveAttribute('href', '/search')
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
			expect(await violationsSevere(page)).toEqual([])
		})
	}

	test('/demande-envoyee : 200, un seul h1, noindex, un lien vers la recherche', async ({ page, request }) => {
		const html = await (await request.get('/demande-envoyee')).text()
		expect(html).toMatch(/<meta name="robots" content="noindex/)
		expect(html).not.toContain('rel="canonical"')

		const response = await page.goto('/demande-envoyee')
		expect(response?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre demande est transmise')
		await expect(page.getByRole('link', { name: "Voir d'autres maquilleuses" })).toHaveAttribute('href', '/search')
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
	})
})
