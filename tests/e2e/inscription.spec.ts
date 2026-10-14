import { expect, type Page, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { attendreLeMail } from '../outils/mailpit'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The sign-up (ticket 082; plan 02 E01, adapted): she signs up, the wall tells her to look in her
 * mailbox, the link of the mail confirms the account, she signs in and arrives in the onboarding.
 * Before the link, the account does not sign in, and says why.
 */

const MOT_DE_PASSE = 'motdepasse-fictif'
let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++compteur % 90)}` })
)

const adresse = () => `inscrite-${crypto.randomUUID()}@example.test`

async function sInscrire(page: Page, email: string, nom = 'Léa Fictive') {
	await page.goto('/auth/signup')
	await page.getByLabel('Nom', { exact: true }).fill(nom)
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
	await page.getByLabel('J’accepte les conditions générales').check()
	await page.getByRole('button', { name: 'S’inscrire' }).click()
}

async function seConnecter(page: Page, email: string, retour?: string) {
	await page.goto(retour ? `/auth/signin?callbackUrl=${encodeURIComponent(retour)}` : '/auth/signin')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
	await page.getByRole('button', { name: 'Se connecter' }).click()
}

const lienDuMail = async (email: string): Promise<string> => {
	const mail = await attendreLeMail({ pour: email })
	const lien = mail.liens.find(l => l.includes('/auth/verification-complete'))
	if (!lien) throw new Error('Le mail ne porte pas le lien de confirmation.')
	return lien
}

test.describe('E01 : inscription, mur, lien, connexion, onboarding', { tag: '@mobile' }, () => {
	test('le parcours entier', async ({ page }) => {
		const email = adresse()

		await sInscrire(page, email)

		// The wall: look in the mailbox.
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		await expect(page.getByRole('heading', { name: 'Vérifie ton adresse email My Makeup' })).toBeVisible()
		// Signed out: the cookie of the session is not there.
		expect((await page.context().cookies()).some(({ name }) => name === 'payload-token')).toBe(false)

		// The link of the mail confirms the account.
		await page.goto(await lienDuMail(email))
		await expect(page.getByRole('heading', { name: /Ton compte My Makeup est maintenant activé/ })).toBeVisible()

		// Sign in from the page: she lands in the onboarding.
		await page.getByRole('link', { name: 'Se connecter' }).click()
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Finit-account$/)
		await seConnecter(page, email, '/auth/init-account')
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(page.getByRole('heading', { name: 'Bienvenue sur My Makeup' })).toBeVisible()
		// Her profile and its address were made by the server, with the account.
		const payload = await payloadDeTest()
		const compte = (await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })).docs[0]
		const profil = (await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte?.id } } }))
			.docs[0]
		expect(profil?.slug).toMatch(/^lea-fictive(-\d+)?$/)
	})
})

test.describe('avant le lien', () => {
	test('la connexion dit que l’adresse n’est pas confirmée, avec le bon mot de passe seulement', async ({ page }) => {
		const email = adresse()
		await sInscrire(page, email)
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)

		await seConnecter(page, email)
		await expect(page.getByTestId('erreur-connexion')).toContainText('pas encore confirmée')
		await expect(page).toHaveURL(/\/auth\/signin/)

		// React empties the form once the action has answered: she types it again.
		await page.getByLabel('Adresse email').fill(email)
		await page.getByLabel('Mot de passe').fill('un-autre-mot-de-passe')
		await page.getByRole('button', { name: 'Se connecter' }).click()
		await expect(page.getByTestId('erreur-connexion')).toContainText('Email ou mot de passe incorrect.')
		await expect(page.getByTestId('erreur-connexion')).not.toContainText('confirmée')
	})

	test('le même lien suivi une seconde fois dit « déjà confirmée » ; un lien tronqué dit qu’il n’est pas valide', async ({
		page,
	}) => {
		const email = adresse()
		await sInscrire(page, email)
		const lien = await lienDuMail(email)

		await page.goto(lien)
		await expect(page.getByRole('heading', { name: /maintenant activé/ })).toBeVisible()
		await page.goto(lien)
		await expect(page.getByRole('heading', { name: 'Ton adresse email est déjà confirmée.' })).toBeVisible()
		await page.goto(lien.slice(0, -5))
		await expect(page.getByRole('heading', { name: 'Ce lien de confirmation n’est pas valide.' })).toBeVisible()
		await page.goto('/auth/verification-complete')
		await expect(page.getByRole('heading', { name: 'Ce lien de confirmation n’est pas valide.' })).toBeVisible()
	})
})

test.describe('U25 : les messages du formulaire', () => {
	test('un formulaire vide donne un message par champ, sous le champ, et ne crée rien', async ({ page }) => {
		await page.goto('/auth/signup')

		await page.getByRole('button', { name: 'S’inscrire' }).click()

		await expect(page.getByTestId('erreur-nom')).toHaveText('Indique ton nom.')
		await expect(page.getByTestId('erreur-email')).toHaveText('Indique ton adresse email.')
		await expect(page.getByTestId('erreur-password')).toHaveText('Choisis un mot de passe.')
		await expect(page.getByTestId('erreur-cgu')).toHaveText('Pour t’inscrire, accepte les conditions générales.')
		await expect(page).toHaveURL(/\/auth\/signup$/)
	})

	test('un mot de passe de 7 caractères est refusé, ce que tu as tapé reste, le mot de passe non', async ({ page }) => {
		const email = adresse()
		await page.goto('/auth/signup')
		await page.getByLabel('Nom', { exact: true }).fill('Nom Gardé')
		await page.getByLabel('Adresse email').fill(email)
		await page.getByLabel('Mot de passe').fill('1234567')
		await page.getByLabel('J’accepte les conditions générales').check()

		await page.getByRole('button', { name: 'S’inscrire' }).click()

		await expect(page.getByTestId('erreur-password')).toHaveText('Ton mot de passe doit faire au moins 8 caractères.')
		await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('Nom Gardé')
		await expect(page.getByLabel('Adresse email')).toHaveValue(email)
		await expect(page.getByLabel('Mot de passe')).toHaveValue('')
		await expect(page.getByLabel('J’accepte les conditions générales')).toBeChecked()
	})

	test('une adresse déjà utilisée est dite, sans erreur de serveur', async ({ page }) => {
		const email = adresse()
		await sInscrire(page, email)
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)

		await sInscrire(page, email, 'Autre Personne')

		await expect(page.getByTestId('erreur-inscription')).toContainText('Cette adresse email est déjà utilisée.')
		await expect(page).toHaveURL(/\/auth\/signup$/)
	})
})

test.describe('Accessibilité des pages de l’inscription', { tag: '@mobile' }, () => {
	test('le formulaire, vide puis avec ses messages d’erreur, et le mur : aucune violation grave', async ({ page }) => {
		await page.goto('/auth/signup')
		expect(await violationsGraves(page)).toEqual([])

		await page.getByRole('button', { name: 'S’inscrire' }).click()
		await expect(page.getByTestId('erreur-nom')).toHaveText('Indique ton nom.')
		expect(await violationsGraves(page)).toEqual([])

		await page.goto('/auth/verification-wall')
		expect(await violationsGraves(page)).toEqual([])
	})
})

test.describe('les pages', () => {
	test('l’inscription, le mur et la confirmation répondent 200 sans session, en noindex, jamais en cache', async ({
		request,
	}) => {
		for (const chemin of ['/auth/signup', '/auth/verification-wall', '/auth/verification-complete']) {
			const reponse = await request.get(chemin, { maxRedirects: 0 })
			expect(reponse.status(), chemin).toBe(200)
			expect(reponse.headers()['x-robots-tag'], chemin).toContain('noindex')
			expect(reponse.headers()['cache-control'], chemin).toMatch(/no-store/)
		}
	})

	test('l’onboarding est fermé sans session : une redirection vers la connexion', async ({ request }) => {
		const reponse = await request.get('/auth/init-account', { maxRedirects: 0 })
		expect(reponse.status()).toBe(307)
	})

	test('la connexion mène à l’inscription et l’inscription à la connexion', async ({ page }) => {
		await page.goto('/auth/signin')
		await page.getByRole('link', { name: 'Inscris-toi' }).click()
		await expect(page).toHaveURL(/\/auth\/signup$/)
		await page.getByRole('link', { name: 'Connecte-toi' }).click()
		await expect(page).toHaveURL(/\/auth\/signin$/)
	})
})
