import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { testPayload } from '../support/payload-test'

/**
 * The sign-out (ticket 078; plan 02 E10, E11, E17) and the signed-in state of the navigation: the
 * session is removed from the database, the cookie goes, the Back button does not bring the space
 * back, an old cookie opens nothing, another tab is sent to the sign-in page at its next
 * navigation, and the public pages stay in the cache.
 */

const PASSWORD = 'motdepasse-fictif'
let counter = 0
const url = () => `192.0.2.${100 + (++counter % 100)}`
test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': url() }))

async function signInAction(page: Page, email: string) {
	await page.goto('/auth/signin')
	// A click before the page has hydrated sends nothing.
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(PASSWORD)
	await page.getByRole('button', { name: 'Se connecter' }).click()
	await expect(page).toHaveURL(/\/auth\/profil$/)
}

/**
 * The markup of a page without its scripts. The scripts carry the RSC stream (`self.__next_f.push`), whose
 * chunks are written in the order the server finishes them: two requests to the same page may order them
 * differently (ticket 256). What the visitor sees is the markup, and that is what must not change.
 */
const markupOf = (html: string) => html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')

const sessionCookie = async (context: BrowserContext) =>
	(await context.cookies()).find(({ name }) => name === 'payload-token')

async function contextWith(browser: Browser, cookie: NonNullable<Awaited<ReturnType<typeof sessionCookie>>>) {
	const browserContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': url() } })
	await browserContext.addCookies([cookie])
	return browserContext
}

test.describe('E10 : la déconnexion', { tag: '@mobile' }, () => {
	test('plus aucun cookie de session, une page qui existe, et Retour n’affiche pas l’espace', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		await signInAction(page, account.email)
		expect(await sessionCookie(context)).toBeDefined()

		await page.getByRole('main').getByRole('button', { name: 'Me déconnecter', exact: true }).click()

		await expect(page).toHaveURL(/\/$/)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		expect(await sessionCookie(context)).toBeUndefined()
		expect((await context.cookies()).filter(({ name }) => /token|next-auth/i.test(name))).toEqual([])

		await page.goBack()
		await expect(page).toHaveURL(/\/auth\/signin/)
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
	})

	test('la déconnexion laisse une ligne « deconnexion » au journal', async ({ page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		// The rows belong to nobody, and the other tests sign out at the same time: the exact count of
		// one sign-out is the integration test's (tests/integration/auth-sign-out.test.ts).
		const since = new Date().toISOString()
		const count = async () =>
			(
				await payload.count({
					collection: 'auth-events',
					where: { and: [{ type: { equals: 'sign-out' } }, { date: { greater_than_equal: since } }] },
				})
			).totalDocs
		await signInAction(page, account.email)

		await page.getByRole('main').getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		await expect.poll(count).toBeGreaterThanOrEqual(1)
	})
})

test.describe('E11 : l’ancien cookie réinjecté', () => {
	test('dans un contexte neuf, il est refusé : on arrive sur la connexion', async ({ browser, context, page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		await signInAction(page, account.email)
		const old = await sessionCookie(context)
		if (!old) throw new Error('Pas de cookie de session après la connexion.')
		// The control: before the sign-out, the same cookie opens the space in a fresh context.
		const before = await contextWith(browser, old)
		const pageBefore = await before.newPage()
		await pageBefore.goto('/auth/profil')
		await expect(pageBefore.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
		await before.close()

		await page.getByRole('main').getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		const after = await contextWith(browser, old)
		const pageAfter = await after.newPage()
		await pageAfter.goto('/auth/profil')
		await expect(pageAfter).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await expect(pageAfter.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await after.close()
	})
})

test.describe('E17 : la déconnexion dans un onglet', () => {
	test('l’autre onglet est renvoyé à la connexion à sa prochaine navigation', async ({ context, page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		await signInAction(page, account.email)
		const tab = await context.newPage()
		await tab.goto('/auth/profil')
		await expect(tab.getByRole('heading', { name: 'Mon espace' })).toBeVisible()

		await page.getByRole('main').getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		await tab.goto('/auth/profil')
		await expect(tab).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
	})
})

test.describe('Me déconnecter de tous les appareils', () => {
	test('après confirmation seulement ; l’autre appareil du même compte est fermé aussi', async ({
		browser,
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		await signInAction(page, account.email)
		const otherDevice = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': url() } })
		const other = await otherDevice.newPage()
		await signInAction(other, account.email)

		await page.getByRole('button', { name: 'Me déconnecter de tous les appareils' }).click()
		await expect(page.getByText('Tu seras déconnectée de tous tes appareils')).toBeVisible()
		// Cancelled: nothing is closed.
		await page.getByRole('button', { name: 'Annuler' }).click()
		await expect(page.getByText('Tu seras déconnectée de tous tes appareils')).toHaveCount(0)
		await other.goto('/auth/profil')
		await expect(other.getByRole('heading', { name: 'Mon espace' })).toBeVisible()

		await page.getByRole('button', { name: 'Me déconnecter de tous les appareils' }).click()
		await page.getByRole('button', { name: 'Oui, me déconnecter partout' }).click()

		await expect(page).toHaveURL(/\/$/)
		expect(await sessionCookie(context)).toBeUndefined()
		await other.goto('/auth/profil')
		await expect(other).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await otherDevice.close()
	})

	test('une action sans la confirmation ne ferme rien', async ({ page, request }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		await signInAction(page, account.email)
		await page.getByRole('button', { name: 'Me déconnecter de tous les appareils' }).click()
		// The confirmation field is the page's: take it out, and send the form.
		await page.locator('input[name="confirmation"]').evaluate(champ => champ.remove())
		await page.getByRole('button', { name: 'Oui, me déconnecter partout' }).click()

		await expect(page).toHaveURL(/\/auth\/profil$/)
		const response = await request.get('/api/dashboard/session')
		expect(response.status()).toBe(200)
		await page.reload()
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
	})
})

test.describe('La Nav lit l’état connecté dans le navigateur', () => {
	test('« Me connecter » sans session ; « Mon espace » et « Me déconnecter » avec une session', async ({
		context,
		page,
	}) => {
		await page.goto('/')
		const nav = page.getByRole('navigation', { name: 'Navigation principale' })
		await expect(nav.getByRole('link', { name: 'Me connecter' })).toBeVisible()
		await expect(nav.getByRole('link', { name: 'Mon espace' })).toHaveCount(0)

		const account = await createAccount('maquilleuse')
		await context.addCookies(account.session.cookies)
		await page.goto('/')

		await expect(nav.getByRole('link', { name: 'Mon espace' })).toBeVisible()
		await expect(nav.getByRole('button', { name: 'Me déconnecter' })).toBeVisible()
		await expect(nav.getByRole('link', { name: 'Me connecter' })).toHaveCount(0)
	})

	test('la session d’un admin ne change pas la Nav', async ({ context, page }) => {
		const admin = await createAccount('admin')
		await context.addCookies(admin.session.cookies)

		await page.goto('/')

		await expect(
			page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Me connecter' })
		).toBeVisible()
	})

	test('une page publique garde les mêmes en-têtes de cache et le même contenu, avec ou sans cookie', async ({
		playwright,
		baseURL,
	}) => {
		const account = await createAccount('maquilleuse')
		const cookie = account.session.enTetes.Cookie
		const read = async (entetes: Record<string, string>) => {
			const client = await playwright.request.newContext({ baseURL: baseURL ?? '', extraHTTPHeaders: entetes })
			try {
				const response = await client.get('/')
				return {
					statut: response.status(),
					cache: response.headers()['cache-control'],
					corps: markupOf(await response.text()),
				}
			} finally {
				await client.dispose()
			}
		}

		const anonymous = await read({})
		const signedIn = await read({ Cookie: cookie, Origin: baseURL ?? '' })

		expect(anonymous.statut).toBe(200)
		// The home page is read per request (ticket 097): its cache rules are ticket 117's. What matters here is that
		// the session changes nothing to the answer.
		expect(signedIn.cache).toBe(anonymous.cache)
		expect(signedIn.corps).toBe(anonymous.corps)
	})

	test('la route de l’état ne répond qu’un booléen, jamais en cache', async ({ playwright, baseURL }) => {
		const account = await createAccount('maquilleuse')
		const client = await playwright.request.newContext({
			baseURL: baseURL ?? '',
			extraHTTPHeaders: { Cookie: account.session.enTetes.Cookie, Origin: baseURL ?? '' },
		})
		try {
			const response = await client.get('/api/dashboard/session')
			expect(response.headers()['cache-control']).toBe('private, no-store')
			expect(await response.json()).toEqual({ signedIn: true })
			const without = await playwright.request.newContext({ baseURL: baseURL ?? '' })
			expect(await (await without.get('/api/dashboard/session')).json()).toEqual({ signedIn: false })
			await without.dispose()
		} finally {
			await client.dispose()
		}
	})
})
