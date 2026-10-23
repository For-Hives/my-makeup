import { expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { waitMail } from '../support/mailpit'

/**
 * The screens of the journeys that ticket 311 reviews (the link of the mail that opens the session, the confirmation,
 * the forgotten password), at 390 px and at 1440 px. On each screen: no horizontal scroll and axe finds no « serious »
 * or « critical » violation. Set `SCREENSHOT_DIR` to a folder to keep the screenshots. All made-up people.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const
const PASSWORD = 'motdepasse-fictif'
const NEW_PASSWORD = 'nouveau-mot-de-passe-fictif'

let counter = 0
const address = (size: number) => `198.51.${100 + (size % 100)}.${10 + (++counter % 200)}`

async function shot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/311-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

/** No sideways scroll, no serious axe violation; then the capture. */
async function checkScreen(page: Page, name: string): Promise<void> {
	await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${name} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	expect(await violationsSevere(page), `${name} : axe`).toEqual([])
	await shot(page, name)
}

for (const size of SIZES) {
	test.describe(`311 à ${size.width} px`, () => {
		test.use({ viewport: size })
		test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': address(size.width) }))

		test('inscription : le mur, la confirmation, un clic, puis « Prépare ton profil »', async ({ page }) => {
			const email = `ecrans-311-${crypto.randomUUID()}@example.test`
			await page.goto('/auth/signup')
			await page.waitForLoadState('networkidle')
			await page.getByLabel('Prénom').fill('Léa')
			await page.getByLabel('Nom', { exact: true }).fill('Fictive')
			await page.getByLabel('Adresse email').fill(email)
			await page.getByLabel('Mot de passe').fill(PASSWORD)
			await page.getByLabel('J’accepte les conditions générales').check()
			await page.getByRole('button', { name: 'S’inscrire' }).click()

			await expect(page).toHaveURL(/\/auth\/verification-wall$/)
			await checkScreen(page, 'mur')

			const mail = await waitMail({ pour: email })
			const link = mail.liens.find(item => item.includes('/auth/verification-complete'))
			if (!link) throw new Error('Le mail ne porte pas le lien de confirmation.')
			await page.goto(link)
			await expect(page.getByRole('button', { name: 'Continuer vers mon profil' })).toBeVisible()
			await checkScreen(page, 'confirmation')

			await page.waitForLoadState('networkidle')
			await page.getByRole('button', { name: 'Continuer vers mon profil' }).click()
			await expect(page).toHaveURL(/\/auth\/init-account$/)
			await checkScreen(page, 'arrivee-apres-confirmation')
		})

		test('mot de passe oublié : la demande, le choix, puis l’espace sans reconnexion', async ({ page }) => {
			const account = await createAccount('maquilleuse-non-verifiee', { motDePasse: () => PASSWORD })

			await page.goto('/auth/mot-de-passe-oublie')
			await page.waitForLoadState('networkidle')
			await checkScreen(page, 'oubli-demande')
			await page.getByLabel('Adresse email').fill(account.email)
			await page.getByRole('button', { name: 'Recevoir un lien' }).click()
			await expect(page.getByTestId('oubli-envoye')).toBeVisible()
			await checkScreen(page, 'oubli-envoye')

			const mail = await waitMail({ pour: account.email, sujet: /Réinitialise ton mot de passe/ })
			const link = mail.liens.find(item => new URL(item).pathname === '/auth/reinitialiser')
			if (!link) throw new Error('Le mail ne porte pas le lien.')
			await page.goto(link)
			await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible()
			await checkScreen(page, 'oubli-choix')

			await page.waitForLoadState('networkidle')
			await page.getByLabel('Nouveau mot de passe').fill(NEW_PASSWORD)
			await page.getByLabel('Confirme le mot de passe').fill(NEW_PASSWORD)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			// The address was never confirmed: the link confirms it and opens the session, no reconnection.
			await expect(page).toHaveURL(/\/auth\/(profil|init-account)$/)
			expect((await page.context().cookies()).some(({ name }) => name === 'payload-token')).toBe(true)
			await checkScreen(page, 'arrivee-apres-oubli')
		})
	})
}
