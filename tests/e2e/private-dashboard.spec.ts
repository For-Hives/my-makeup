import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'

/**
 * The closed pages of the space (ticket 075; plan 02 E09, E16): one redirection without a session,
 * a way back that stays on the site, never cached, no token in what the page sends.
 */

const PASSWORD = 'motdepasse-fictif'
let counter = 0
test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${10 + (++counter % 80)}` }))

test.describe('Pages de l’espace sans session', { tag: '@mobile' }, () => {
	test('une seule redirection vers la connexion, avec la page de retour', async ({ request }) => {
		const response = await request.get('/auth/profil', { maxRedirects: 0 })

		expect(response.status()).toBe(307)
		expect(response.headers().location).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
	})

	test('la page de connexion répond ensuite 200, sans seconde redirection', async ({ page, request }) => {
		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)

		const suite = await request.get('/auth/signin?callbackUrl=%2Fauth%2Fprofil', { maxRedirects: 0 })
		expect(suite.status()).toBe(200)
	})

	test('/auth/init-account est fermée de la même façon', async ({ request }) => {
		const response = await request.get('/auth/init-account', { maxRedirects: 0 })
		expect(response.status()).toBe(307)
		expect(response.headers().location).toBe('/auth/signin?callbackUrl=%2Fauth%2Finit-account')
	})

	test('un cookie qui ne vaut plus rien : une redirection, puis le formulaire, jamais de boucle', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		const cookie = account.session.cookies[0]
		if (!cookie) throw new Error('pas de cookie')
		await context.addCookies([{ ...cookie, value: 'pas-un-jeton' }])

		await page.goto('/auth/profil')

		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
	})

	test('la session d’un compte admin n’ouvre pas l’espace, et la connexion ne la prend pas pour une session', async ({
		context,
		page,
	}) => {
		const admin = await createAccount('admin')
		await context.addCookies(admin.session.cookies)

		await page.goto('/auth/profil')

		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
	})
})

test.describe('Arrivée depuis un autre site (ticket 223)', () => {
	const EXTERNAL = 'http://lien-externe.test'

	test('un lien d’un autre site vers l’espace garde la session : le relais repart du site, sans redirection', async ({
		baseURL,
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		await context.addCookies(account.session.cookies)
		await page.route(`${EXTERNAL}/**`, route =>
			route.fulfill({
				contentType: 'text/html',
				body: `<!doctype html><title>Un mail</title><a href="${baseURL}/auth/profil?venue=mail">Ouvrir mon espace</a>`,
			})
		)
		// The navigations to the page that got a real answer: who sent each one, and what came back.
		const arrived: { depuis: string; relais: boolean; statut: number }[] = []
		page.on('response', async reponse => {
			if (!reponse.request().isNavigationRequest() || new URL(reponse.url()).pathname !== '/auth/profil') return
			// Chrome may replay a request on its own (a redirection to the same address): only real answers count.
			if (reponse.status() >= 300) return
			// The body of a page that the browser leaves at once cannot always be read: then it is the relay's.
			const corps = await reponse.text().catch(() => 'http-equiv="refresh"')
			arrived.push({
				depuis: reponse.request().headers().referer ?? '',
				relais: corps.includes('http-equiv="refresh"'),
				statut: reponse.status(),
			})
		})

		await page.goto(`${EXTERNAL}/`)
		await page.getByRole('link', { name: 'Ouvrir mon espace' }).click()

		// She stays on her page, signed in: no sign-in form, no redirection.
		await expect(page).toHaveURL(/\/auth\/profil\?venue=mail$/)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toHaveCount(0)
		await expect(page.getByRole('main')).toBeVisible()
		// Two answers: the relay page to the request that came from the other site, then the page itself, asked
		// by the relay from this site (its referrer is the address of the page).
		expect(arrived).toEqual([
			{ depuis: `${EXTERNAL}/`, relais: true, statut: 200 },
			{ depuis: `${baseURL}/auth/profil?venue=mail`, relais: false, statut: 200 },
		])
	})

	test('sans cookie, la même arrivée mène à la connexion, comme avant', async ({ request }) => {
		const response = await request.get('/auth/profil', {
			headers: { 'sec-fetch-site': 'cross-site' },
			maxRedirects: 0,
		})
		expect(response.status()).toBe(307)
		expect(response.headers().location).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
	})
})

test.describe('E09 : le retour après la connexion', () => {
	test('une page interne est respectée', async ({ page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })

		await page.goto('/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fvenue%3Dtest')
		await page.getByLabel('Adresse email').fill(account.email)
		await page.getByLabel('Mot de passe').fill(PASSWORD)
		await page.getByRole('button', { name: 'Se connecter' }).click()

		await expect(page).toHaveURL(/\/auth\/profil\?venue=test$/)
	})

	test('un retour vers un autre site est ignoré', async ({ page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })

		for (const returned of ['https://evil.example/', '//evil.example']) {
			await page.context().clearCookies()
			await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(returned)}`)
			await page.getByLabel('Adresse email').fill(account.email)
			await page.getByLabel('Mot de passe').fill(PASSWORD)
			await page.getByRole('button', { name: 'Se connecter' }).click()
			await expect(page).toHaveURL(/\/auth\/profil$/)
		}
	})

	test('déjà connectée, un retour à segment de points ne mène pas vers un autre site', async ({ page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(account.email)
		await page.getByLabel('Mot de passe').fill(PASSWORD)
		await page.getByRole('button', { name: 'Se connecter' }).click()
		await expect(page).toHaveURL(/\/auth\/profil$/)

		for (const returned of ['/.//evil.example', '/%2e//evil.example', '/x/..//evil.example']) {
			await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(returned)}`)
			await expect(page).toHaveURL(/^https?:\/\/(?!evil)[^/]+\/auth\/profil$/)
		}
	})

	test('une action envoyée depuis une autre origine est refusée : aucune session ne s’ouvre', async ({
		baseURL,
		page,
		playwright,
	}) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		// A real submit, to learn what the browser sends for the action.
		const upload = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/auth/signin')
		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(account.email)
		await page.getByLabel('Mot de passe').fill(PASSWORD)
		await page.getByRole('button', { name: 'Se connecter' }).click()
		const httpRequest = await upload
		const corps = httpRequest.postDataBuffer()
		if (!corps) throw new Error('La requête de l’action n’a pas de corps.')
		const { origin: _origin, cookie: _cookie, ...headers } = await httpRequest.allHeaders()

		// The same request, replayed by a client with no cookie, from a given origin.
		const replay = async (origin: string) => {
			const client = await playwright.request.newContext({ baseURL: baseURL ?? '' })
			try {
				return await client.post('/auth/signin', {
					headers: { ...headers, origin, 'x-forwarded-for': '192.0.2.250' },
					data: corps,
					maxRedirects: 0,
				})
			} finally {
				await client.dispose()
			}
		}

		// The control: from the site's own origin the replay opens a session.
		const allowed = await replay(baseURL ?? '')
		expect(allowed.headers()['set-cookie']).toContain('payload-token=')

		const refused = await replay('https://evil.example')
		expect(refused.headers()['set-cookie']).toBeUndefined()
	})
})

test.describe('E16 : privé, sans stockage, aucun jeton', () => {
	test('l’espace n’est jamais en cache et ne contient aucun jeton, ni dans le HTML ni dans la charge RSC', async ({
		context,
		request,
	}) => {
		const account = await createAccount('maquilleuse')
		const cookie = account.session.cookies[0]
		if (!cookie) throw new Error('pas de cookie')
		await context.addCookies(account.session.cookies)
		const requestHeaders = { ...account.session.enTetes }

		const html = await request.get('/auth/profil', { headers: requestHeaders })
		const rsc = await request.get('/auth/profil', { headers: { ...requestHeaders, RSC: '1' } })

		for (const response of [html, rsc]) {
			expect(response.status()).toBe(200)
			const cc = response.headers()['cache-control'] ?? ''
			expect(cc).toContain('private')
			expect(cc).toContain('no-store')
			const corps = await response.text()
			expect(corps).not.toContain(cookie.value)
			expect(corps).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)
			expect(corps).not.toMatch(/\$2[aby]\$|"hash"|"salt"|"sessions"|payload-token/)
		}
		expect((await html.text()).toLowerCase()).toContain('noindex')
	})

	test('la page de connexion non plus n’est jamais en cache', async ({ request }) => {
		const response = await request.get('/auth/signin')
		const cc = response.headers()['cache-control'] ?? ''
		expect(cc).toContain('private')
		expect(cc).toContain('no-store')
	})
})
