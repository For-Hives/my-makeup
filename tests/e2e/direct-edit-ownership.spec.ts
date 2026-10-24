import { expect, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { EDIT_PATH } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * Her edit page and her summary show her profile and nobody else's (tickets 118 and 119 moved by issues 1022 and 1073; plan 02 E16, U54): the
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
		await page.goto(EDIT_PATH)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.locator('[data-direct-edit="identity"]')).toContainText('Studio Fictif')
		await expect(page.locator('[data-direct-edit="identity"]')).toContainText('Maquillage mariée')
		// A block with nothing stored says what to do, in place of its content.
		await expect(page.locator('[data-direct-edit="skills"] [data-direct-edit-empty]')).toBeVisible()
		await expect(page.locator('[data-direct-edit="networks"] [data-direct-edit-empty]')).toBeVisible()
		const text = await page.locator('main').innerText()
		expect(text).not.toMatch(/\bnull\b|undefined|NaN/)
	})

	test('un h1, un contenu principal, aucun débordement', async ({ context, page }) => {
		await artist(context)
		await page.goto(EDIT_PATH)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Léa Fictive')
		await expect(page.getByRole('main')).toBeVisible()
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

		await page.goto(EDIT_PATH)
		await expect(page.locator('[data-direct-edit="identity"]')).toContainText('Léa')

		const headers = { ...a.session.enTetes }
		const get = (url: string, extra = {}) => page.context().request.get(url, { headers: { ...headers, ...extra } })
		const pages = await Promise.all([
			get(EDIT_PATH),
			get(EDIT_PATH, { RSC: '1' }),
			get('/auth/apercu-profil'),
			get('/auth/profil'),
			get('/auth/profil', { RSC: '1' }),
		])
		for (const corps of [await page.content(), ...(await Promise.all(pages.map(response => response.text())))]) {
			expect(corps).not.toContain('Zoéprivée')
			expect(corps).not.toContain('Secret de B')
			expect(corps).not.toContain(b.email)
		}
	})
})
