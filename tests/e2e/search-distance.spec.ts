import { expect, type Page, type TestInfo, test } from '@playwright/test'
import { type SearchProfile, setSearchProfiles } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The search by city ranked by distance and its honest empty state (ticket 295; audit UX improvements 3 and
 * 21). The bench is shared: the tests read the profiles they loaded, and never count the others.
 */

let reference: SearchProfile

/** No sideways scroll, every link on its own line at least 44 px high, no serious axe violation; then the capture. */
async function checkScreen(page: Page, name: string, info: TestInfo) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
	expect(overflow).toBeLessThanOrEqual(0)
	const small = await page
		.locator('main ul li > a')
		.evaluateAll(links => links.filter(link => link.getBoundingClientRect().height < 44).map(link => link.textContent))
	expect(small, 'liens plus bas que 44 px').toEqual([])
	expect(await violationsSevere(page)).toEqual([])
	await info.attach(`${name}-${info.project.name}`, {
		body: await page.screenshot({ fullPage: true }),
		contentType: 'image/png',
	})
}

test.describe('Recherche par distance', () => {
	test.beforeAll(async () => {
		test.setTimeout(180_000)
		const found = (await setSearchProfiles()).get('reference')
		if (!found) throw new Error('pas de profil d’essai « reference »')
		reference = found
	})

	test.beforeEach(async ({ request }) => {
		await refreshProfilePages(request, reference)
	})

	test(
		'personne près de Lyon : le titre le dit, la base n’est pas listée',
		{ tag: ['@mobile'] },
		async ({ page }, info) => {
			await page.goto('/search?city=Lyon')

			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personne n’est encore inscrite près de Lyon.')
			await expect(page.getByRole('link', { name: 'Créez votre profil' })).toHaveAttribute('href', '/auth/signup')
			await expect(page.getByRole('heading', { level: 2, name: /Autres maquilleuses/ })).toHaveCount(0)
			await expect(page.getByText('Aucun résultat')).toHaveCount(0)
			// At most four cards, all under « Elles se déplacent loin », and never the profiles of Annecy.
			expect(await page.locator('main li a[href^="/profil/"]').count()).toBeLessThanOrEqual(4)
			await expect(page.locator(`a[href="/profil/${reference.slug}"]`)).toHaveCount(0)
			await checkScreen(page, 'recherche-vide-lyon', info)
		}
	)

	test(
		'une ville étrangère : la page dit que seuls les pays sont lus',
		{ tag: ['@mobile'] },
		async ({ page }, info) => {
			await page.goto('/search?city=Gen%C3%A8ve')

			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Personne n’est encore inscrite près de Genève.')
			await expect(page.getByText('seuls les pays sont lus')).toBeVisible()
			await expect(page.getByRole('link', { name: 'cherchez « Suisse »' })).toHaveAttribute(
				'href',
				'/search?city=Suisse'
			)
			await checkScreen(page, 'recherche-vide-geneve', info)
		}
	)

	test(
		'près d’Annecy-le-Vieux : les maquilleuses de l’agglomération sous « Se déplacent jusqu’à vous »',
		{
			tag: ['@mobile'],
		},
		async ({ page }, info) => {
			await page.goto('/search?city=Annecy-le-Vieux')

			await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^\d+ résultats? pour « Annecy-le-Vieux »$/)
			const covering = page.locator('main section').filter({
				has: page.getByRole('heading', { level: 2, name: 'Se déplacent jusqu’à vous' }),
			})
			await expect(covering.locator(`a[href="/profil/${reference.slug}"]`)).toHaveCount(1)
			await expect(page.getByRole('heading', { level: 2, name: /Autres maquilleuses/ })).toHaveCount(0)
			await checkScreen(page, 'recherche-annecy-le-vieux', info)
		}
	)
})
