import { expect, test } from '@playwright/test'
import { createContent, deleteContent } from '../support/public-pages'
import { mainTitles } from '../support/url-parity'

/** The home page (ticket 097): its h1, its search block, its talents, its structured data. */

const ONLINE_H1 = "Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple"

test.describe('Accueil', () => {
	// E64, for the home page: the SEO tags of the other pages are E64 of their own tickets.
	test('E64 : titre, description, canonique, aperçu de partage et un seul h1', { tag: '@smoke' }, async ({ page }) => {
		const response = await page.goto('/')

		expect(response?.status()).toBe(200)
		const title = await page.title()
		expect(title.length).toBeLessThanOrEqual(60)
		expect(title).toMatch(/\| My-Makeup$/)
		const description = await page.locator('meta[name="description"]').getAttribute('content')
		expect(description?.length).toBeGreaterThanOrEqual(70)
		expect(description?.length).toBeLessThanOrEqual(155)
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://my-makeup.fr')
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
		await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
		await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', description ?? '')
		await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website')
		await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
			'content',
			/^https:\/\/my-makeup\.fr\/assets\/.+/
		)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1, name: ONLINE_H1 })).toBeVisible()
	})

	test('le HTML sans JavaScript porte le h1, les talents publiés avec leur lien, et les données structurées', async ({
		request,
	}) => {
		test.setTimeout(120_000)
		const suffix = Date.now().toString(36)
		const slug = `essai-accueil-${suffix}`
		const title = `Essai accueil ${suffix}`
		const identifier = await createContent(request, 'talents', {
			title: title,
			slug,
			description: 'Un talent fictif.',
			_status: 'published',
		})
		try {
			// The save runs inside the application: it refreshes the home page, which then lists the talent.
			await expect
				.poll(async () => (await (await request.get('/')).text()).includes(`href="/talent/${slug}"`))
				.toBe(true)

			const response = await request.get('/')
			expect(response.status()).toBe(200)
			const html = await response.text()
			expect(mainTitles(html)).toEqual([ONLINE_H1])
			expect(html).toContain(title)
			const tags = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
			expect(tags).toHaveLength(1)
			const data = JSON.parse((tags[0]?.[1] ?? '').replaceAll('\\u003c', '<')) as {
				'@graph': { '@type': string }[]
			}
			expect(data['@graph'].map(({ '@type': type }) => type)).toEqual(['Organization', 'WebSite'])
			expect(html).not.toMatch(/milliers|paiement sécurisé|avis vérifiés|réservation/i)
		} finally {
			await deleteContent(request, 'talents', identifier)
		}
	})

	test('un talent en brouillon n’est pas listé ; un talent supprimé ne l’est plus', async ({ request }) => {
		test.setTimeout(120_000)
		const suffix = Date.now().toString(36)
		const published = `essai-publie-${suffix}`
		const draft = `essai-brouillon-${suffix}`
		const publishedId = await createContent(request, 'talents', {
			title: `Essai ${published}`,
			slug: published,
			_status: 'published',
		})
		const draftId = await createContent(request, 'talents', {
			title: `Essai ${draft}`,
			slug: draft,
			_status: 'draft',
		})
		try {
			await expect
				.poll(async () => (await (await request.get('/')).text()).includes(`href="/talent/${published}"`))
				.toBe(true)
			expect(await (await request.get('/')).text()).not.toContain(draft)
		} finally {
			await deleteContent(request, 'talents', publishedId)
			await deleteContent(request, 'talents', draftId)
		}
		await expect.poll(async () => (await (await request.get('/')).text()).includes(published)).toBe(false)
	})

	test('le bloc de recherche envoie vers la recherche avec les mêmes paramètres, avec ou sans JavaScript', {
		tag: '@mobile',
	}, async ({ page }) => {
		await page.goto('/')
		await page.getByLabel('Ville de la prestation').fill('Annecy')
		await page.getByLabel('Prestation recherchée').fill('mariage')
		await page.getByRole('button', { name: 'Trouver une maquilleuse' }).click()

		await expect(page).toHaveURL(/\/search\?search=mariage&city=Annecy$/)
	})

	test('une ville seule est une recherche : l’adresse porte la ville, et la page de recherche la reprend', async ({
		page,
	}) => {
		await page.goto('/')
		await page.getByLabel('Ville de la prestation').fill('Annecy')
		await page.getByRole('button', { name: 'Trouver une maquilleuse' }).click()

		await expect(page).toHaveURL(/\/search\?search=&city=Annecy$/)
		await expect(page.getByLabel('Ville de la prestation')).toHaveValue('Annecy')
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
	})
})
