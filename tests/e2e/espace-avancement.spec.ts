import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'

/**
 * The progress block at the top of her space (ticket 138; plan 02 U01, I20): an empty profile reads
 * 0 out of 13 with every point to fill and what the state changes for her; a save moves the block
 * without the page being loaded again; nothing overflows at phone width. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++compteur % 50)}` })
)

test.describe('138 : où en est le profil', { tag: '@mobile' }, () => {
	test('U01 : profil vide, 0 sur 13, tous les manques liés à leur carte, sans débordement', async ({
		context,
		page,
	}) => {
		const compte = await createAccount('maquilleuse')
		await context.addCookies(compte.session.cookies)
		await page.goto('/auth/profil')

		const bloc = page.getByTestId('avancement')
		await expect(bloc).toHaveAttribute('data-etat', 'vide')
		await expect(page.getByTestId('avancement-score')).toHaveText('0 sur 13 (0 %)')
		await expect(page.getByTestId('avancement-consequence')).toContainText('n’est pas listé dans la recherche')
		await expect(bloc.locator('li')).toHaveCount(13)
		expect(await page.locator('h1').count()).toBe(1)

		await page.screenshot({
			fullPage: false,
			clip: undefined,
			path: test.info().outputPath('avancement.png'),
		})

		// A point leads to its card.
		await bloc.getByRole('link', { name: 'Ajoute ta photo principale.' }).click()
		await expect(page).toHaveURL(/#carte-photo$/)

		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('I20 : une description de 200 caractères enregistrée fait bouger le bloc sans recharger la page', async ({
		context,
		page,
	}) => {
		const compte = await createAccount('maquilleuse')
		await context.addCookies(compte.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('avancement-score')).toHaveText('0 sur 13 (0 %)')
		await page.evaluate(() => {
			;(window as unknown as { __sansRechargement: boolean }).__sansRechargement = true
		})

		const bouton = page.getByRole('button', { name: 'Modifier ma description' })
		if (test.info().project.name === 'mobile') await bouton.tap()
		else await bouton.click()
		await page.getByLabel('Ta description').fill('a'.repeat(200))
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByTestId('avancement-score')).toHaveText('1 sur 13 (8 %)')
		await expect(page.getByTestId('avancement').getByRole('link', { name: 'Écris ta description.' })).toHaveCount(0)
		await expect(page.getByTestId('avancement').getByRole('link', { name: /Allonge ta description/ })).toHaveCount(0)
		// Same document: the page was not loaded again.
		expect(await page.evaluate(() => (window as unknown as { __sansRechargement?: boolean }).__sansRechargement)).toBe(
			true
		)
	})
})
