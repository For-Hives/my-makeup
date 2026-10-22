import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { testPayload } from '../support/payload-test'

/**
 * « Bonjour Audrey » (ticket 298): the space greets the makeup artist by the first name of her
 * profile, else by the name of her account, else « toi ». A regression of the passage to English
 * names read the wrong field of the account, and every artist read « Bonjour toi ». Made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${200 + (++counter % 50)}` })
)

async function artistNamed(accountName: string, firstName?: string) {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	await payload.update({ collection: 'pros', id: account.id, data: { name: accountName } })
	if (firstName !== undefined) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		const [sheet] = docs
		if (!sheet) throw new Error('pas de profil')
		await payload.update({ collection: 'profiles', id: sheet.id, data: { firstName } })
	}
	return account
}

test.describe('298 : le message d’accueil de l’espace', { tag: '@mobile' }, () => {
	test('une maquilleuse inscrite sous le nom « Audrey » lit « Bonjour Audrey »', async ({ context, page }) => {
		const account = await artistNamed('Audrey')
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByText('Bonjour Audrey, tu es connectée.')).toBeVisible()
	})

	test('le prénom du profil passe avant le nom du compte, qui n’est jamais affiché en entier', async ({
		context,
		page,
	}) => {
		const account = await artistNamed('Audrey Martin-Fictive', 'Léa')
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByText('Bonjour Léa, tu es connectée.')).toBeVisible()
		await expect(page.getByText('Martin-Fictive', { exact: false }).first()).toBeHidden()
	})
})
