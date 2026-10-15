import { expect, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'

/**
 * The five fixed pages for the people looking for a makeup artist and the thank-you page, end to end
 * (ticket 109; plan 02 I45 for these addresses is in tests/e2e/parite-urls.spec.ts): 200 with one h1 in the
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
	for (const { chemin, h1 } of PAGES) {
		test(`${chemin} : 200, un seul h1, indexable, lisible sans JavaScript`, async ({ page, request }) => {
			const brut = await request.get(chemin)
			expect(brut.status()).toBe(200)
			const html = await brut.text()
			expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
			expect(html).toContain(`href="https://my-makeup.fr${chemin}"`)
			expect(html).not.toMatch(/<meta name="robots" content="noindex/)

			const reponse = await page.goto(chemin)
			expect(reponse?.status()).toBe(200)
			await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1)
			await expect(page.getByRole('link', { name: 'Je cherche des maquilleuses' })).toHaveAttribute('href', '/search')
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
			expect(await violationsGraves(page)).toEqual([])
		})
	}

	test('/demande-envoyee : 200, un seul h1, noindex, un lien vers la recherche', async ({ page, request }) => {
		const html = await (await request.get('/demande-envoyee')).text()
		expect(html).toMatch(/<meta name="robots" content="noindex/)
		expect(html).not.toContain('rel="canonical"')

		const reponse = await page.goto('/demande-envoyee')
		expect(reponse?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre demande est transmise')
		await expect(page.getByRole('link', { name: "Voir d'autres maquilleuses" })).toHaveAttribute('href', '/search')
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
	})
})
