import { expect, type Page, test } from '@playwright/test'
import { COOKIE_SURVIVAL_AFTER_END_S, readExpiration } from '../../src/lib/auth/session-state'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'
import { ouvrirSessionSansMotDePasse } from '../outils/session'

/**
 * The session that ended (ticket 080; plan 02 E12, E13): one redirection, the message « session
 * expirée », the way back, and nothing to loop on.
 */

const MOT_DE_PASSE = 'motdepasse-fictif'
const MESSAGE = 'Ta session a expiré, reconnecte-toi.'
let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++compteur % 80)}` })
)

/** The cookie of a session whose token ends `dureeS` seconds from now, with the end date the site gives its cookie (it outlives the token). */
async function cookieDeSession(compte: Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>, dureeS: number) {
	const payload = await payloadDeTest()
	const session = await ouvrirSessionSansMotDePasse(payload, { collection: 'pros', id: compte.id }, process.env, {
		dureeS,
	})
	const cookie = session.cookies[0]
	if (!cookie) throw new Error('pas de cookie')
	return cookie
}

/**
 * The pages a navigation was redirected away from. A set of addresses, not a count of answers:
 * Chromium replays a request once when a site first asks for a client hint (Critical-CH), and
 * Playwright reports that replay as a redirection to the same address: it is not one, and the
 * same redirection would be counted twice.
 */
function suivreLesRedirections(page: Page): Set<string> {
	const depart = new Set<string>()
	page.on('response', reponse => {
		if (reponse.request().resourceType() !== 'document' || reponse.status() < 300 || reponse.status() >= 400) return
		const vers = new URL(reponse.headers().location ?? '', reponse.url())
		if (vers.href !== reponse.url()) depart.add(new URL(reponse.url()).pathname)
	})
	return depart
}

test.describe('E12 : un jeton expiré', { tag: '@mobile' }, () => {
	test('une seule redirection vers la connexion, avec le message et la page de retour, puis le formulaire', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await context.addCookies([await cookieDeSession(compte, -60)])
		const redirections = suivreLesRedirections(page)

		await page.goto('/auth/profil')

		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil&error=session-expiree$/)
		await expect(page.getByTestId('session-expiree')).toHaveText(MESSAGE)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		expect([...redirections]).toEqual(['/auth/profil'])
		// The form does not send her anywhere on account of the dead cookie: reloading stays on it.
		await page.reload()
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil&error=session-expiree$/)
		expect([...redirections]).toEqual(['/auth/profil'])
	})

	test('la réponse brute : un 307 vers la connexion, et la connexion répond 200', async ({ playwright, baseURL }) => {
		const compte = await creerCompte('maquilleuse')
		const jeton = (await cookieDeSession(compte, -60)).value
		const client = await playwright.request.newContext({
			baseURL,
			extraHTTPHeaders: { cookie: `payload-token=${jeton}`, 'x-forwarded-for': '192.0.2.250' },
		})

		const reponse = await client.get('/auth/profil?onglet=photos', { maxRedirects: 0 })

		expect(reponse.status()).toBe(307)
		expect(reponse.headers().location).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fonglet%3Dphotos&error=session-expiree'
		)
		const suite = await client.get('/auth/signin?callbackUrl=%2Fauth%2Fprofil&error=session-expiree', {
			maxRedirects: 0,
		})
		expect(suite.status()).toBe(200)
		await client.dispose()
	})

	test('après la reconnexion, la page voulue s’ouvre', async ({ page, context }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await context.addCookies([await cookieDeSession(compte, -60)])

		await page.goto('/auth/profil?onglet=photos')
		await expect(page.getByTestId('session-expiree')).toHaveText(MESSAGE)
		await page.getByLabel('Adresse email').fill(compte.email)
		await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
		await page.getByRole('button', { name: 'Se connecter' }).click()

		await expect(page).toHaveURL(/\/auth\/profil\?onglet=photos$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
		// One valid cookie, the old one replaced.
		expect((await context.cookies()).map(c => c.name)).toEqual(['payload-token'])
	})

	test('un code inconnu dans l’adresse n’est jamais recopié, ni en texte ni en balise', async ({ page }) => {
		const piege = encodeURIComponent('<b>Ton compte est piraté</b> appelle le 0 800 000 000')
		await page.goto(`/auth/signin?error=${piege}`)

		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await expect(page.getByTestId('session-expiree')).toHaveCount(0)
		// What is on the screen: Next's own page data repeats the address, but nothing of it is displayed or built into the page.
		const texte = await page.innerText('body')
		expect(texte).not.toContain('piraté')
		expect(texte).not.toContain('0 800')
		await expect(page.locator('main b')).toHaveCount(0)
		// The known code, and only it, speaks.
		await page.goto('/auth/signin?error=OAuthCallback')
		await expect(page.getByTestId('session-expiree')).toHaveCount(0)
		await page.goto('/auth/signin?error=session-expiree')
		await expect(page.getByTestId('session-expiree')).toHaveText(MESSAGE)
	})
})

test.describe('E13 : une expiration réelle', () => {
	test('une session courte tient, puis finit d’elle-même : le même renvoi, le même message', {
		tag: '@lent',
	}, async ({ context, page }) => {
		test.setTimeout(60_000)
		const compte = await creerCompte('maquilleuse')
		await context.addCookies([await cookieDeSession(compte, 8)])
		// A visit to the space renews a session that has less than 7 days left (ticket 079): this one must
		// run out by itself, so the renewal is cut off.
		await page.route('**/api/pros/refresh-token', route => route.abort())
		const redirections = suivreLesRedirections(page)

		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
		expect([...redirections]).toEqual([])

		// The clock does the rest: no cookie was touched between the visits. Wait on the state, not on a duration.
		await expect
			.poll(
				async () => {
					await page.goto('/auth/profil')
					return page.url()
				},
				{ intervals: [1000], timeout: 30_000 }
			)
			.toMatch(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil&error=session-expiree$/)
		// The browser still holds the cookie the site set: it outlives its token, which is why the server can tell.
		expect((await context.cookies()).map(c => c.name)).toEqual(['payload-token'])
		await expect(page.getByTestId('session-expiree')).toHaveText(MESSAGE)
		expect([...redirections]).toEqual(['/auth/profil'])
	})
})

test.describe('le cookie posé par la connexion', () => {
	test('survit à son jeton : sans cela, le navigateur l’oublierait à la seconde où il expire', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(compte.email)
		await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
		await page.getByRole('button', { name: 'Se connecter' }).click()
		await expect(page).toHaveURL(/\/auth\/profil$/)

		const cookie = (await context.cookies()).find(c => c.name === 'payload-token')
		if (!cookie) throw new Error('pas de cookie de session')
		const finDuJeton = readExpiration(cookie.value)
		if (finDuJeton === null) throw new Error('jeton illisible')
		// 90 days of grace, give or take the clock of the browser.
		expect(cookie.expires - finDuJeton).toBeGreaterThan(COOKIE_SURVIVAL_AFTER_END_S - 60)
	})
})
