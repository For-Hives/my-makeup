import { type Browser, expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { violationsSevere } from '../support/axe'
import { mailReceived, waitMail } from '../support/mailpit'

/**
 * The forgotten password (tickets 085 and 086; plan 02 E08 and E15): she asks for a link, reads it in
 * the mail catcher, chooses a new password, signs in with it, and the old one is refused. The other
 * browser, signed in before, is signed out. The code is never left in the address, and a link that
 * cannot be used says so on the page.
 */

const OLD = 'ancien-mot-de-passe-fictif'
const NEW_PASSWORD = 'nouveau-mot-de-passe-fictif'
let counter = 0
const url = () => `198.51.100.${10 + (++counter % 200)}`
test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': url() }))

async function ask(page: Page, email: string) {
	await page.goto('/auth/mot-de-passe-oublie')
	// A click before the page has hydrated sends nothing.
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByRole('button', { name: 'Recevoir un lien' }).click()
	await expect(page.getByTestId('oubli-envoye')).toContainText('Si un compte existe avec cette adresse')
}

const mailLink = async (email: string): Promise<string> => {
	const mail = await waitMail({ pour: email, sujet: /Réinitialise ton mot de passe/ })
	const link = mail.liens.find(l => new URL(l).pathname === '/auth/reinitialiser')
	if (!link) throw new Error('Le mail ne porte pas le lien.')
	return link
}

async function choose(page: Page, motDePasse: string, confirmation = motDePasse) {
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Nouveau mot de passe').fill(motDePasse)
	await page.getByLabel('Confirme le mot de passe').fill(confirmation)
	await page.getByRole('button', { name: 'Enregistrer' }).click()
}

async function signInAction(page: Page, email: string, motDePasse: string) {
	await page.goto('/auth/signin')
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(motDePasse)
	await page.getByRole('button', { name: 'Se connecter' }).click()
}

async function otherBrowser(browser: Browser, email: string, motDePasse: string) {
	const browserContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': url() } })
	const page = await browserContext.newPage()
	await signInAction(page, email, motDePasse)
	await expect(page).toHaveURL(/\/auth\/profil$/)
	return { contexte: browserContext, page }
}

test.describe('E08 : le mot de passe oublié de bout en bout', { tag: '@mobile' }, () => {
	test('le lien du mail, un nouveau mot de passe, la connexion avec lui, l’ancien refusé', async ({ page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => OLD })
		await activateProfile(account.id)

		// From the sign-in page, by the link.
		await page.goto('/auth/signin')
		await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
		await expect(page).toHaveURL(/\/auth\/mot-de-passe-oublie$/)
		await ask(page, account.email)

		await page.goto(await mailLink(account.email))
		// The code left the address: the bare page, and a cookie of that page only.
		await expect(page).toHaveURL(/\/auth\/reinitialiser$/)
		expect(page.url()).not.toContain('code')
		await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible()
		await choose(page, NEW_PASSWORD)
		// The new password opens her session (ticket 302): her space, without typing the address again.
		await expect(page).toHaveURL(/\/auth\/profil$/)
		expect((await page.context().cookies()).some(({ name }) => name === 'payload-token')).toBe(true)
		// The code of the link is gone with the form: it cannot serve again.
		expect((await page.context().cookies()).some(({ name }) => name === 'mm-reset')).toBe(false)

		// The old one is refused, in the common words.
		await page.context().clearCookies()
		await signInAction(page, account.email, OLD)
		await expect(page.getByTestId('erreur-connexion')).toContainText('Email ou mot de passe incorrect.')
	})

	test('une adresse jamais confirmée : le mot de passe choisi par le lien confirme l’adresse et ouvre l’espace, sans reconnexion (ticket 311)', async ({
		page,
	}) => {
		const account = await createAccount('maquilleuse-non-verifiee', { motDePasse: () => OLD })

		await ask(page, account.email)
		await page.goto(await mailLink(account.email))
		await choose(page, NEW_PASSWORD)
		await expect(page).toHaveURL(/\/auth\/(profil|init-account)$/)
		expect((await page.context().cookies()).some(({ name }) => name === 'payload-token')).toBe(true)

		// The address is confirmed: the password alone signs her in later.
		await page.context().clearCookies()
		await signInAction(page, account.email, NEW_PASSWORD)
		await expect(page).toHaveURL(/\/auth\/(profil|init-account)$/)
	})

	test('le lien ne sert qu’une fois : le rejouer dit qu’il n’est plus valable, avec le lien pour en demander un autre', async ({
		browser,
		page,
	}) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => OLD })
		await ask(page, account.email)
		const link = await mailLink(account.email)
		await page.goto(link)
		await choose(page, NEW_PASSWORD)
		// A profile still empty goes to the onboarding (ticket 296).
		await expect(page).toHaveURL(/\/auth\/init-account$/)

		const browserContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': url() } })
		const other = await browserContext.newPage()
		const response = await other.goto(link)
		expect(response?.status()).toBe(200)
		await expect(other.getByTestId('lien-perime')).toContainText('Ce lien n’est plus valable')
		await expect(other.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
		await browserContext.close()
	})

	test('des mots de passe différents ou trop courts : un message, et le lien reste bon', async ({ page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => OLD })
		await ask(page, account.email)
		await page.goto(await mailLink(account.email))

		await choose(page, NEW_PASSWORD, 'autre-chose-fictif')
		await expect(page.getByTestId('erreur-reinitialisation')).toContainText(
			'Les deux mots de passe ne sont pas identiques.'
		)
		await page.getByLabel('Nouveau mot de passe').fill('court')
		await page.getByLabel('Confirme le mot de passe').fill('court')
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByTestId('erreur-reinitialisation')).toContainText('au moins 8 caractères')

		await page.getByLabel('Nouveau mot de passe').fill(NEW_PASSWORD)
		await page.getByLabel('Confirme le mot de passe').fill(NEW_PASSWORD)
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page).toHaveURL(/\/auth\/init-account$/)
	})
})

test.describe('E15 : choisir un nouveau mot de passe déconnecte l’autre navigateur', () => {
	test('la session ouverte ailleurs est fermée', async ({ browser, page }) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => OLD })
		await activateProfile(account.id)
		const elsewhere = await otherBrowser(browser, account.email, OLD)

		await ask(page, account.email)
		await page.goto(await mailLink(account.email))
		await choose(page, NEW_PASSWORD)
		await expect(page).toHaveURL(/\/auth\/profil$/)

		await elsewhere.page.goto('/auth/profil')
		await expect(elsewhere.page).toHaveURL(/\/auth\/signin/)
		await expect(elsewhere.page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await elsewhere.contexte.close()
	})
})

test.describe('086 : la demande ne révèle aucun compte', () => {
	test('une adresse sans compte reçoit la même phrase, et aucun mail ne part', async ({ page }) => {
		const unknown = `inconnue-${crypto.randomUUID()}@example.test`
		const known = await createAccount('maquilleuse')
		await ask(page, unknown)
		await page.goto('/auth/mot-de-passe-oublie')
		await ask(page, known.email)
		// The mails leave after the answer, in order: once hers is there, the first request is done.
		await mailLink(known.email)
		expect(await mailReceived(unknown)).toEqual([])
	})

	test('une adresse mal écrite est refusée sur la page', async ({ page }) => {
		await page.goto('/auth/mot-de-passe-oublie')
		await page.waitForLoadState('networkidle')
		await page.getByLabel('Adresse email').fill('pas-une-adresse')
		await page.getByRole('button', { name: 'Recevoir un lien' }).click()
		await expect(page.getByTestId('erreur-oubli')).toContainText('Cette adresse email n’est pas valide.')
	})
})

test.describe('un lien venu de l’ancien site', () => {
	test('« Ce lien n’est plus valable », une page 200, jamais une erreur serveur', async ({ page }) => {
		const old = 'a1'.repeat(64)
		const response = await page.goto(`/auth/reinitialiser?code=${old}`)

		expect(response?.status()).toBe(200)
		await expect(page).toHaveURL(/\/auth\/reinitialiser$/)
		await expect(page.getByTestId('lien-perime')).toContainText('Ce lien n’est plus valable')
		await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
		// And nothing of it is left in the page.
		expect(await page.content()).not.toContain(old)
	})

	test('sans lien du tout : la page dit qu’il est incomplet', async ({ page }) => {
		await page.goto('/auth/reinitialiser')
		await expect(page.getByTestId('lien-perime')).toContainText('Ce lien est incomplet')
	})
})

test.describe('les pages', () => {
	test('noindex, jamais en cache, sans Referer, et aucune violation grave', async ({ page, request }) => {
		for (const path of ['/auth/mot-de-passe-oublie', '/auth/reinitialiser']) {
			const response = await request.get(path)
			expect(response.status()).toBe(200)
			expect(response.headers()['x-robots-tag']).toContain('noindex')
			expect(response.headers()['cache-control']).toContain('no-store')
			await page.goto(path)
			expect(await violationsSevere(page)).toEqual([])
		}
		await page.goto('/auth/reinitialiser')
		expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer')
	})

	test('le lien du mail passe par une redirection qui pose un cookie propre à la page', async ({ request }) => {
		const response = await request.get(`/auth/reinitialiser?code=${'a'.repeat(40)}`, { maxRedirects: 0 })
		expect(response.status()).toBe(303)
		expect(new URL(response.headers().location ?? '', 'http://x').pathname).toBe('/auth/reinitialiser')
		expect(new URL(response.headers().location ?? '', 'http://x').search).toBe('')
		const cookie = response.headers()['set-cookie'] ?? ''
		expect(cookie).toContain('mm-reset=')
		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('Path=/auth/reinitialiser')
		expect(cookie).toContain('SameSite=lax')
		expect(response.headers()['referrer-policy']).toBe('no-referrer')
	})
})
