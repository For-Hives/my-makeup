import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { fakeGoogle } from '../support/fake-google'
import { waitMail } from '../support/mailpit'
import { testPayload } from '../support/payload-test'

/**
 * An account without a password of its own (ticket 093; plan 02 E74): an old Google account or an old
 * Facebook one asks for a link through « Mot de passe oublié », reads it in the mail catcher, chooses
 * its password and signs in with it. Google keeps working. The rules are played by
 * tests/integration/auth-comptes-sans-mot-de-passe.test.ts.
 */

const CHOIX = 'mot-de-passe-choisi-fictif'
let compteur = 0
// Each test reads the mail sent to its own address: the mail catcher is not emptied between them.
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${120 + (++compteur % 100)}` })
)

async function definirSonMotDePasse(page: Page, email: string) {
	await page.goto('/auth/signin')
	await page.getByRole('link', { name: 'Mot de passe oublié', exact: true }).click()
	await expect(page).toHaveURL(/\/auth\/mot-de-passe-oublie$/)
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByRole('button', { name: 'Recevoir un lien' }).click()
	await expect(page.getByTestId('oubli-envoye')).toBeVisible()

	const mail = await waitMail({ pour: email, sujet: /Réinitialise ton mot de passe/ })
	const lien = mail.liens.find(l => new URL(l).pathname === '/auth/reinitialiser')
	if (!lien) throw new Error('Le mail ne porte pas le lien.')
	await page.goto(lien)
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Nouveau mot de passe').fill(CHOIX)
	await page.getByLabel('Confirme le mot de passe').fill(CHOIX)
	await page.getByRole('button', { name: 'Enregistrer' }).click()
	await expect(page.getByTestId('mot-de-passe-modifie')).toBeVisible()
}

async function seConnecter(page: Page, email: string, motDePasse: string) {
	await page.goto('/auth/signin')
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(motDePasse)
	await page.getByRole('button', { name: 'Se connecter' }).click()
}

const profils = async (id: number | string) =>
	(
		await (
			await testPayload()
		).find({
			collection: 'profiles',
			depth: 0,
			overrideAccess: true,
			where: { pro: { equals: id } },
		})
	).docs.map(({ id: profil, slug }) => ({ id: profil, slug }))

async function choisirSurGoogle(context: BrowserContext, email: string) {
	await context.clearCookies({ name: 'faux_google_choix' })
	await context.addCookies(fakeGoogle().choisir({ email }).cookies)
}

test.describe('093 : la ligne d’aide de la connexion', () => {
	test('elle est affichée à tout le monde, sans bouton Facebook', { tag: '@mobile' }, async ({ page }) => {
		await page.goto('/auth/signin')

		const aide = page.getByTestId('aide-sans-mot-de-passe')
		await expect(aide).toContainText('Tu t’étais inscrite avec Facebook ?')
		await aide.getByRole('link', { name: 'Mot de passe oublié' }).click()
		await expect(page).toHaveURL(/\/auth\/mot-de-passe-oublie$/)

		await page.goto('/auth/signin')
		await expect(page.getByRole('link', { name: /facebook/i })).toHaveCount(0)
		await expect(page.getByRole('button', { name: /facebook/i })).toHaveCount(0)
	})
})

test.describe('E74 : un compte sans mot de passe en définit un', () => {
	test('ancien compte Google : le lien du mail, un mot de passe, la connexion avec lui, puis avec Google', async ({
		context,
		page,
	}) => {
		const compte = await createAccount('reprise-google')
		const avant = await profils(compte.id)
		await context.clearCookies()

		await definirSonMotDePasse(page, compte.email)
		await seConnecter(page, compte.email, CHOIX)
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await page.getByRole('main').getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		await choisirSurGoogle(context, compte.email)
		await page.goto('/auth/signin')
		await page.getByRole('link', { name: 'Se connecter avec Google' }).click()
		await expect(page).toHaveURL(/\/auth\/profil$/)
		expect(await profils(compte.id)).toEqual(avant)
	})

	test('ancien compte Facebook : refusé avec le message générique, puis le lien, le mot de passe, le même profil', async ({
		page,
	}) => {
		const compte = await createAccount('reprise-facebook')
		const avant = await profils(compte.id)
		expect(avant).toHaveLength(1)

		await seConnecter(page, compte.email, CHOIX)
		await expect(page.getByTestId('erreur-connexion')).toHaveText('Email ou mot de passe incorrect.')

		await definirSonMotDePasse(page, compte.email)
		await seConnecter(page, compte.email, CHOIX)
		await expect(page).toHaveURL(/\/auth\/profil$/)
		expect(await profils(compte.id)).toEqual(avant)
	})
})
