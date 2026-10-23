import { expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { waitMail } from '../support/mailpit'
import { testPayload } from '../support/payload-test'
import { openSession } from '../support/session'

/**
 * She changes her password from her space (ticket 999): a dialog that asks for the current password, a wrong one that
 * changes nothing, then the change: her other browser is signed out and this one stays, she is told by a mail, and
 * an account that came from Google asks for the link by email instead. All made-up people. The rules with the
 * database are in tests/integration/change-password.test.ts.
 *
 * The brake counts by client address: each test sends its own made-up address.
 */

const CURRENT = 'motdepasse-actuel-fictif-999'
const NEXT = 'motdepasse-nouveau-fictif-999'

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${100 + (++counter % 100)}` })
)

async function openDialog(page: Page) {
	await page.goto('/auth/profil')
	await expect(page.getByTestId('zone-mot-de-passe')).toBeVisible()
	await page.getByTestId('zone-mot-de-passe').getByRole('button', { name: 'Changer mon mot de passe' }).click()
	await expect(page.getByRole('dialog', { name: 'Changer mon mot de passe' })).toBeVisible()
}

test.describe('999 : changer mon mot de passe', { tag: '@mobile' }, () => {
	test('un mauvais mot de passe actuel ne change rien ; le bon : l’autre navigateur est déconnecté, celui-ci reste, un mail le dit', async ({
		page,
		context,
		browser,
	}) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => CURRENT })
		await context.addCookies(account.session.cookies as never[])
		const other = await openSession(await testPayload(), {
			collection: 'pros',
			email: account.email,
			motDePasse: CURRENT,
		})
		const otherContext = await browser.newContext()
		await otherContext.addCookies(other.cookies as never[])
		const otherPage = await otherContext.newPage()
		await otherPage.goto('/auth/profil')
		await expect(otherPage.getByTestId('zone-mot-de-passe')).toBeVisible()

		await openDialog(page)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
		const small = await page
			.getByRole('dialog')
			.locator('button, input')
			.evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().height < 44).length)
		expect(small).toBe(0)

		await page.getByLabel('Ton mot de passe actuel', { exact: true }).fill('pas-le-bon-mot-de-passe')
		await page.getByLabel('Ton nouveau mot de passe', { exact: true }).fill(NEXT)
		await page.getByLabel('Retape ton nouveau mot de passe').fill(NEXT)
		await page.getByRole('dialog').getByRole('button', { name: 'Changer mon mot de passe' }).click()
		await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Ce n’est pas ton mot de passe actuel')
		await otherPage.reload()
		await expect(otherPage.getByTestId('zone-mot-de-passe')).toBeVisible()

		await page.getByLabel('Ton mot de passe actuel', { exact: true }).fill(CURRENT)
		await page.getByRole('dialog').getByRole('button', { name: 'Changer mon mot de passe' }).click()
		await expect(page.getByTestId('mot-de-passe-statut')).toContainText('Ton mot de passe est changé')
		await expect(page.getByRole('dialog')).toHaveCount(0)

		// This browser stays signed in; the other one is not.
		await page.reload()
		await expect(page.getByTestId('zone-mot-de-passe')).toBeVisible()
		await otherPage.reload()
		await expect(otherPage).toHaveURL(/\/auth\/signin/)

		const mail = await waitMail({ pour: account.email, sujet: /Ton mot de passe My Makeup a changé/ })
		expect(`${mail.texte}${mail.html}`).not.toContain(NEXT)
		expect(`${mail.texte}${mail.html}`).not.toContain(CURRENT)
		await otherContext.close()
	})

	test('un compte venu de Google n’a pas de champs : « Définir un mot de passe » envoie le lien par email', async ({
		page,
		context,
	}) => {
		const account = await createAccount('reprise-google')
		await context.addCookies(account.session.cookies as never[])
		await page.goto('/auth/profil')
		await expect(page.getByTestId('zone-mot-de-passe')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Changer mon mot de passe' })).toHaveCount(0)
		expect(await violationsSevere(page)).toEqual([])
		await page.getByRole('button', { name: 'Définir un mot de passe' }).click()
		await expect(page.getByTestId('mot-de-passe-statut')).toContainText('Un email avec un lien vient de partir')
		const mail = await waitMail({ pour: account.email, sujet: /Réinitialise ton mot de passe/ })
		expect(mail.liens.map(link => new URL(link).pathname)).toContain('/auth/reinitialiser')
	})
})
