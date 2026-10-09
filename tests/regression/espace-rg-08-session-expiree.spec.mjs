import { expect, test } from '@playwright/test'
import { erreursDeLaPage } from './espace-helpers.mjs'
import { COMPTE_TEST } from './mock-api.mjs'
import {
	aller,
	appels,
	connecter,
	etat,
	ouvrirProfil,
	panne,
	piloter,
	profilServeur,
	reinitialiserStrapi,
} from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

test.describe('RG-08 session expirée', () => {
	// documents of the main frame loaded from the server (history.replaceState
	// of the Next router is not one), with their status
	function navigations(page) {
		const liste = []
		page.on('response', r => {
			if (r.request().isNavigationRequest() && r.frame() === page.mainFrame())
				liste.push([r.status(), new URL(r.url()).pathname])
		})
		return liste
	}
	const versLaConnexion = liste => liste.filter(([, chemin]) => chemin === '/auth/signin')
	const cheminDe = page => {
		const url = new URL(page.url())
		return url.pathname + url.search
	}
	const sessionPresente = async page =>
		(await page.context().cookies()).some(c => c.name.startsWith('next-auth.session-token'))

	test('RG-08 JWT refusé pendant une sauvegarde : une seule redirection vers la connexion, message « session expirée », pas de boucle', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		const vues = navigations(page)
		// Strapi refuses every JWT issued so far (secret rotated, account blocked…)
		await piloter('/__revoquer', {})
		await page.getByTestId('update-description-button').click()
		await page.getByTestId('description-input').fill('Texte jamais enregistré')
		await page.getByTestId('save-button-description').click()

		await expect(page).toHaveURL(/\/auth\/signin\?error=session-expiree$/)
		await expect(page.getByTestId('signin-url-error')).toHaveText('Ta session a expiré, reconnecte-toi.')
		// settled: nothing sends her anywhere else
		await page.waitForLoadState('networkidle')
		expect(versLaConnexion(vues)).toEqual([[200, '/auth/signin']])
		expect(vues).toEqual([[200, '/auth/signin']])
		expect(cheminDe(page)).toBe('/auth/signin?error=session-expiree')
		expect(await sessionPresente(page)).toBe(false)
		expect((await profilServeur()).description).toBe('Description initiale')
	})

	test('RG-08 JWT refusé au chargement de l’espace : une seule redirection (307), message « session expirée », pas de boucle', async ({
		page,
	}) => {
		expect(await connecter(page)).toBe(true)
		// /users/me still says 200, /api/me-makeup refuses the JWT
		await panne({ meMakeup401: true })
		const vues = navigations(page)

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin\?error=session-expiree$/)
		await expect(page.getByTestId('signin-url-error')).toHaveText('Ta session a expiré, reconnecte-toi.')
		await page.waitForLoadState('networkidle')
		expect(vues).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
		expect(await sessionPresente(page)).toBe(false)

		// back to the private page: one redirection to the sign-in page, no loop
		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await page.waitForLoadState('networkidle')
		expect(vues.slice(2)).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
	})

	test('RG-08 JWT Strapi expiré à l’ouverture de l’espace : une seule redirection (307) par le middleware, message « session expirée », page gardée, pas de boucle', async ({
		page,
	}) => {
		// 30 s: inside the 60 s margin, the JWT counts as expired
		await panne({ dureeJwtS: 30 })
		expect(await connecter(page)).toBe(true)
		const vues = navigations(page)
		const redirection = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/profil')

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin\?error=session-expiree&ou=middleware&callbackUrl=%2Fauth%2Fprofil$/)
		// the middleware deletes the cookie on the 307 itself, before the
		// sign-in page reads the session
		expect((await redirection).status()).toBe(307)
		expect(await (await redirection).headerValues('set-cookie')).toEqual([
			expect.stringMatching(/^next-auth\.session-token=; .*Max-Age=0/),
		])
		await expect(page.getByTestId('signin-url-error')).toHaveText('Ta session a expiré, reconnecte-toi.')
		await page.waitForLoadState('networkidle')
		expect(vues).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
		expect(await sessionPresente(page)).toBe(false)
		expect(appels((await etat()).journal, 'GET', '/api/me-makeup')).toEqual([])
	})

	test('RG-08 JWT révoqué, refusé par /users/me à la lecture de la session : une seule redirection (307), message « session expirée », retour à l’espace après connexion', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		expect(await connecter(page)).toBe(true)
		// every JWT issued so far is refused, /users/me included; run.mjs sets
		// AUTH_REVALIDATION_MS=0, so the session read asks Strapi every time
		await piloter('/__revoquer', {})
		const vues = navigations(page)

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin\?error=session-expiree&ou=jwt_expire&callbackUrl=%2Fauth%2Fprofil$/)
		await expect(page.getByTestId('signin-url-error')).toHaveText('Ta session a expiré, reconnecte-toi.')
		await page.waitForLoadState('networkidle')
		expect(vues).toEqual([
			[307, '/auth/profil'],
			[200, '/auth/signin'],
		])
		expect(await sessionPresente(page)).toBe(false)

		// signing in again goes back to the page she asked for
		await page.getByTestId('email-input').fill(COMPTE_TEST.email)
		await page.getByTestId('password-input').fill(COMPTE_TEST.password)
		await page.getByTestId('email-signin').click()
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		expect(erreurs).toEqual([])
	})

	test('RG-08 JWT Strapi expiré, clic sur « Profil » dans le menu (navigation côté client) : message « session expirée », page gardée, pas de boucle', async ({
		page,
	}) => {
		expect(await connecter(page)).toBe(true)
		await aller(page, '/')
		const lien = page.getByRole('link', { name: 'Profil', exact: true })
		await expect(lien).toBeVisible()
		// a new session whose JWT is already inside the 60 s margin, that the
		// open page has not read: as if it expired while she was reading
		await panne({ dureeJwtS: 30 })
		expect(await connecter(page)).toBe(true)
		const vues = navigations(page)

		await lien.click()
		await expect(page).toHaveURL(/\/auth\/signin\?error=session-expiree&ou=middleware&callbackUrl=%2Fauth%2Fprofil$/)
		await expect(page.getByTestId('signin-url-error')).toHaveText('Ta session a expiré, reconnecte-toi.')
		await page.waitForLoadState('networkidle')
		expect(versLaConnexion(vues).length).toBeLessThanOrEqual(1)
		expect(await sessionPresente(page)).toBe(false)
		expect(appels((await etat()).journal, 'GET', '/api/me-makeup')).toEqual([])
	})
})
