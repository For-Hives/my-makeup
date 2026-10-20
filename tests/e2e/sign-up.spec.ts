import { expect, type Page, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'
import { mailReceived, waitMail } from '../support/mailpit'
import { testPayload } from '../support/payload-test'

/**
 * The sign-up (ticket 082; plan 02 E01, adapted): she signs up, the wall tells her to look in her
 * mailbox, the link of the mail confirms the account, she signs in and arrives in the onboarding.
 * Before the link, the account does not sign in, and says why.
 */

const PASSWORD = 'motdepasse-fictif'
let counter = 0
// One address for each test, and none shared between the workers: the sign-up is braked at 5 an hour
// by client address (ticket 084), and the bench application sees every browser under the same one.
const newUrl = (travailleur: number) => `198.51.${100 + travailleur}.${++counter % 250}`
test.beforeEach(({ context }, info) => context.setExtraHTTPHeaders({ 'x-forwarded-for': newUrl(info.workerIndex) }))

const url = () => `inscrite-${crypto.randomUUID()}@example.test`

async function signUpAction(page: Page, email: string, nom = 'Léa Fictive') {
	await page.goto('/auth/signup')
	// A click before the page has hydrated sends nothing: the form is only a placeholder until then.
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Nom', { exact: true }).fill(nom)
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(PASSWORD)
	await page.getByLabel('J’accepte les conditions générales').check()
	await page.getByRole('button', { name: 'S’inscrire' }).click()
}

async function signInAction(page: Page, email: string, retour?: string) {
	await page.goto(retour ? `/auth/signin?callbackUrl=${encodeURIComponent(retour)}` : '/auth/signin')
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(PASSWORD)
	await page.getByRole('button', { name: 'Se connecter' }).click()
}

const randomInLetters = () =>
	crypto
		.randomUUID()
		.replace(/-/g, '')
		.replace(/[0-9]/g, chiffre => 'ghijklmnop'.charAt(Number(chiffre)))

/** An account made by the server, as the sign-up would, without the mail and without taking a place in the brakes. */
async function createAccount(email: string, options: { confirme: boolean }) {
	const payload = await testPayload()
	await payload.create({
		collection: 'pros',
		// A name of its own: two accounts made at once with the same name would fight for the same slug.
		data: { email, password: PASSWORD, name: `Compte ${randomInLetters()}`, _verified: options.confirme },
		disableVerificationEmail: true,
		overrideAccess: true,
	})
}

const mailLink = async (email: string): Promise<string> => {
	const mail = await waitMail({ pour: email })
	const link = mail.liens.find(l => l.includes('/auth/verification-complete'))
	if (!link) throw new Error('Le mail ne porte pas le lien de confirmation.')
	return link
}

test.describe('E01 : inscription, mur, lien, connexion, onboarding', { tag: '@mobile' }, () => {
	test('le parcours entier', async ({ page }) => {
		const email = url()

		await signUpAction(page, email)

		// The wall: look in the mailbox.
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		await expect(page.getByRole('heading', { name: 'Vérifie ton adresse email My Makeup' })).toBeVisible()
		// Signed out: the cookie of the session is not there.
		expect((await page.context().cookies()).some(({ name }) => name === 'payload-token')).toBe(false)

		// The link of the mail confirms the account.
		await page.goto(await mailLink(email))
		await expect(page.getByRole('heading', { name: /Ton compte My Makeup est maintenant activé/ })).toBeVisible()

		// Sign in from the page: she lands in the onboarding.
		await page.getByRole('link', { name: 'Se connecter' }).click()
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Finit-account$/)
		await signInAction(page, email, '/auth/init-account')
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Prépare ton profil' })).toBeVisible()
		// Her profile and its address were made by the server, with the account.
		const payload = await testPayload()
		const account = (await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })).docs[0]
		const profile = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account?.id } } }))
			.docs[0]
		expect(profile?.slug).toMatch(/^lea-fictive(-\d+)?$/)
	})
})

test.describe('avant le lien', () => {
	test('la connexion dit que l’adresse n’est pas confirmée, avec le bon mot de passe seulement', async ({ page }) => {
		const email = url()
		await signUpAction(page, email)
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)

		await signInAction(page, email)
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
		const email = url()
		await signUpAction(page, email)
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		const link = await mailLink(email)

		await page.goto(link)
		await expect(page.getByRole('heading', { name: /maintenant activé/ })).toBeVisible()
		await page.goto(link)
		await expect(page.getByRole('heading', { name: 'Ton adresse email est déjà confirmée.' })).toBeVisible()
		await page.goto(link.slice(0, -5))
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
		const email = url()
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
		const email = url()
		await createAccount(email, { confirme: true })
		const payload = await testPayload()
		const urlAccounts = () => payload.count({ collection: 'pros', where: { email: { equals: email } } })
		expect((await urlAccounts()).totalDocs).toBe(1)

		await signUpAction(page, email, 'Autre Personne')

		// The same wall as for a new address, no message about the address, no second account.
		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		await expect(page.getByRole('heading', { name: 'Vérifie ton adresse email My Makeup' })).toBeVisible()
		expect((await urlAccounts()).totalDocs).toBe(1)
		expect((await payload.count({ collection: 'pros', where: { name: { equals: 'Autre Personne' } } })).totalDocs).toBe(
			0
		)
		await expect
			.poll(async () => (await mailReceived(email)).map(({ sujet }) => sujet).filter(s => s.includes('déjà un compte')))
			.toHaveLength(1)
	})

	test('E03 : une adresse dont le compte attend sa confirmation reçoit son lien de nouveau', async ({ page }) => {
		const email = url()
		await createAccount(email, { confirme: false })

		await signUpAction(page, email)

		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		await mailLink(email)
		expect((await mailReceived(email)).every(({ sujet }) => !sujet.includes('déjà un compte'))).toBe(true)
	})
})

test.describe('E04 : renvoyer l’email de confirmation depuis le mur', () => {
	async function openWall(page: Page) {
		await page.goto('/auth/verification-wall')
		await page.waitForLoadState('networkidle')
	}
	async function ask(page: Page, email: string) {
		await page.getByLabel('Adresse email de ton inscription').fill(email)
		const button = page.getByRole('button', { name: 'Renvoyer l’email de confirmation' })
		// Wait for the answer itself: the text of an earlier answer would pass the next check.
		await Promise.all([
			page.waitForResponse(
				reponse => reponse.request().method() === 'POST' && reponse.url().includes('verification-wall')
			),
			button.click(),
		])
		await expect(button).toBeEnabled()
	}

	test('un renvoi repart avec le lien du compte, le suivant dans la minute est refusé ; une adresse inconnue reçoit la même réponse qu’une adresse connue', async ({
		page,
	}) => {
		test.setTimeout(90_000)
		const email = url()
		await createAccount(email, { confirme: false })
		await openWall(page)

		// The first resending leaves at once, with the link of the account; a second one within the
		// minute is refused, in French.
		await ask(page, email)
		await expect(page.getByTestId('retour-renvoi')).toContainText('un email vient de repartir')
		await mailLink(email)
		await expect(page.getByLabel('Adresse email de ton inscription')).toHaveValue(email)
		await ask(page, email)
		await expect(page.getByTestId('retour-renvoi')).toContainText('Un seul email par minute')
		expect((await mailReceived(email)).length).toBe(1)

		// An address with no account: the same answer as a real one, and nothing leaves.
		const unknown = url()
		await openWall(page)
		await ask(page, unknown)
		await expect(page.getByTestId('retour-renvoi')).toContainText('un email vient de repartir')
		await ask(page, unknown)
		await expect(page.getByTestId('retour-renvoi')).toContainText('Un seul email par minute')
		expect(await mailReceived(unknown)).toEqual([])
	})

	test('le renvoi demandé juste après une inscription : la même réponse que l’adresse ait un compte ou non', async ({
		page,
	}) => {
		test.setTimeout(90_000)
		const fresh = url()
		const taken = url()
		await createAccount(taken, { confirme: true })
		const responses: string[] = []

		for (const email of [fresh, taken]) {
			await signUpAction(page, email)
			await expect(page).toHaveURL(/\/auth\/verification-wall$/)
			await page.waitForLoadState('networkidle')
			await ask(page, email)
			responses.push(((await page.getByTestId('retour-renvoi').textContent()) ?? '').trim())
		}

		expect(responses[0]).toContain('Un seul email par minute')
		expect(responses[1]).toBe(responses[0])
	})

	test('une adresse mal écrite est dite telle', async ({ page }) => {
		await openWall(page)
		await ask(page, 'pas-une-adresse')
		await expect(page.getByTestId('retour-renvoi')).toContainText('Cette adresse email n’est pas valide.')
	})

	test('le frein par adresse cliente : la onzième demande de l’heure est refusée, quelle que soit la boîte', async ({
		page,
	}) => {
		test.setTimeout(120_000)
		await openWall(page)
		for (let i = 0; i < 10; i++) {
			await ask(page, url())
			await expect(page.getByTestId('retour-renvoi')).toContainText('un email vient de repartir')
		}

		await ask(page, url())

		await expect(page.getByTestId('retour-renvoi')).toContainText('Trop de demandes depuis cette adresse')
	})
})

test.describe('Contre les faux comptes (ticket 084)', () => {
	test('un champ piège rempli : l’écran de réussite, aucun compte, aucun email, un refus au journal', async ({
		page,
	}) => {
		const email = url()
		const payload = await testPayload()
		const lines = async () =>
			(
				await payload.find({
					collection: 'auth-events',
					depth: 0,
					limit: 1000,
					where: { code: { equals: 'champ-piege' } },
				})
			).totalDocs
		const before = await lines()
		await page.goto('/auth/signup')
		await page.waitForLoadState('networkidle')
		await page.getByLabel('Nom', { exact: true }).fill('Script Fictif')
		await page.getByLabel('Adresse email').fill(email)
		await page.getByLabel('Mot de passe').fill(PASSWORD)
		await page.getByLabel('J’accepte les conditions générales').check()
		// A script fills everything it finds; a person never sees this field.
		await page.locator('input[name="commentaire"]').fill('http://spam.example.test', { force: true })

		await page.getByRole('button', { name: 'S’inscrire' }).click()

		await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		expect((await payload.count({ collection: 'pros', where: { email: { equals: email } } })).totalDocs).toBe(0)
		expect(await mailReceived(email)).toEqual([])
		expect(await lines()).toBe(before + 1)
	})

	test('le champ piège ne se voit pas et n’est pas dans l’ordre du clavier', async ({ page }) => {
		await page.goto('/auth/signup')
		const trap = page.locator('input[name="commentaire"]')
		await expect(trap).toHaveAttribute('tabindex', '-1')
		await expect(trap).not.toBeInViewport()
	})

	test('la sixième inscription de l’heure depuis la même adresse est refusée, en français ; une autre adresse passe', async ({
		browser,
	}) => {
		test.setTimeout(120_000)
		const clientUrl = newUrl(test.info().workerIndex)
		const browserContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': clientUrl } })
		const page = await browserContext.newPage()
		for (let i = 0; i < 5; i++) {
			await signUpAction(page, url())
			await expect(page).toHaveURL(/\/auth\/verification-wall$/)
		}

		const refusal = page.waitForResponse(
			reponse => reponse.request().method() === 'POST' && reponse.url().endsWith('/auth/signup')
		)
		await signUpAction(page, url())

		// A real 429 with a Retry-After, stopped by the proxy before the action; the form says it in French.
		const response = await refusal
		expect(response.status()).toBe(429)
		expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0)
		await expect(page.getByTestId('erreur-inscription')).toContainText('Trop d’inscriptions depuis cette adresse')
		await expect(page).toHaveURL(/\/auth\/signup$/)
		// The refusal leaves one row in the journal, and no account.
		const payload = await testPayload()
		expect(
			(
				await payload.count({
					collection: 'auth-events',
					where: { and: [{ type: { equals: 'sign-up' } }, { code: { equals: 'trop-de-tentatives' } }] },
				})
			).totalDocs
		).toBeGreaterThanOrEqual(1)
		await browserContext.close()

		const other = await browser.newContext({
			extraHTTPHeaders: { 'x-forwarded-for': newUrl(test.info().workerIndex) },
		})
		const page2 = await other.newPage()
		await signUpAction(page2, url())
		await expect(page2).toHaveURL(/\/auth\/verification-wall$/)
		await other.close()
	})
})

test.describe('Accessibilité des pages de l’inscription', { tag: '@mobile' }, () => {
	test('le formulaire, vide puis avec ses messages d’erreur, et le mur : aucune violation grave', async ({ page }) => {
		await page.goto('/auth/signup')
		expect(await violationsSevere(page)).toEqual([])

		await page.getByRole('button', { name: 'S’inscrire' }).click()
		await expect(page.getByTestId('erreur-nom')).toHaveText('Indique ton nom.')
		expect(await violationsSevere(page)).toEqual([])

		await page.goto('/auth/verification-wall')
		expect(await violationsSevere(page)).toEqual([])
	})
})

test.describe('les pages', () => {
	test('l’inscription, le mur et la confirmation répondent 200 sans session, en noindex, jamais en cache', async ({
		request,
	}) => {
		for (const path of ['/auth/signup', '/auth/verification-wall', '/auth/verification-complete']) {
			const response = await request.get(path, { maxRedirects: 0 })
			expect(response.status(), path).toBe(200)
			expect(response.headers()['x-robots-tag'], path).toContain('noindex')
			expect(response.headers()['cache-control'], path).toMatch(/no-store/)
		}
	})

	test('l’onboarding est fermé sans session : une redirection vers la connexion', async ({ request }) => {
		const response = await request.get('/auth/init-account', { maxRedirects: 0 })
		expect(response.status()).toBe(307)
	})

	test('la connexion mène à l’inscription et l’inscription à la connexion', async ({ page }) => {
		await page.goto('/auth/signin')
		await page.getByRole('link', { name: 'Inscris-toi' }).click()
		await expect(page).toHaveURL(/\/auth\/signup$/)
		await page.getByRole('link', { name: 'Connecte-toi' }).click()
		await expect(page).toHaveURL(/\/auth\/signin$/)
	})
})
