import { expect, test } from '@playwright/test'
import { ARTICLES_DU_JEU, TALENTS_DU_JEU } from '../../src/jeu-fictif/redaction'
import { CONTENU_DU_BANC, poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import { payloadDeTest } from '../outils/payload-test'
import { ouvrirSessionSansMotDePasse } from '../outils/session'

/**
 * Ticket 052: with the set of the bench loaded, the admin panel opens for the admin of the set
 * and counts its 12 profile types, its 3 talents and its 3 articles, one of them a draft.
 *
 * The bench is shared with the other tests of the run, which write their own profiles, talents
 * and articles: the test counts what belongs to the set, by the account of a profile type and by
 * the slugs of the set, never the total of a list. One test, on the large screen only.
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

		await page.goto('/admin/collections/profils?limit=100')
		await expect(page.locator('tbody tr').filter({ hasText: 'jeu-profil-' })).toHaveCount(CONTENU_DU_BANC.profilsTypes)

		await page.goto('/admin/collections/talents?limit=100')
		for (const { slug } of TALENTS_DU_JEU)
			await expect(page.locator('tbody tr').filter({ hasText: slug })).toHaveCount(1)

		await page.goto('/admin/collections/articles?limit=100')
		for (const { slug } of ARTICLES_DU_JEU)
			await expect(page.locator('tbody tr').filter({ hasText: slug })).toHaveCount(1)
		const brouillon = ARTICLES_DU_JEU.find(({ statut }) => statut === 'draft')
		if (!brouillon) throw new Error('le jeu du banc ne contient pas son brouillon')
		await expect(page.locator('tbody tr').filter({ hasText: brouillon.slug })).toContainText('Brouillon')
	})
})
