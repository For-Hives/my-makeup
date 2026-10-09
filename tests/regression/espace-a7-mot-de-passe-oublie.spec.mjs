import { expect, test } from '@playwright/test'
import { erreursDeLaPage } from './espace-helpers.mjs'
import { COMPTE_TEST } from './mock-api.mjs'
import { aller, appels, etat, panne, reinitialiserStrapi } from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

test.describe('A7 mot de passe oublié', () => {
	async function demander(page, email) {
		await aller(page, '/auth/mot-de-passe-oublie')
		await page.getByTestId('forgot-email-input').fill(email)
		await page.getByTestId('forgot-submit').click()
		const resultat = page.getByTestId('forgot-result')
		await expect(resultat).toBeVisible()
		return resultat.innerText()
	}

	test('S12 même réponse que l’adresse ait un compte ou non, et quand l’envoi échoue', async ({ page }) => {
		await aller(page, '/auth/signin')
		await page.getByTestId('forgot-password-link').click()
		await expect(page).toHaveURL(/\/auth\/mot-de-passe-oublie$/)

		const connue = await demander(page, COMPTE_TEST.email)
		const inconnue = await demander(page, 'personne@test.local')
		await panne({ fournisseurEmail: true })
		const fournisseurEnPanne = await demander(page, COMPTE_TEST.email)

		expect(connue).toBe(
			'Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe. Pense à regarder dans tes courriers indésirables.'
		)
		expect(inconnue).toBe(connue)
		expect(fournisseurEnPanne).toBe(connue)
		const { emails, journal } = await etat()
		expect(emails).toEqual([{ a: COMPTE_TEST.email, code: emails[0].code }])
		expect(appels(journal, 'POST', '/api/auth/forgot-password')).toHaveLength(3)
	})

	test('navigateur sans AbortSignal.timeout (iOS 15) : la demande de lien et la réinitialisation aboutissent', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			delete AbortSignal.timeout
		})
		expect(await demander(page, COMPTE_TEST.email)).toMatch(/^Si un compte existe avec cette adresse/)
		expect(await page.evaluate(() => typeof AbortSignal.timeout)).toBe('undefined')
		const [{ code }] = (await etat()).emails
		await aller(page, `/auth/reinitialiser?code=${code}`)
		await page.getByTestId('reset-password-input').fill('Nouveau-mdp-5')
		await page.getByTestId('reset-confirmation-input').fill('Nouveau-mdp-5')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-result')).toBeVisible()
		expect((await etat()).journal.filter(e => e.m === 'POST' && e.p === '/api/auth/reset-password')).toHaveLength(1)
	})

	test('adresse mal formée : refusée par le formulaire, rien n’est envoyé', async ({ page }) => {
		await aller(page, '/auth/mot-de-passe-oublie')
		await page.getByTestId('forgot-email-input').fill('pas-une-adresse')
		await page.getByTestId('forgot-submit').click()
		await expect(page.getByText('Email invalide')).toBeVisible()
		expect(appels((await etat()).journal, 'POST', '/api/auth/forgot-password')).toHaveLength(0)
	})

	test('réinitialisation avec le code : il quitte l’URL, le nouveau mot de passe ouvre la session, l’ancien et le lien déjà servi sont refusés', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await demander(page, COMPTE_TEST.email)
		const [{ code }] = (await etat()).emails

		await aller(page, `/auth/reinitialiser?code=${code}`)
		// the code left the URL (audience measurement, history, Referer)
		await expect(page).toHaveURL(/\/auth\/reinitialiser$/)
		const cookie = (await page.context().cookies()).find(c => c.name === 'mm-reinit')
		expect(cookie.path).toBe('/auth/reinitialiser')
		expect(cookie.httpOnly).toBe(true)

		await page.getByTestId('reset-password-input').fill('Nouveau-mdp-2')
		await page.getByTestId('reset-confirmation-input').fill('Nouveau-mdp-3')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-error')).toHaveText('Les deux mots de passe ne sont pas identiques.')
		expect(appels((await etat()).journal, 'POST', '/api/auth/reset-password')).toHaveLength(0)

		await page.getByTestId('reset-confirmation-input').fill('Nouveau-mdp-2')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-result')).toBeVisible()

		// the old password no longer opens a session, the new one does
		await aller(page, '/auth/signin')
		await page.getByTestId('email-input').fill(COMPTE_TEST.email)
		await page.getByTestId('password-input').fill(COMPTE_TEST.password)
		await page.getByTestId('email-signin').click()
		await expect(page.getByTestId('signin-error')).toHaveText('Email ou mot de passe incorrect.')
		await page.getByTestId('password-input').fill('Nouveau-mdp-2')
		await page.getByTestId('email-signin').click()
		await expect(page).toHaveURL(/\/auth\/profil/)

		// the link already used: no longer valid
		await aller(page, `/auth/reinitialiser?code=${code}`)
		await page.getByTestId('reset-password-input').fill('Encore-un-mdp-4')
		await page.getByTestId('reset-confirmation-input').fill('Encore-un-mdp-4')
		await page.getByTestId('reset-submit').click()
		await expect(page.getByTestId('reset-error')).toContainText("Ce lien n'est plus valable")
		await expect(page.getByTestId('reset-new-link')).toBeVisible()
		expect(erreurs).toEqual([])
	})

	test('page de réinitialisation sans code : lien pour en demander un', async ({ page }) => {
		await aller(page, '/auth/reinitialiser')
		await expect(page.getByTestId('reset-error')).toContainText('Ce lien est incomplet')
		await expect(page.getByTestId('reset-new-link')).toHaveAttribute('href', '/auth/mot-de-passe-oublie')
	})
})
