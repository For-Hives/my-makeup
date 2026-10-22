import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * The progress block at the top of her space (ticket 138; plan 02 U01, I20): an empty profile reads
 * 0 out of 13 with every point to fill and what the state changes for her; a save moves the block
 * without the page being loaded again; nothing overflows at phone width. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++counter % 50)}` })
)

test.describe('138 : où en est le profil', { tag: '@mobile' }, () => {
	test('U01 : profil vide, 0 sur 13, tous les manques liés à leur carte, sans débordement', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		const block = page.getByTestId('avancement')
		await expect(block).toHaveAttribute('data-etat', 'vide')
		await expect(page.getByTestId('avancement-score')).toHaveText('0 sur 13 (0 %)')
		await expect(page.getByTestId('avancement-consequence')).toContainText('n’est pas listé dans la recherche')
		await expect(block.locator('li')).toHaveCount(13)
		expect(await page.locator('h1').count()).toBe(1)

		await page.screenshot({
			fullPage: false,
			clip: undefined,
			path: test.info().outputPath('avancement.png'),
		})

		// A point leads to its card.
		await block.getByRole('link', { name: 'Ajoute ta photo principale.' }).click()
		await expect(page).toHaveURL(/#carte-photo$/)

		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('I20 : une description de 200 caractères enregistrée fait bouger le bloc sans recharger la page', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('avancement-score')).toHaveText('0 sur 13 (0 %)')
		await page.evaluate(() => {
			;(window as unknown as { __sansRechargement: boolean }).__sansRechargement = true
		})

		const button = page.getByRole('button', { name: 'Modifier ma description' })
		if (test.info().project.name === 'mobile') await button.tap()
		else await button.click()
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

test.describe('292 : le vrai statut, masqué ou en pause', { tag: '@mobile' }, () => {
	async function profileOf(accountId: number | string) {
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: accountId } } })
		const [sheet] = docs
		if (!sheet) throw new Error('pas de profil')
		return { payload, id: sheet.id }
	}

	test('masquée par l’équipe : le motif, l’adresse, la jauge grise, aucune promesse fausse', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		const { payload, id } = await profileOf(account.id)
		await payload.update({
			collection: 'profiles',
			id,
			data: {
				firstName: 'Léa',
				lastName: 'Fictive',
				chosenStatus: 'hidden',
				reason: 'Photos sans rapport avec le maquillage.',
			},
		})
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		const block = page.getByTestId('avancement')
		await expect(block).toHaveAttribute('data-etat', 'masque')
		await expect(block).toContainText('Ta page est masquée par l’équipe My Makeup : elle n’est plus visible.')
		await expect(block).toContainText('Motif : Photos sans rapport avec le maquillage.')
		await expect(block.getByRole('link', { name: 'contact@my-makeup.fr' })).toBeVisible()
		await expect(block).not.toContainText(/publiable|apparaît dans la recherche|indexe/)
		await expect(block.getByRole('progressbar')).toHaveAttribute('data-grise', 'true')
		await page.screenshot({ path: test.info().outputPath('avancement-masque.png') })
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('en pause : une phrase, et « Reprendre les demandes » remet la disponibilité', async ({ context, page }) => {
		const account = await createAccount('maquilleuse')
		const { payload, id } = await profileOf(account.id)
		await payload.update({
			collection: 'profiles',
			id,
			data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariage', available: false },
		})
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		const block = page.getByTestId('avancement')
		await expect(page.getByTestId('avancement-consequence')).toHaveText(
			'Tu es en pause : ta page reste en ligne, mais tu n’apparais pas dans la recherche.'
		)
		await page.screenshot({ path: test.info().outputPath('avancement-pause.png') })
		const button = block.getByRole('button', { name: 'Reprendre les demandes' })
		const box = await button.boundingBox()
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		if (test.info().project.name === 'mobile') await button.tap()
		else await button.click()

		await expect(block.getByRole('status')).toContainText('Tu as repris les demandes')
		await expect(block.getByRole('button', { name: 'Reprendre les demandes' })).toHaveCount(0)
		await expect(page.getByTestId('avancement-consequence')).not.toContainText('en pause')
		const stored = await payload.findByID({ collection: 'profiles', id, depth: 0 })
		expect(stored.available).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})
})
