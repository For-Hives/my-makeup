import { expect, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * Her page shows her profile and nobody else's (tickets 118 and 119 moved to issue 1022; plan 02 E16, U54): the
 * stored values, never « null », one h1, no sideways scroll; and A sees nothing of B, neither in the page nor in the
 * payload of the server. The identity block itself is played in tests/e2e/direct-edit-header.spec.ts.
 * All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${40 + (++counter % 150)}` })
)

type Artist = TestAccount<'maquilleuse'>

const IDENTITY = { firstName: 'Léa', lastName: 'Fictive', artistName: 'Studio Fictif', specialty: 'Maquillage mariée' }

async function artist(
	context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> },
	profil: Record<string, unknown> = IDENTITY
): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	await payload.update({ collection: 'profiles', id: sheet.id, data: profil })
	await context.addCookies(account.session.cookies)
	return account
}

test.describe('118 : la page de l’espace est son profil', { tag: '@mobile' }, () => {
	test('les valeurs enregistrées, une invitation pour le reste, jamais « null »', async ({ context, page }) => {
		await artist(context, { ...IDENTITY, description: 'null', radiusKm: 0 })
		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.locator('[data-direct-edit="identity"]')).toContainText('Studio Fictif')
		await expect(page.locator('[data-direct-edit="identity"]')).toContainText('Maquillage mariée')
		// A block with nothing stored says what to do, in place of its content.
		await expect(page.locator('[data-direct-edit="skills"] [data-direct-edit-empty]')).toBeVisible()
		await expect(page.locator('[data-direct-edit="networks"] [data-direct-edit-empty]')).toBeVisible()
		const text = await page.locator('main').innerText()
		expect(text).not.toMatch(/\bnull\b|undefined|NaN/)
	})

	test('un h1, une navigation, aucun débordement', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('completeness')).toBeVisible()
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Léa Fictive')
		await expect(page.getByRole('navigation').first()).toBeVisible()
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(overflow).toBeLessThanOrEqual(0)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('U54 : A ne voit rien du profil de B, ni dans la page ni dans la charge RSC', async ({ context, page }) => {
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: b.id } } })
		await payload.update({
			collection: 'profiles',
			id: docs[0]?.id as number,
			data: { firstName: 'Zoéprivée', lastName: 'Autredame', specialty: 'Secret de B' },
		})
		const a = await artist(context)

		await page.goto('/auth/profil')
		await expect(page.locator('[data-direct-edit="identity"]')).toContainText('Léa')

		const headers = { ...a.session.enTetes }
		const html = await page.context().request.get('/auth/profil', { headers })
		const rsc = await page.context().request.get('/auth/profil', { headers: { ...headers, RSC: '1' } })
		const preview = await page.context().request.get('/auth/profil?mode=preview', { headers })
		for (const corps of [await page.content(), await html.text(), await rsc.text(), await preview.text()]) {
			expect(corps).not.toContain('Zoéprivée')
			expect(corps).not.toContain('Secret de B')
			expect(corps).not.toContain(b.email)
		}
	})
})
