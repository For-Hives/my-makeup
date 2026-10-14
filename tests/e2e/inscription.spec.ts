import { expect, type Page, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { attendreLeMail, mailsRecus } from '../outils/mailpit'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The sign-up (ticket 082; plan 02 E01, adapted): she signs up, the wall tells her to look in her
 * mailbox, the link of the mail confirms the account, she signs in and arrives in the onboarding.
 * Before the link, the account does not sign in, and says why.
 */

const MOT_DE_PASSE = 'motdepasse-fictif'
let compteur = 0
// One address for each test, and none shared between the workers: the sign-up is braked at 5 an hour
// by client address (ticket 084), and the bench application sees every browser under the same one.
const nouvelleAdresse = (travailleur: number) => `198.51.${100 + travailleur}.${++compteur % 250}`
test.beforeEach(({ context }, info) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': nouvelleAdresse(info.workerIndex) })
)

const adresse = () => `inscrite-${crypto.randomUUID()}@example.test`

async function sInscrire(page: Page, email: string, nom = 'Léa Fictive') {
	await page.goto('/auth/signup')
	// A click before the page has hydrated sends nothing: the form is only a placeholder until then.
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Nom', { exact: true }).fill(nom)
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
	await page.getByLabel('J’accepte les conditions générales').check()
	await page.getByRole('button', { name: 'S’inscrire' }).click()
}

async function seConnecter(page: Page, email: string, retour?: string) {
	await page.goto(retour ? `/auth/signin?callbackUrl=${encodeURIComponent(retour)}` : '/auth/signin')
	await page.waitForLoadState('networkidle')
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
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
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
		await page.waitForLoadState('networkidle')
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

	test('E03 : une adresse déjà utilisée mène au même mur, sans doublon, et la propriétaire reçoit « tu as déjà un compte »', async ({
		page,
	}) => {
		const email = adresse()
		await sInscrire(page, email)
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		await attendreLeMail({ pour: email })
		const payload = await payloadDeTest()
		const comptesDeLAdresse = () => payload.count({ collection: 'pros', where: { email: { equals: email } } })
		expect((await comptesDeLAdresse()).totalDocs).toBe(1)

		await sInscrire(page, email, 'Autre Personne')

		// The same wall as for a new address, no message about the address, no second account.
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		await expect(page.getByRole('heading', { name: 'Vérifie ton adresse email My Makeup' })).toBeVisible()
		expect((await comptesDeLAdresse()).totalDocs).toBe(1)
		expect((await payload.count({ collection: 'pros', where: { nom: { equals: 'Autre Personne' } } })).totalDocs).toBe(
			0
		)
		await expect
			.poll(async () => (await mailsRecus(email)).map(({ sujet }) => sujet).filter(s => s.includes('déjà un compte')))
			.toHaveLength(1)
	})
})

test.describe('E04 : renvoyer l’email de confirmation depuis le mur', () => {
	async function ouvrirLeMur(page: Page) {
		await page.goto('/auth/verification-wall')
		await page.waitForLoadState('networkidle')
	}
	async function demander(page: Page, email: string) {
		await page.getByLabel('Adresse email de ton inscription').fill(email)
		const bouton = page.getByRole('button', { name: 'Renvoyer l’email de confirmation' })
		// Wait for the answer itself: the text of an earlier answer would pass the next check.
		await Promise.all([
			page.waitForResponse(
				reponse => reponse.request().method() === 'POST' && reponse.url().includes('verification-wall')
			),
			bouton.click(),
		])
		await expect(bouton).toBeEnabled()
	}

	test('un renvoi repart avec le même lien, le suivant dans la minute est refusé ; une adresse inconnue reçoit la même réponse qu’une adresse connue', async ({
		page,
	}) => {
		const email = adresse()
		await sInscrire(page, email)
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		await lienDuMail(email)

		// The first resending leaves at once, with the very link of the sign-up mail; a second one within
		// the minute is refused, in French.
		await demander(page, email)
		await expect(page.getByTestId('retour-renvoi')).toContainText('un email vient de repartir')
		await expect.poll(async () => (await mailsRecus(email)).length).toBe(2)
		const liens = (await mailsRecus(email)).map(({ liens }) =>
			liens.find(l => l.includes('/auth/verification-complete'))
		)
		expect(new Set(liens).size).toBe(1)
		await expect(page.getByLabel('Adresse email de ton inscription')).toHaveValue(email)
		await demander(page, email)
		await expect(page.getByTestId('retour-renvoi')).toContainText('Un seul email par minute')

		// An address with no account: the same answer as a real one, and nothing leaves.
		const inconnue = adresse()
		await ouvrirLeMur(page)
		await demander(page, inconnue)
		await expect(page.getByTestId('retour-renvoi')).toContainText('un email vient de repartir')
		await demander(page, inconnue)
		await expect(page.getByTestId('retour-renvoi')).toContainText('Un seul email par minute')
		expect(await mailsRecus(inconnue)).toEqual([])
	})

	test('une adresse mal écrite est dite telle', async ({ page }) => {
		await ouvrirLeMur(page)
		await demander(page, 'pas-une-adresse')
		await expect(page.getByTestId('retour-renvoi')).toContainText('Cette adresse email n’est pas valide.')
	})

	test('le frein par adresse cliente : la onzième demande de l’heure est refusée, quelle que soit la boîte', async ({
		page,
	}) => {
		test.setTimeout(120_000)
		await ouvrirLeMur(page)
		for (let i = 0; i < 10; i++) {
			await demander(page, adresse())
			await expect(page.getByTestId('retour-renvoi')).toContainText('un email vient de repartir')
		}

		await demander(page, adresse())

		await expect(page.getByTestId('retour-renvoi')).toContainText('Trop de demandes depuis cette adresse')
	})
})

test.describe('Contre les faux comptes (ticket 084)', () => {
	test('un champ piège rempli : l’écran de réussite, aucun compte, aucun email, un refus au journal', async ({
		page,
	}) => {
		const email = adresse()
		const payload = await payloadDeTest()
		const lignes = async () =>
			(
				await payload.find({
					collection: 'auth-evenements',
					depth: 0,
					limit: 1000,
					where: { code: { equals: 'champ-piege' } },
				})
			).totalDocs
		const avant = await lignes()
		await page.goto('/auth/signup')
		await page.waitForLoadState('networkidle')
		await page.getByLabel('Nom', { exact: true }).fill('Script Fictif')
		await page.getByLabel('Adresse email').fill(email)
		await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
		await page.getByLabel('J’accepte les conditions générales').check()
		// A script fills everything it finds; a person never sees this field.
		await page.locator('input[name="commentaire"]').fill('http://spam.example.test', { force: true })

		await page.getByRole('button', { name: 'S’inscrire' }).click()

		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		expect((await payload.count({ collection: 'pros', where: { email: { equals: email } } })).totalDocs).toBe(0)
		expect(await mailsRecus(email)).toEqual([])
		expect(await lignes()).toBe(avant + 1)
	})

	test('le champ piège ne se voit pas et n’est pas dans l’ordre du clavier', async ({ page }) => {
		await page.goto('/auth/signup')
		const piege = page.locator('input[name="commentaire"]')
		await expect(piege).toHaveAttribute('tabindex', '-1')
		await expect(piege).not.toBeInViewport()
	})

	test('la sixième inscription de l’heure depuis la même adresse est refusée, en français ; une autre adresse passe', async ({
		browser,
	}) => {
		test.setTimeout(120_000)
		const adresseCliente = nouvelleAdresse(test.info().workerIndex)
		const contexte = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': adresseCliente } })
		const page = await contexte.newPage()
		for (let i = 0; i < 5; i++) {
			await sInscrire(page, adresse())
			await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		}

		await sInscrire(page, adresse())

		await expect(page.getByTestId('erreur-inscription')).toContainText('Trop d’inscriptions depuis cette adresse')
		await expect(page).toHaveURL(/\/auth\/signup$/)
		await contexte.close()

		const autre = await browser.newContext({
			extraHTTPHeaders: { 'x-forwarded-for': nouvelleAdresse(test.info().workerIndex) },
		})
		const page2 = await autre.newPage()
		await sInscrire(page2, adresse())
		await expect(page2).toHaveURL(/\/auth\/verification-wall$/)
		await autre.close()
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
