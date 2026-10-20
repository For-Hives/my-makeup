import { expect, test } from '@playwright/test'
import { violationsGraves } from '../support/axe'

/**
 * The exit of P5 (ticket 096): no « serious » or « critical » accessibility violation on the
 * authentication pages that need no session, at 1440 px (project `chromium`) and at 390 px
 * (project `mobile`, thanks to the tag). The sign-up page, the wall and the forgotten-password pages
 * are also read by their own specs; this one adds the sign-in page in each of its states (including the single-reconnection message) and the
 * confirmation page, so that every page of the authentication is read at both sizes.
 */

const PAGES = [
	{ nom: 'la connexion', chemin: '/auth/signin' },
	{ nom: 'la connexion, avec le message de session expirée', chemin: '/auth/signin?error=session-expiree' },
	{ nom: 'la connexion, avec un refus de Google', chemin: '/auth/signin?error=google-annule' },
	{ nom: 'l’inscription', chemin: '/auth/signup' },
	{ nom: 'le mur de vérification', chemin: '/auth/verification-wall' },
	{ nom: 'la confirmation de l’adresse', chemin: '/auth/verification-complete' },
	{ nom: 'la demande de lien', chemin: '/auth/mot-de-passe-oublie' },
	{ nom: 'le nouveau mot de passe', chemin: '/auth/reinitialiser' },
] as const

test.describe('Accessibilité des pages d’authentification', { tag: '@mobile' }, () => {
	for (const { nom, chemin } of PAGES) {
		test(`${nom} : aucune violation grave`, async ({ page }) => {
			await page.goto(chemin)
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			expect(await violationsGraves(page)).toEqual([])
		})
	}

	test('la connexion, avec le message « Reconnecte-toi une fois » : aucune violation grave', async ({
		baseURL,
		context,
		page,
	}) => {
		await context.addCookies([
			{
				name: '__Secure-next-auth.session-token.0',
				value: 'ancienne-valeur',
				domain: new URL(baseURL ?? '').hostname,
				path: '/',
				secure: true,
			},
		])
		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin/)
		await expect(page.getByTestId('message-reconnexion')).toBeVisible()
		expect(await violationsGraves(page)).toEqual([])
	})
})
