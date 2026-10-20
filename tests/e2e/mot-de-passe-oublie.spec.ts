import { type Browser, expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { mailReceived, waitMail } from '../support/mailpit'

/**
 * The forgotten password (tickets 085 and 086; plan 02 E08 and E15): she asks for a link, reads it in
 * the mail catcher, chooses a new password, signs in with it, and the old one is refused. The other
 * browser, signed in before, is signed out. The code is never left in the address, and a link that
 * cannot be used says so on the page.
 */

const ANCIEN = 'ancien-mot-de-passe-fictif'
const NOUVEAU = 'nouveau-mot-de-passe-fictif'
let compteur = 0
const adresse = () => `198.51.100.${10 + (++compteur % 200)}`
test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': adresse() }))

async function demander(page: Page, email: string) {
	await page.goto('/auth/mot-de-passe-oublie')
	// A click before the page has hydrated sends nothing.
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByRole('button', { name: 'Recevoir un lien' }).click()
	await expect(page.getByTestId('oubli-envoye')).toContainText('Si un compte existe avec cette adresse')
}

const lienDuMail = async (email: string): Promise<string> => {
	const mail = await waitMail({ pour: email, sujet: /Réinitialise ton mot de passe/ })
	const lien = mail.liens.find(l => new URL(l).pathname === '/auth/reinitialiser')
	if (!lien) throw new Error('Le mail ne porte pas le lien.')
	return lien
}

async function choisir(page: Page, motDePasse: string, confirmation = motDePasse) {
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Nouveau mot de passe').fill(motDePasse)
	await page.getByLabel('Confirme le mot de passe').fill(confirmation)
	await page.getByRole('button', { name: 'Enregistrer' }).click()
}

async function seConnecter(page: Page, email: string, motDePasse: string) {
	await page.goto('/auth/signin')
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(motDePasse)
	await page.getByRole('button', { name: 'Se connecter' }).click()
}

async function autreNavigateur(browser: Browser, email: string, motDePasse: string) {
	const contexte = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': adresse() } })
	const page = await contexte.newPage()
	await seConnecter(page, email, motDePasse)
	await expect(page).toHaveURL(/\/auth\/profil$/)
	return { contexte, page }
}

test.describe('E08 : le mot de passe oublié de bout en bout', { tag: '@mobile' }, () => {
	test('le lien du mail, un nouveau mot de passe, la connexion avec lui, l’ancien refusé', async ({ page }) => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => ANCIEN })

		// From the sign-in page, by the link.
		await page.goto('/auth/signin')
		await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
		await expect(page).toHaveURL(/\/auth\/mot-de-passe-oublie$/)
		await demander(page, compte.email)

		await page.goto(await lienDuMail(compte.email))
		// The code left the address: the bare page, and a cookie of that page only.
		await expect(page).toHaveURL(/\/auth\/reinitialiser$/)
		expect(page.url()).not.toContain('code')
		await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible()
		await choisir(page, NOUVEAU)
		await expect(page.getByTestId('mot-de-passe-modifie')).toContainText('Ton mot de passe est modifié.')

		await page.getByRole('link', { name: 'Me connecter' }).click()
		await seConnecter(page, compte.email, NOUVEAU)
		await expect(page).toHaveURL(/\/auth\/profil$/)

		// The old one is refused, in the common words.
		await page.context().clearCookies()
		await seConnecter(page, compte.email, ANCIEN)
		await expect(page.getByTestId('erreur-connexion')).toContainText('Email ou mot de passe incorrect.')
	})

	test('le lien ne sert qu’une fois : le rejouer dit qu’il n’est plus valable, avec le lien pour en demander un autre', async ({
		browser,
		page,
	}) => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => ANCIEN })
		await demander(page, compte.email)
		const lien = await lienDuMail(compte.email)
		await page.goto(lien)
		await choisir(page, NOUVEAU)
		await expect(page.getByTestId('mot-de-passe-modifie')).toBeVisible()

		const contexte = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': adresse() } })
		const autre = await contexte.newPage()
		const reponse = await autre.goto(lien)
		expect(reponse?.status()).toBe(200)
		await expect(autre.getByTestId('lien-perime')).toContainText('Ce lien n’est plus valable')
		await expect(autre.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
		await contexte.close()
	})

	test('des mots de passe différents ou trop courts : un message, et le lien reste bon', async ({ page }) => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => ANCIEN })
		await demander(page, compte.email)
		await page.goto(await lienDuMail(compte.email))

		await choisir(page, NOUVEAU, 'autre-chose-fictif')
		await expect(page.getByTestId('erreur-reinitialisation')).toContainText(
			'Les deux mots de passe ne sont pas identiques.'
		)
		await page.getByLabel('Nouveau mot de passe').fill('court')
		await page.getByLabel('Confirme le mot de passe').fill('court')
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByTestId('erreur-reinitialisation')).toContainText('au moins 8 caractères')

		await page.getByLabel('Nouveau mot de passe').fill(NOUVEAU)
		await page.getByLabel('Confirme le mot de passe').fill(NOUVEAU)
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(page.getByTestId('mot-de-passe-modifie')).toBeVisible()
	})
})

test.describe('E15 : choisir un nouveau mot de passe déconnecte l’autre navigateur', () => {
	test('la session ouverte ailleurs est fermée', async ({ browser, page }) => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => ANCIEN })
		const ailleurs = await autreNavigateur(browser, compte.email, ANCIEN)

		await demander(page, compte.email)
		await page.goto(await lienDuMail(compte.email))
		await choisir(page, NOUVEAU)
		await expect(page.getByTestId('mot-de-passe-modifie')).toBeVisible()

		await ailleurs.page.goto('/auth/profil')
		await expect(ailleurs.page).toHaveURL(/\/auth\/signin/)
		await expect(ailleurs.page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await ailleurs.contexte.close()
	})
})

test.describe('086 : la demande ne révèle aucun compte', () => {
	test('une adresse sans compte reçoit la même phrase, et aucun mail ne part', async ({ page }) => {
		const inconnue = `inconnue-${crypto.randomUUID()}@example.test`
		const connue = await createAccount('maquilleuse')
		await demander(page, inconnue)
		await page.goto('/auth/mot-de-passe-oublie')
		await demander(page, connue.email)
		// The mails leave after the answer, in order: once hers is there, the first request is done.
		await lienDuMail(connue.email)
		expect(await mailReceived(inconnue)).toEqual([])
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
		const ancien = 'a1'.repeat(64)
		const reponse = await page.goto(`/auth/reinitialiser?code=${ancien}`)

		expect(reponse?.status()).toBe(200)
		await expect(page).toHaveURL(/\/auth\/reinitialiser$/)
		await expect(page.getByTestId('lien-perime')).toContainText('Ce lien n’est plus valable')
		await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible()
		// And nothing of it is left in the page.
		expect(await page.content()).not.toContain(ancien)
	})

	test('sans lien du tout : la page dit qu’il est incomplet', async ({ page }) => {
		await page.goto('/auth/reinitialiser')
		await expect(page.getByTestId('lien-perime')).toContainText('Ce lien est incomplet')
	})
})

test.describe('les pages', () => {
	test('noindex, jamais en cache, sans Referer, et aucune violation grave', async ({ page, request }) => {
		for (const chemin of ['/auth/mot-de-passe-oublie', '/auth/reinitialiser']) {
			const reponse = await request.get(chemin)
			expect(reponse.status()).toBe(200)
			expect(reponse.headers()['x-robots-tag']).toContain('noindex')
			expect(reponse.headers()['cache-control']).toContain('no-store')
			await page.goto(chemin)
			expect(await violationsSevere(page)).toEqual([])
		}
		await page.goto('/auth/reinitialiser')
		expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer')
	})

	test('le lien du mail passe par une redirection qui pose un cookie propre à la page', async ({ request }) => {
		const reponse = await request.get(`/auth/reinitialiser?code=${'a'.repeat(40)}`, { maxRedirects: 0 })
		expect(reponse.status()).toBe(303)
		expect(new URL(reponse.headers().location ?? '', 'http://x').pathname).toBe('/auth/reinitialiser')
		expect(new URL(reponse.headers().location ?? '', 'http://x').search).toBe('')
		const cookie = reponse.headers()['set-cookie'] ?? ''
		expect(cookie).toContain('mm-reset=')
		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('Path=/auth/reinitialiser')
		expect(cookie).toContain('SameSite=lax')
		expect(reponse.headers()['referrer-policy']).toBe('no-referrer')
	})
})
