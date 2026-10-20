import { expect, test } from '@playwright/test'
import { DEMO_ARTICLES, DEMO_TALENTS } from '../../src/demo-data/editorial'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { CONTENU_DU_BANC, poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import { payloadDeTest } from '../outils/payload-test'
import { ouvrirSessionSansMotDePasse } from '../outils/session'

/**
 * Ticket 052: with the set of the bench loaded, the admin panel opens for the admin of the set
 * and counts its 12 profile types, its 3 talents and its 3 articles, one of them a draft.
 *
 * The bench is shared with the other tests of the run, which write their own profiles, talents
 * and articles: the test counts what belongs to the set, by the slugs of the profile types, the talents
 * and the articles of the set, never the total of a list. One test, on the large screen only.
 */
test.describe('Le jeu du banc dans l’administration', () => {
	test('l’admin du jeu voit les 12 profils types, les 3 talents et les 3 articles', async ({ context, page }) => {
		// A load takes about ten seconds, photos included.
		test.setTimeout(120_000)
		const { comptes } = await poserLeJeuDuBanc()
		const admin = comptes.comptes.find(({ type }) => type === 'admin')
		if (!admin) throw new Error('le jeu du banc ne contient pas son admin')
		const session = await ouvrirSessionSansMotDePasse(await payloadDeTest(), admin)
		await context.addCookies(session.cookies)

		await page.goto('/admin/collections/profiles?limit=100')
		// The list shows the slug of a profile, no longer the address of its account (ticket 165).
		for (const { attendu } of DEMO_PROFILES)
			await expect(page.getByRole('link', { name: attendu.slug, exact: true })).toHaveCount(1)
		expect(DEMO_PROFILES).toHaveLength(CONTENU_DU_BANC.profilsTypes)

		await page.goto('/admin/collections/talents?limit=100')
		for (const { slug } of DEMO_TALENTS) await expect(page.locator('tbody tr').filter({ hasText: slug })).toHaveCount(1)

		await page.goto('/admin/collections/articles?limit=100')
		for (const { slug } of DEMO_ARTICLES)
			await expect(page.locator('tbody tr').filter({ hasText: slug })).toHaveCount(1)
		const brouillon = DEMO_ARTICLES.find(({ statut }) => statut === 'draft')
		if (!brouillon) throw new Error('le jeu du banc ne contient pas son brouillon')
		await expect(page.locator('tbody tr').filter({ hasText: brouillon.slug })).toContainText('Brouillon')
	})
})
