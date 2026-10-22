import { expect, type Locator, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * The cards of her space in the order of what matters (ticket 307; audit UX n° 11): what clients see
 * first, then a folded group, the availability as a switch in the header, the account at the bottom.
 * At 390 px (tap) as at 1440 px (click). All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++counter % 50)}` })
)

const isMobile = () => test.info().project.name === 'mobile'
const press = (target: Locator) => (isMobile() ? target.tap() : target.click())

type Artist = TestAccount<'maquilleuse'>

async function artist(context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> }): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	await context.addCookies(account.session.cookies)
	return account
}

async function takeScreenshot(page: Page, name: string) {
	const folder = process.env.DASHBOARD_SCREENSHOTS
	if (folder) await page.screenshot({ path: `${folder}/${name}-${test.info().project.name}.png`, fullPage: true })
}

const SHOWN_FIRST = ['photo', 'identite', 'localisation', 'prestations', 'coordonnees', 'description']
const FURTHER = ['portfolio', 'competences', 'formations', 'experiences', 'langues', 'reseaux']

/** The cards of the page, in the order of the document (the availability block is not a card). */
const cardsOrder = (page: Page) =>
	page
		.locator('section[data-testid^="carte-"]:not([data-testid="carte-disponibilite"])')
		.evaluateAll(elements => elements.map(element => (element.getAttribute('data-testid') ?? '').replace('carte-', '')))

test.describe('307 : les cartes de l’espace dans l’ordre de ce qui compte', { tag: '@mobile' }, () => {
	test('l’ordre rendu : six cartes, puis le groupe replié, puis « Mon compte »', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()
		expect(await cardsOrder(page)).toEqual([...SHOWN_FIRST, ...FURTHER])

		const headings = await page
			.locator('h2')
			.evaluateAll(elements => elements.map(element => element.textContent?.trim() ?? ''))
		const at = (text: string) => headings.findIndex(heading => heading.startsWith(text))
		expect(at('Ce que voient les clientes en premier')).toBeGreaterThan(-1)
		expect(at('Ce que voient les clientes en premier')).toBeLessThan(at('Photo principale'))
		expect(at('Localisation')).toBeLessThan(at('Description'))
		expect(headings.indexOf('Mon compte')).toBeGreaterThan(at('Description'))
		await takeScreenshot(page, 'espace-vide')
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('à 390 px, sur un profil vide, Prestations et Contact sont dans les 2 400 premiers pixels', async ({
		context,
		page,
	}) => {
		// The measure is the phone's: at 1440 px the page is shorter and says nothing about it.
		if (!isMobile()) return
		await artist(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-prestations')).toBeVisible()
		for (const name of ['prestations', 'coordonnees']) {
			const box = await page.getByTestId(`carte-${name}`).boundingBox()
			// Positions are measured from the top of the page.
			const top = (box?.y ?? Number.POSITIVE_INFINITY) + (await page.evaluate(() => window.scrollY))
			expect(top, `haut de la carte ${name}`).toBeLessThanOrEqual(2400)
		}
	})

	test('le groupe replié s’ouvre au clavier, se referme, et reste ouvert après un enregistrement', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		await payload.update({
			collection: 'profiles',
			id: docs[0]?.id as number,
			data: { languages: [{ name: 'Français' }] },
		})
		await page.goto('/auth/profil')
		await page.waitForLoadState('networkidle')
		const group = page.getByTestId('groupe-plus-loin')
		const summary = group.locator('summary')
		await expect(group).not.toHaveJSProperty('open', true)
		await expect(page.getByTestId('carte-langues')).toBeHidden()

		// By the keyboard: focus, Enter.
		await summary.focus()
		await expect(summary).toBeFocused()
		await page.keyboard.press('Enter')
		await expect(group).toHaveJSProperty('open', true)
		await expect(page.getByTestId('carte-langues')).toBeVisible()
		await takeScreenshot(page, 'espace-groupe-ouvert')
		await page.keyboard.press('Enter')
		await expect(group).toHaveJSProperty('open', false)
		await page.keyboard.press('Enter')
		await expect(group).toHaveJSProperty('open', true)

		// A save renders the page again: the group is still open.
		await press(page.getByRole('button', { name: 'Modifier mes langues' }))
		const field = page.getByLabel('Langue', { exact: true })
		await field.pressSequentially('Espagnol')
		await field.press('Enter')
		await press(page.getByRole('button', { name: 'Enregistrer' }))
		await expect(page.getByTestId('carte-langues')).toContainText('Espagnol')
		await expect(group).toHaveJSProperty('open', true)
		await expect(page.getByTestId('carte-langues')).toBeVisible()
	})

	test('la liste des manques garde son lien vers une carte du groupe replié : le clic ouvre le groupe', async ({
		context,
		page,
	}) => {
		await artist(context)
		await page.goto('/auth/profil')
		await page.waitForLoadState('networkidle')
		const group = page.getByTestId('groupe-plus-loin')
		await expect(group).not.toHaveJSProperty('open', true)
		await page.getByTestId('avancement-autres-details').locator('summary').click()
		await press(page.getByTestId('avancement').getByRole('link', { name: 'Ajoute au moins une langue.' }))
		await expect(page).toHaveURL(/#carte-langues$/)
		await expect(group).toHaveJSProperty('open', true)
		await expect(page.getByRole('heading', { name: 'Langues' })).toBeInViewport()
		// The same link again, with the group closed by hand: it opens it again (no change of address to hear).
		await group.locator('summary').click()
		await expect(group).toHaveJSProperty('open', false)
		await press(page.getByTestId('avancement').getByRole('link', { name: 'Ajoute au moins une langue.' }))
		await expect(group).toHaveJSProperty('open', true)
	})

	test('l’adresse d’une carte du groupe, ouverte directement, ouvre le groupe', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil#carte-reseaux')
		await expect(page.getByTestId('groupe-plus-loin')).toHaveJSProperty('open', true)
		await expect(page.getByRole('heading', { name: 'Réseaux' })).toBeInViewport()
	})

	test('la disponibilité est un interrupteur de l’en-tête : il annonce son état et écrit comme avant', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await page.goto('/auth/profil')
		await page.waitForLoadState('networkidle')
		const header = page.getByTestId('carte-disponibilite')
		const toggle = header.getByRole('switch')
		await expect(toggle).toBeVisible()
		await expect(toggle).toHaveAttribute('aria-checked', 'true')
		expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		// No card of the availability remains in the list.
		await expect(page.locator('section[data-testid="carte-disponibilite"]')).toHaveCount(1)
		expect(await cardsOrder(page)).not.toContain('disponibilite')

		await press(toggle)
		await expect(toggle).toHaveAttribute('aria-checked', 'false')
		await expect(header.getByRole('status')).toHaveText(
			'Tu es indisponible : ton profil n’apparaît plus dans la recherche.'
		)
		await expect(header).toContainText('Pas disponible en ce moment')
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		expect(docs[0]?.available).toBe(false)
		await takeScreenshot(page, 'espace-en-pause')
	})

	test('« Mon compte » réunit la déconnexion et la suppression, en bas', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		const account = page.getByTestId('mon-compte')
		await expect(account.getByRole('heading', { name: 'Mon compte', exact: true })).toBeVisible()
		await expect(account.getByRole('button', { name: 'Me déconnecter', exact: true })).toBeVisible()
		await expect(account.getByTestId('zone-suppression')).toBeVisible()
		// Below every card.
		const last = await page.getByTestId('carte-description').boundingBox()
		const account2 = await account.boundingBox()
		expect((account2?.y ?? 0) > (last?.y ?? Number.POSITIVE_INFINITY)).toBe(true)
		await account.scrollIntoViewIfNeeded()
		await takeScreenshot(page, 'espace-mon-compte')
	})
})
