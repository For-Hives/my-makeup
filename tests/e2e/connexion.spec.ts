import { expect, test } from '@playwright/test'
import { creerCompte } from '../support/account-factory'

/**
 * The sign-in of a makeup artist (ticket 074; plan 02 E05, E06) and the way back (E09).
 *
 * The brake counts by client address and its counters live as long as the application: each test
 * sends its own made-up address (192.0.2.x, reserved for documentation) as the proxy would.
 */

const MOT_DE_PASSE = 'motdepasse-fictif'
let compteur = 0
const adresseDuTest = () => `192.0.2.${100 + (++compteur % 100)}`

test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': adresseDuTest() }))

async function seConnecter(page: import('@playwright/test').Page, email: string, motDePasse: string) {
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(motDePasse)
	await page.getByRole('button', { name: 'Se connecter' }).click()
}

test.describe('Connexion par email', { tag: '@mobile' }, () => {
	test('E05 : une saisie juste mène à l’espace, par un seul cookie illisible par le JavaScript', {
		tag: '@smoke',
	}, async ({ context, page }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

		await page.goto('/auth/signin')
		await expect(page.getByRole('heading', { level: 1, name: 'Se connecter' })).toBeVisible()
		await page.screenshot({ path: `test-results/essais/connexion-signin-${test.info().project.name}.png` })
		await seConnecter(page, compte.email, MOT_DE_PASSE)

		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
		const cookies = await context.cookies()
		expect(cookies.map(c => c.name)).toEqual(['payload-token'])
		expect(cookies[0]).toMatchObject({ httpOnly: true, path: '/', sameSite: 'Lax', secure: true })
		expect(await page.evaluate(() => document.cookie)).toBe('')
	})

	test('E06 : un mauvais mot de passe affiche le message générique, sans changer d’adresse', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

		await page.goto('/auth/signin')
		await seConnecter(page, compte.email, 'pas-le-bon')

		const alerte = page.getByTestId('erreur-connexion')
		await expect(alerte).toHaveText('Email ou mot de passe incorrect.')
		await expect(page).toHaveURL(/\/auth\/signin$/)
		expect(await context.cookies()).toEqual([])
	})

	test('une adresse inconnue donne le même message', async ({ page }) => {
		await page.goto('/auth/signin')
		await seConnecter(page, 'personne@example.test', MOT_DE_PASSE)
		await expect(page.getByTestId('erreur-connexion')).toHaveText('Email ou mot de passe incorrect.')
	})

	test('l’email est insensible à la casse', async ({ page }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await page.goto('/auth/signin')
		await seConnecter(page, compte.email.toUpperCase(), MOT_DE_PASSE)
		await expect(page).toHaveURL(/\/auth\/profil$/)
	})

	test('Entrée maintenue : un seul envoi', async ({ page }) => {
		const envois: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/signin') envois.push(requete.url())
		})
		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill('personne@example.test')
		await page.getByLabel('Mot de passe').fill('x')

		for (let i = 0; i < 6; i++) await page.keyboard.press('Enter')

		await expect(page.getByTestId('erreur-connexion')).toHaveText('Email ou mot de passe incorrect.')
		expect(envois).toHaveLength(1)
	})

	test('déjà connectée : la page de connexion renvoie vers l’espace', async ({ context, page }) => {
		const compte = await creerCompte('maquilleuse')
		await context.addCookies(compte.session.cookies)

		await page.goto('/auth/signin')

		await expect(page).toHaveURL(/\/auth\/profil$/)
	})

	test('les pages d’authentification sont en noindex', async ({ page, request }) => {
		const reponse = await request.get('/auth/signin')
		expect(reponse.headers()['x-robots-tag']).toContain('noindex')
		await page.goto('/auth/signin')
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
	})
})
