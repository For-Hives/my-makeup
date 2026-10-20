import { expect, test } from '@playwright/test'

/**
 * The cookies of the old authentication (ticket 081; plan 02 E18): expired on the first request,
 * and one word of explanation on the sign-in page, once.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++counter % 80)}` })
)

const NAMES = [
	'__Secure-next-auth.session-token.0',
	'__Secure-next-auth.session-token.1',
	'__Host-next-auth.csrf-token',
	'__Secure-next-auth.callback-url',
]

test.describe('E18 : les cookies hérités', { tag: '@mobile' }, () => {
	test('expirés à la première requête, message affiché une fois, ni boucle ni « session expirée »', async ({
		baseURL,
		context,
		page,
	}) => {
		await context.addCookies(
			NAMES.map(name => ({
				name,
				value: 'ancienne-valeur',
				domain: new URL(baseURL ?? '').hostname,
				path: '/',
				secure: true,
			}))
		)

		await page.goto('/auth/profil')

		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		const message = page.getByTestId('message-reconnexion')
		await expect(message).toBeVisible()
		await expect(message).toContainText('Reconnecte-toi une fois')
		await expect(message.getByRole('link', { name: 'Mot de passe oublié' })).toHaveAttribute(
			'href',
			'/auth/mot-de-passe-oublie'
		)
		await expect(page.getByText(/session expirée/i)).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		expect((await context.cookies()).map(c => c.name).filter(nom => nom.includes('next-auth'))).toEqual([])

		// Once: the next visit shows the form alone.
		await page.reload()
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await expect(page.getByTestId('message-reconnexion')).toHaveCount(0)
	})

	test('sans cookie hérité, aucun message', async ({ page }) => {
		await page.goto('/auth/signin')
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await expect(page.getByTestId('message-reconnexion')).toHaveCount(0)
	})

	// Ticket 223, constat 8: a response that carries a cookie is for this visitor alone.
	test('une page publique qui efface un cookie hérité n’est gardée par aucun cache partagé', async ({ request }) => {
		const withValue = await request.get('/contact', { headers: { cookie: `${NAMES[0]}=ancienne-valeur` } })
		expect(withValue.status()).toBe(200)
		expect(withValue.headers()['set-cookie']).toContain('Max-Age=0')
		expect(withValue.headers()['cache-control']).toBe('private, no-store')

		const without = await request.get('/contact')
		expect(without.headers()['set-cookie']).toBeUndefined()
		expect(without.headers()['cache-control'] ?? '').not.toContain('private')
	})
})
