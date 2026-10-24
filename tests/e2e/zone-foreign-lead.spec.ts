import { expect, type Locator, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { EDIT_PATH } from '../support/direct-edit-e2e'
import { SCREENS } from '../support/e2e'
import { testPayload } from '../support/payload-test'

/**
 * The screens ticket 297 changes, at 390 px and at 1440 px: the second step of the onboarding and the
 * zone panel of her space, where a text no commune matches (« Genève ») proposes « Choisir un pays », and
 * where « Je travaille à l'étranger » answers the first press. On each state (normal, empty result, error,
 * country chosen): no horizontal scroll, every link or button at least 44 px tall, and axe finds no
 * « serious » or « critical » violation. Set `SCREENSHOT_DIR` to a folder to keep the screenshots.
 * All made-up people. The first press is played with a finger at 390 px, with the mouse at 1440 px.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const
const PASSWORD = 'motdepasse-fictif'
const LEAD = 'Pas de commune française de ce nom.'
const ABROAD = 'Je travaille à l’étranger ou dans plusieurs pays'

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${20 + (++counter % 200)}` })
)

const createdEmails: string[] = []
const createdAccounts: number[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	const owners = createdAccounts.splice(0)
	for (const email of createdEmails.splice(0)) {
		const { docs } = await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })
		owners.push(...docs.map(({ id }) => id))
	}
	for (const owner of owners) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: owner } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: owner }).catch(() => undefined)
	}
})

const press = (target: Locator) => (touch() ? target.tap() : target.click())
const touch = () => (test.info().annotations.find(({ type }) => type === 'touch') ? true : false)

async function shot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/297-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

/** The size checks of the ticket on the screen that is open, inside `root`. */
async function checkScreen(page: Page, label: string, root: string): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	// Links that are part of a sentence are exempt from the target size (WCAG 2.5.8), the rest is not.
	const small = await page.evaluate(selector => {
		const scope = document.querySelector(selector)
		if (!scope) return ['(zone introuvable)']
		return [...scope.querySelectorAll<HTMLElement>('a, button, summary, [role="option"], input:not([type="hidden"])')]
			.filter(element => {
				// A checkbox is pressed through its label: the label is the target that counts.
				const label = element.matches('input[type="checkbox"], input[type="radio"]')
					? (element.closest('label') ?? document.querySelector(`label[for="${element.id}"]`))
					: null
				const box = (label ?? element).getBoundingClientRect()
				if (box.width === 0 || box.height === 0) return false
				if (element.tagName === 'A' && element.closest('p')?.textContent !== element.textContent) return false
				return box.height < 44
			})
			.map(
				element =>
					`${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}[${element.getAttribute('type') ?? ''}] « ${(element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 40)} » ${Math.round(element.getBoundingClientRect().height)} px`
			)
	}, root)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

/** A confirmed account with its empty profile, signed in, on the second step of the onboarding. */
async function openZoneStep(page: Page): Promise<void> {
	const email = `zone-${crypto.randomUUID()}@example.test`
	const payload = await testPayload()
	await payload.create({
		collection: 'pros',
		data: { email, password: PASSWORD, name: 'Essai Zone', _verified: true },
		disableVerificationEmail: true,
		overrideAccess: true,
	})
	createdEmails.push(email)
	await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent('/auth/init-account')}`)
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(PASSWORD)
	await page.getByRole('button', { name: 'Se connecter' }).click()
	await expect(page).toHaveURL(/\/auth\/init-account$/)
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Prénom').fill('Léa')
	await page.getByLabel('Nom', { exact: true }).fill('Fictive')
	await page.getByLabel('Mariage', { exact: true }).check()
	await press(page.getByRole('button', { name: 'Suivant' }))
	await expect(page.locator('#accueil-titre-etape')).toHaveText('Ta zone')
}

/** A makeup artist with a session, on her space, the zone panel open. */
async function openZonePanel(page: Page, context: { addCookies: (c: never) => Promise<void> }): Promise<void> {
	const account = await createAccount('maquilleuse')
	createdAccounts.push(Number(account.id))
	await context.addCookies(account.session.cookies as never)
	await page.goto(EDIT_PATH)
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
	await page.waitForLoadState('networkidle')
	await press(page.getByRole('button', { name: 'Modifier ma zone', exact: true }))
	await expect(page.locator('[data-direct-edit-editor]')).toBeVisible()
}

for (const size of SIZES) {
	test.describe(`297 à ${size.width} px`, () => {
		test.use({ viewport: size, hasTouch: size.width < 800 })
		test.beforeEach(() => {
			if (size.width < 800) test.info().annotations.push({ type: 'touch' })
		})

		test('l’accueil, étape 2 : normal, aucune commune, erreur, pays choisi', async ({ page }) => {
			test.setTimeout(150_000)
			await openZoneStep(page)
			const field = page.getByRole('combobox', { name: 'Où travailles-tu ?' })
			const choose = page.getByRole('button', { name: 'Choisir un pays' })
			await expect(page).toHaveTitle(/Prépare ton profil/)

			await checkScreen(page, 'étape 2 normale', 'main')
			await shot(page, 'etape-2-normal')

			await field.fill('Genève')
			await expect(page.getByText(LEAD)).toBeVisible()
			await expect(choose).toBeVisible()
			await checkScreen(page, 'étape 2, aucune commune', 'main')
			await shot(page, 'etape-2-aucune-commune')

			// Error: « Suivant » with a text that is no commune says so, and the way out stays there.
			await press(page.getByRole('button', { name: 'Suivant' }))
			await expect(page.getByText('Choisis ta commune dans la liste')).toBeVisible()
			await expect(choose).toBeVisible()
			await checkScreen(page, 'étape 2, erreur', 'main')
			await shot(page, 'etape-2-erreur')

			// One press: the panel changes to the country mode with Suisse chosen, nothing else is chosen for her.
			await press(choose)
			await expect(page.getByRole('button', { name: 'Retirer Suisse' })).toBeVisible()
			await expect(choose).toHaveCount(0)
			await checkScreen(page, 'étape 2, pays choisi', 'main')
			await shot(page, 'etape-2-pays-prechoisi')
		})

		test('le panneau de zone : normal, aucune commune, pays choisi, puis le lien « étranger » avec la liste ouverte', async ({
			context,
			page,
		}) => {
			test.setTimeout(120_000)
			await openZonePanel(page, context)
			const dialog = page.locator('[data-direct-edit-editor]')
			const field = dialog.getByRole('combobox', { name: 'Où travailles-tu ?' })
			const choose = dialog.getByRole('button', { name: 'Choisir un pays' })

			await checkScreen(page, 'panneau normal', '[data-direct-edit-editor]')
			await shot(page, 'panneau-normal')

			await field.fill('Genève')
			await expect(dialog.getByText(LEAD)).toBeVisible()
			await checkScreen(page, 'panneau, aucune commune', '[data-direct-edit-editor]')
			await shot(page, 'panneau-aucune-commune')

			await press(choose)
			await expect(dialog.getByRole('button', { name: 'Retirer Suisse' })).toBeVisible()
			await checkScreen(page, 'panneau, pays choisi', '[data-direct-edit-editor]')
			await shot(page, 'panneau-pays-prechoisi')

			// Back to the commune, the list of suggestions open: one press on the foreign link is enough.
			await press(dialog.getByRole('button', { name: 'Revenir à une commune en France' }))
			await field.fill('Lil')
			await expect(dialog.getByRole('listbox')).toBeVisible()
			await shot(page, 'panneau-liste-ouverte')
			await press(dialog.getByRole('button', { name: ABROAD }))
			await expect(dialog.getByRole('combobox', { name: 'Ajouter un pays' })).toBeVisible()
			await expect(dialog.getByRole('button', { name: ABROAD })).toHaveCount(0)
		})

		test('au clavier : Tab atteint le lien et Entrée le déclenche, liste ouverte comme liste fermée', async ({
			context,
			page,
		}) => {
			test.setTimeout(120_000)
			await openZonePanel(page, context)
			const dialog = page.locator('[data-direct-edit-editor]')
			const field = dialog.getByRole('combobox', { name: 'Où travailles-tu ?' })
			const back = dialog.getByRole('button', { name: 'Revenir à une commune en France' })
			const picker = dialog.getByRole('combobox', { name: 'Ajouter un pays' })

			// List open: the suggestions are shown, the field still has the focus.
			await field.fill('Lil')
			await expect(dialog.getByRole('listbox')).toBeVisible()
			await field.focus()
			await page.keyboard.press('Tab')
			await expect(dialog.getByRole('button', { name: ABROAD })).toBeFocused()
			await page.keyboard.press('Enter')
			await expect(picker).toBeVisible()

			// List closed (Escape closes the list and not the panel): the same two keys.
			await back.focus()
			await page.keyboard.press('Enter')
			await field.fill('Lil')
			await expect(dialog.getByRole('listbox')).toBeVisible()
			await field.press('Escape')
			await expect(dialog.getByRole('listbox')).toHaveCount(0)
			await expect(dialog).toBeVisible()
			await field.focus()
			await page.keyboard.press('Tab')
			await expect(dialog.getByRole('button', { name: ABROAD })).toBeFocused()
			await page.keyboard.press('Enter')
			await expect(picker).toBeVisible()
		})
	})
}
