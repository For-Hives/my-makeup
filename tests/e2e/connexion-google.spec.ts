import { expect, type Page, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'
import { fauxGoogle } from '../outils/faux-google'
import { mailsRecus } from '../outils/mailpit'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The Google sign-in and sign-up in a browser (tickets 090 and 091; plan 02 E07), against the fake
 * Google of the bench: a click on the button, the consent screen of the provider, the return, the
 * session cookie. The rules behind it (who is found, who is refused, what is written) are played by
 * tests/integration/auth-google.test.ts.
 */

// Built when a test runs, not when Playwright lists the tests: listing needs no bench.
const google = {
	choisir: (...args: Parameters<ReturnType<typeof fauxGoogle>['choisir']>) => fauxGoogle().choisir(...args),
	autoriser: (...args: Parameters<ReturnType<typeof fauxGoogle>['autoriser']>) => fauxGoogle().autoriser(...args),
}
const cookieDeSession = async (context: import('@playwright/test').BrowserContext) =>
	(await context.cookies()).find(({ name }) => name === 'payload-token')

// Each test comes from an address of its own: the return from Google is braked by address (ticket 223), and
// the failed returns of the whole file, in both projects, would otherwise add up on the one address of the bench.
let compteur = 0
let client = ''
test.beforeEach(({ context }) => {
	client = `192.0.2.${20 + (++compteur % 200)}`
	return context.setExtraHTTPHeaders({ 'x-forwarded-for': client })
})

const adresse = (prefixe: string) => `${prefixe}-${crypto.randomUUID().slice(0, 8)}@example.test`

/** Tells the fake Google who signs in, the way the provider reads it: a cookie of its own. */
async function choisir(
	context: import('@playwright/test').BrowserContext,
	demande: Parameters<typeof google.choisir>[0]
) {
	await context.clearCookies({ name: 'faux_google_choix' })
	await context.addCookies(google.choisir(demande).cookies)
}

async function cliquerSurGoogle(page: Page, depart: string, libelle: string) {
	await page.goto(depart)
	await page.getByRole('link', { name: libelle }).click()
}

test.describe('E07 : connexion et inscription avec Google', { tag: '@mobile' }, () => {
	test('l’ancien compte Google se connecte, retrouve son espace, et la déconnexion ferme la session', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('reprise-google')
		await choisir(context, { email: compte.email })

		await page.goto('/auth/signin')
		await page.screenshot({ path: `test-results/essais/connexion-google-signin-${test.info().project.name}.png` })
		await page.getByRole('link', { name: 'Se connecter avec Google' }).click()

		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
		const cookie = await cookieDeSession(context)
		expect(cookie).toMatchObject({ httpOnly: true, path: '/', sameSite: 'Lax' })
		// The cookie of the departure is spent.
		expect((await context.cookies()).map(c => c.name)).not.toContain('google-oidc')
		const payload = await payloadDeTest()
		expect(
			(await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: compte.email } } })).totalDocs
		).toBe(1)

		await page.getByRole('main').getByRole('button', { name: 'Me déconnecter', exact: true }).click()

		await expect(page).toHaveURL(/\/$/)
		expect(await cookieDeSession(context)).toBeUndefined()
		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin/)
		// Only the mails of this person: the catcher is shared with the tests that run at the same time.
		expect(await mailsRecus(compte.email)).toEqual([])
	})

	test('la page demandée avant la connexion est celle où l’on arrive', async ({ context, page }) => {
		const compte = await creerCompte('reprise-google')
		await choisir(context, { email: compte.email })

		await page.goto('/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fvue%3Dessai')
		await page.getByRole('link', { name: 'Se connecter avec Google' }).click()

		await expect(page).toHaveURL(/\/auth\/profil\?vue=essai$/)
	})

	test('une adresse de retour d’un autre site est ignorée', async ({ context, page }) => {
		const compte = await creerCompte('reprise-google')
		await choisir(context, { email: compte.email })

		await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent('https://autre.example.test/piege')}`)
		await page.getByRole('link', { name: 'Se connecter avec Google' }).click()

		await expect(page).toHaveURL(/\/auth\/profil$/)
	})

	test('une nouvelle identité s’inscrit : compte, profil, onboarding, aucun mail ; le second passage est une connexion', async ({
		context,
		page,
	}) => {
		test.setTimeout(60_000)
		const email = adresse('google-neuve')
		await choisir(context, { email, prenom: 'Léa', nomDeFamille: 'Fictive' })

		await page.goto('/auth/signup')
		await page.screenshot({ path: `test-results/essais/connexion-google-signup-${test.info().project.name}.png` })
		await page.getByRole('link', { name: 'S’inscrire avec Google' }).click()

		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Prépare ton profil' })).toBeVisible()
		const payload = await payloadDeTest()
		const comptes = await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })
		expect(comptes.docs).toHaveLength(1)
		expect(comptes.docs[0]).toMatchObject({ name: 'Léa Fictive', _verified: true })
		const profils = await payload.find({
			collection: 'profiles',
			depth: 0,
			where: { pro: { equals: comptes.docs[0]?.id } },
		})
		expect(profils.docs.map(p => p.slug)).toEqual([expect.stringMatching(/^lea-fictive(-\d+)?$/)])
		expect(await mailsRecus(email)).toEqual([])

		await page.goto('/auth/profil')
		await page.getByRole('main').getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		await cliquerSurGoogle(page, '/auth/signup', 'S’inscrire avec Google')
		await expect(page).toHaveURL(/\/auth\/profil$/)
		expect((await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })).totalDocs).toBe(
			1
		)
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: comptes.docs[0]?.id } } }))
				.totalDocs
		).toBe(1)
		expect(await mailsRecus(email)).toEqual([])
	})

	test('un email que Google n’a pas vérifié : un message en français, aucun compte, aucune session', async ({
		context,
		page,
	}) => {
		const email = adresse('google-non-verifie')
		await choisir(context, { scenario: 'email-non-verifie', email })

		await cliquerSurGoogle(page, '/auth/signup', 'S’inscrire avec Google')

		await expect(page).toHaveURL(/\/auth\/signin\?error=google-email-non-verifie$/)
		await expect(page.getByTestId('erreur-google')).toContainText('Google n’a pas confirmé ton adresse email')
		expect(await cookieDeSession(context)).toBeUndefined()
		const payload = await payloadDeTest()
		expect((await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })).totalDocs).toBe(
			0
		)
	})

	test('un compte à mot de passe n’est pas ouvert par Google', async ({ context, page }) => {
		const compte = await creerCompte('maquilleuse')
		await choisir(context, { email: compte.email })

		await cliquerSurGoogle(page, '/auth/signin', 'Se connecter avec Google')

		await expect(page).toHaveURL(/\/auth\/signin\?error=email-deja-avec-mot-de-passe$/)
		const message = page.getByTestId('erreur-google')
		await expect(message).toContainText('a déjà un compte avec un mot de passe')
		// The address is never copied to the screen.
		await expect(message).not.toContainText(compte.email)
		expect(await cookieDeSession(context)).toBeUndefined()
	})

	test('un compte Google bloqué lit le message du compte bloqué', async ({ context, page }) => {
		const compte = await creerCompte('reprise-google')
		const payload = await payloadDeTest()
		await payload.update({ collection: 'pros', id: compte.id, data: { blocked: true }, overrideAccess: true })
		await choisir(context, { email: compte.email })

		await cliquerSurGoogle(page, '/auth/signin', 'Se connecter avec Google')

		await expect(page).toHaveURL(/\/auth\/signin\?error=compte-bloque$/)
		await expect(page.getByTestId('erreur-google')).toContainText('Ce compte est bloqué')
		expect(await cookieDeSession(context)).toBeUndefined()
	})

	test('refus et panne de Google : le formulaire revient avec un message, jamais une page cassée', async ({
		context,
		page,
	}) => {
		const attendu = {
			refus: { code: 'google-annule', texte: 'Tu as annulé la connexion avec Google' },
			panne: { code: 'google-indisponible', texte: 'Google ne répond pas pour le moment' },
		} as const
		for (const scenario of ['refus', 'panne'] as const) {
			await choisir(context, { scenario, email: adresse(`google-${scenario}`) })
			await cliquerSurGoogle(page, '/auth/signin', 'Se connecter avec Google')
			await expect(page).toHaveURL(new RegExp(`/auth/signin\\?error=${attendu[scenario].code}$`))
			await expect(page.getByTestId('erreur-google')).toContainText(attendu[scenario].texte)
			await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
			expect(await cookieDeSession(context)).toBeUndefined()
		}
	})

	test('un retour forgé ou d’une autre origine est refusé : sans le cookie, ou avec un autre state', async ({
		request,
	}) => {
		const compte = await creerCompte('reprise-google')
		// 1. A return nobody asked for: no cookie of the departure.
		const sansCookie = await request.get('/auth/google/callback?code=code-forge&state=state-forge', {
			maxRedirects: 0,
			headers: { 'x-forwarded-for': client },
		})
		expect(sansCookie.status()).toBe(307)
		expect(
			new URL(sansCookie.headers().location ?? '').pathname + new URL(sansCookie.headers().location ?? '').search
		).toBe('/auth/signin?error=google-echec')
		expect(sansCookie.headers()['set-cookie'] ?? '').not.toContain('payload-token=')
		// The old return address is gone: an ordinary 404, no redirect (an OAuth return address must be exact).
		const ancienne = await request.get('/auth/google/retour?code=code-forge&state=state-forge', {
			maxRedirects: 0,
			headers: { 'x-forwarded-for': client },
		})
		expect(ancienne.status()).toBe(404)

		// 2. The departure is real, the return carries another state: refused. With its own state, it opens.
		const depart = await request.get('/auth/google', { maxRedirects: 0, headers: { 'x-forwarded-for': client } })
		expect(depart.status()).toBe(307)
		const cookie = /google-oidc=([^;]+)/.exec(depart.headers()['set-cookie'] ?? '')?.[1] ?? ''
		expect(cookie).not.toBe('')
		const retour = await google.autoriser(depart.headers().location ?? '', google.choisir({ email: compte.email }))
		const avecState = (state: string) => {
			const url = new URL(retour)
			url.searchParams.set('state', state)
			return `${url.pathname}${url.search}`
		}
		const faux = await request.get(avecState('state-change'), {
			maxRedirects: 0,
			headers: { Cookie: `google-oidc=${cookie}`, 'x-forwarded-for': client },
		})
		expect(faux.status()).toBe(307)
		const versLeFormulaire = new URL(faux.headers().location ?? '')
		expect(versLeFormulaire.pathname + versLeFormulaire.search).toBe('/auth/signin?error=google-echec')
		expect(faux.headers()['set-cookie'] ?? '').not.toContain('payload-token=')
		const juste = await request.get(avecState(retour.searchParams.get('state') ?? ''), {
			maxRedirects: 0,
			headers: { Cookie: `google-oidc=${cookie}`, 'x-forwarded-for': client },
		})
		expect(juste.status()).toBe(200)
		expect(juste.headers()['set-cookie'] ?? '').toContain('payload-token=')
		expect(await juste.text()).toContain('url=/auth/profil')
	})
})
