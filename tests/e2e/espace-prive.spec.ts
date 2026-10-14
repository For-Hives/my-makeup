import { expect, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'

/**
 * The closed pages of the space (ticket 075; plan 02 E09, E16): one redirection without a session,
 * a way back that stays on the site, never cached, no token in what the page sends.
 */

const MOT_DE_PASSE = 'motdepasse-fictif'
let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${10 + (++compteur % 80)}` })
)

test.describe('Pages de l’espace sans session', { tag: '@mobile' }, () => {
	test('une seule redirection vers la connexion, avec la page de retour', async ({ request }) => {
		const reponse = await request.get('/auth/profil', { maxRedirects: 0 })

		expect(reponse.status()).toBe(307)
		expect(reponse.headers().location).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
	})

	test('la page de connexion répond ensuite 200, sans seconde redirection', async ({ page, request }) => {
		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)

		const suite = await request.get('/auth/signin?callbackUrl=%2Fauth%2Fprofil', { maxRedirects: 0 })
		expect(suite.status()).toBe(200)
	})

	test('/auth/init-account est fermée de la même façon', async ({ request }) => {
		const reponse = await request.get('/auth/init-account', { maxRedirects: 0 })
		expect(reponse.status()).toBe(307)
		expect(reponse.headers().location).toBe('/auth/signin?callbackUrl=%2Fauth%2Finit-account')
	})

	test('un cookie qui ne vaut plus rien : une redirection, puis le formulaire, jamais de boucle', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('maquilleuse')
		const cookie = compte.session.cookies[0]
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
		const admin = await creerCompte('admin')
		await context.addCookies(admin.session.cookies)

		await page.goto('/auth/profil')

		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
	})
})

test.describe('E09 : le retour après la connexion', () => {
	test('une page interne est respectée', async ({ page }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

		await page.goto('/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fvenue%3Dtest')
		await page.getByLabel('Adresse email').fill(compte.email)
		await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
		await page.getByRole('button', { name: 'Se connecter' }).click()

		await expect(page).toHaveURL(/\/auth\/profil\?venue=test$/)
	})

	test('un retour vers un autre site est ignoré', async ({ page }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

		for (const retour of ['https://evil.example/', '//evil.example']) {
			await page.context().clearCookies()
			await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(retour)}`)
			await page.getByLabel('Adresse email').fill(compte.email)
			await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
			await page.getByRole('button', { name: 'Se connecter' }).click()
			await expect(page).toHaveURL(/\/auth\/profil$/)
		}
	})

	test('une action envoyée depuis une autre origine est refusée : aucune session ne s’ouvre', async ({
		baseURL,
		page,
		playwright,
	}) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		// A real submit, to learn what the browser sends for the action.
		const envoi = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/auth/signin')
		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(compte.email)
		await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
		await page.getByRole('button', { name: 'Se connecter' }).click()
		const requete = await envoi
		const corps = requete.postDataBuffer()
		if (!corps) throw new Error('La requête de l’action n’a pas de corps.')
		const { origin: _origine, cookie: _cookie, ...entetes } = await requete.allHeaders()

		// The same request, replayed by a client with no cookie, from a given origin.
		const rejouer = async (origin: string) => {
			const client = await playwright.request.newContext({ baseURL: baseURL ?? '' })
			try {
				return await client.post('/auth/signin', {
					headers: { ...entetes, origin, 'x-forwarded-for': '192.0.2.250' },
					data: corps,
					maxRedirects: 0,
				})
			} finally {
				await client.dispose()
			}
		}

		// The control: from the site's own origin the replay opens a session.
		const permise = await rejouer(baseURL ?? '')
		expect(permise.headers()['set-cookie']).toContain('payload-token=')

		const refusee = await rejouer('https://evil.example')
		expect(refusee.headers()['set-cookie']).toBeUndefined()
	})
})

test.describe('E16 : privé, sans stockage, aucun jeton', () => {
	test('l’espace n’est jamais en cache et ne contient aucun jeton, ni dans le HTML ni dans la charge RSC', async ({
		context,
		request,
	}) => {
		const compte = await creerCompte('maquilleuse')
		const cookie = compte.session.cookies[0]
		if (!cookie) throw new Error('pas de cookie')
		await context.addCookies(compte.session.cookies)
		const enTetes = { ...compte.session.enTetes }

		const html = await request.get('/auth/profil', { headers: enTetes })
		const rsc = await request.get('/auth/profil', { headers: { ...enTetes, RSC: '1' } })

		for (const reponse of [html, rsc]) {
			expect(reponse.status()).toBe(200)
			const cc = reponse.headers()['cache-control'] ?? ''
			expect(cc).toContain('private')
			expect(cc).toContain('no-store')
			const corps = await reponse.text()
			expect(corps).not.toContain(cookie.value)
			expect(corps).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)
			expect(corps).not.toMatch(/\$2[aby]\$|"hash"|"salt"|"sessions"|payload-token/)
		}
		expect((await html.text()).toLowerCase()).toContain('noindex')
	})

	test('la page de connexion non plus n’est jamais en cache', async ({ request }) => {
		const reponse = await request.get('/auth/signin')
		const cc = reponse.headers()['cache-control'] ?? ''
		expect(cc).toContain('private')
		expect(cc).toContain('no-store')
	})
})
