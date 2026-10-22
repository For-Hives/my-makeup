import { expect, test } from '@playwright/test'
import { createAccount, FIXTURE_LEGACY_PASSWORD } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { testPayload } from '../support/payload-test'

/**
 * An account of the old site signs in with its usual password (tickets 087 and 088; plan 02 E73):
 * the form, then the hash of Payload in the database, and the old one gone.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++counter % 50)}` })
)

async function hashOf(id: number | string) {
	const line = await (await testPayload()).db.findOne<{ id: number; legacyBcrypt?: string | null; hash?: string }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	if (!line) throw new Error('le compte n’est pas en base')
	return line
}

test.describe('Compte de l’ancien site', () => {
	test('E73 : le mot de passe habituel ouvre l’espace, puis le hash hérité est remplacé par celui de Payload', async ({
		context,
		page,
	}) => {
		const account = await createAccount('reprise-avec-hash')
		await activateProfile(account.id)
		const before = await hashOf(account.id)
		expect(before.legacyBcrypt).toMatch(/^\$2a\$10\$/)

		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(account.email)
		await page.getByLabel('Mot de passe').fill(FIXTURE_LEGACY_PASSWORD)
		await page.getByRole('button', { name: 'Se connecter' }).click()

		await expect(page).toHaveURL(/\/auth\/profil$/)
		expect((await context.cookies()).map(c => c.name)).toEqual(['payload-token'])
		const after = await hashOf(account.id)
		expect(after.legacyBcrypt ?? null).toBeNull()
		expect(after.hash).not.toBe(before.hash)
	})

	test('un mauvais mot de passe : le message générique, et le hash hérité reste', async ({ page }) => {
		const account = await createAccount('reprise-avec-hash')
		const before = await hashOf(account.id)

		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(account.email)
		await page.getByLabel('Mot de passe').fill('pas-le-bon')
		await page.getByRole('button', { name: 'Se connecter' }).click()

		await expect(page.getByTestId('erreur-connexion')).toHaveText('Email ou mot de passe incorrect.')
		expect(await hashOf(account.id)).toEqual(before)
	})
})
