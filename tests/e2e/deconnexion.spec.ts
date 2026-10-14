import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The sign-out (ticket 078; plan 02 E10, E11, E17) and the signed-in state of the navigation: the
 * session is removed from the database, the cookie goes, the Back button does not bring the space
 * back, an old cookie opens nothing, another tab is sent to the sign-in page at its next
 * navigation, and the public pages stay in the cache.
 */

const MOT_DE_PASSE = 'motdepasse-fictif'
let compteur = 0
const adresse = () => `192.0.2.${100 + (++compteur % 100)}`
test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': adresse() }))

async function seConnecter(page: Page, email: string) {
	await page.goto('/auth/signin')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
	await page.getByRole('button', { name: 'Se connecter' }).click()
	await expect(page).toHaveURL(/\/auth\/profil$/)
}

const cookieDeSession = async (context: BrowserContext) =>
	(await context.cookies()).find(({ name }) => name === 'payload-token')

async function contexteAvec(browser: Browser, cookie: NonNullable<Awaited<ReturnType<typeof cookieDeSession>>>) {
	const contexte = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': adresse() } })
	await contexte.addCookies([cookie])
	return contexte
}

test.describe('E10 : la déconnexion', { tag: '@mobile' }, () => {
	test('plus aucun cookie de session, une page qui existe, et Retour n’affiche pas l’espace', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await seConnecter(page, compte.email)
		expect(await cookieDeSession(context)).toBeDefined()

		await page.getByRole('button', { name: 'Me déconnecter', exact: true }).click()

		await expect(page).toHaveURL(/\/$/)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		expect(await cookieDeSession(context)).toBeUndefined()
		expect((await context.cookies()).filter(({ name }) => /token|next-auth/i.test(name))).toEqual([])

		await page.goBack()
		await expect(page).toHaveURL(/\/auth\/signin/)
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
	})

	test('la déconnexion laisse une ligne « deconnexion » au journal', async ({ page }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await payloadDeTest()
		// The rows belong to nobody, and the other tests sign out at the same time: the exact count of
		// one sign-out is the integration test's (tests/integration/auth-deconnexion.test.ts).
		const depuis = new Date().toISOString()
		const compter = async () =>
			(
				await payload.count({
					collection: 'auth-evenements',
					where: { and: [{ type: { equals: 'deconnexion' } }, { date: { greater_than_equal: depuis } }] },
				})
			).totalDocs
		await seConnecter(page, compte.email)

		await page.getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		await expect.poll(compter).toBeGreaterThanOrEqual(1)
	})
})

test.describe('E11 : l’ancien cookie réinjecté', () => {
	test('dans un contexte neuf, il est refusé : on arrive sur la connexion', async ({ browser, context, page }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await seConnecter(page, compte.email)
		const ancien = await cookieDeSession(context)
		if (!ancien) throw new Error('Pas de cookie de session après la connexion.')
		// The control: before the sign-out, the same cookie opens the space in a fresh context.
		const avant = await contexteAvec(browser, ancien)
		const pageAvant = await avant.newPage()
		await pageAvant.goto('/auth/profil')
		await expect(pageAvant.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
		await avant.close()

		await page.getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		const apres = await contexteAvec(browser, ancien)
		const pageApres = await apres.newPage()
		await pageApres.goto('/auth/profil')
		await expect(pageApres).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await expect(pageApres.getByRole('button', { name: 'Se connecter' })).toBeVisible()
		await apres.close()
	})
})

test.describe('E17 : la déconnexion dans un onglet', () => {
	test('l’autre onglet est renvoyé à la connexion à sa prochaine navigation', async ({ context, page }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await seConnecter(page, compte.email)
		const onglet = await context.newPage()
		await onglet.goto('/auth/profil')
		await expect(onglet.getByRole('heading', { name: 'Mon espace' })).toBeVisible()

		await page.getByRole('button', { name: 'Me déconnecter', exact: true }).click()
		await expect(page).toHaveURL(/\/$/)

		await onglet.goto('/auth/profil')
		await expect(onglet).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
	})
})

test.describe('Me déconnecter de tous les appareils', () => {
	test('après confirmation seulement ; l’autre appareil du même compte est fermé aussi', async ({
		browser,
		context,
		page,
	}) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await seConnecter(page, compte.email)
		const autreAppareil = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': adresse() } })
		const autre = await autreAppareil.newPage()
		await seConnecter(autre, compte.email)

		await page.getByRole('button', { name: 'Me déconnecter de tous les appareils' }).click()
		await expect(page.getByText('Tu seras déconnectée de tous tes appareils')).toBeVisible()
		// Cancelled: nothing is closed.
		await page.getByRole('button', { name: 'Annuler' }).click()
		await expect(page.getByText('Tu seras déconnectée de tous tes appareils')).toHaveCount(0)
		await autre.goto('/auth/profil')
		await expect(autre.getByRole('heading', { name: 'Mon espace' })).toBeVisible()

		await page.getByRole('button', { name: 'Me déconnecter de tous les appareils' }).click()
		await page.getByRole('button', { name: 'Oui, me déconnecter partout' }).click()

		await expect(page).toHaveURL(/\/$/)
		expect(await cookieDeSession(context)).toBeUndefined()
		await autre.goto('/auth/profil')
		await expect(autre).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil$/)
		await autreAppareil.close()
	})

	test('une action sans la confirmation ne ferme rien', async ({ page, request }) => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		await seConnecter(page, compte.email)
		await page.getByRole('button', { name: 'Me déconnecter de tous les appareils' }).click()
		// The confirmation field is the page's: take it out, and send the form.
		await page.locator('input[name="confirmation"]').evaluate(champ => champ.remove())
		await page.getByRole('button', { name: 'Oui, me déconnecter partout' }).click()

		await expect(page).toHaveURL(/\/auth\/profil$/)
		const reponse = await request.get('/api/espace/session')
		expect(reponse.status()).toBe(200)
		await page.reload()
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
	})
})

test.describe('La Nav lit l’état connecté dans le navigateur', () => {
	test('« Me connecter » sans session ; « Mon espace » et « Me déconnecter » avec une session', async ({
		context,
		page,
	}) => {
		await page.goto('/')
		const nav = page.getByRole('navigation', { name: 'Navigation principale' })
		await expect(nav.getByRole('link', { name: 'Me connecter' })).toBeVisible()
		await expect(nav.getByRole('link', { name: 'Mon espace' })).toHaveCount(0)

		const compte = await creerCompte('maquilleuse')
		await context.addCookies(compte.session.cookies)
		await page.goto('/')

		await expect(nav.getByRole('link', { name: 'Mon espace' })).toBeVisible()
		await expect(nav.getByRole('button', { name: 'Me déconnecter' })).toBeVisible()
		await expect(nav.getByRole('link', { name: 'Me connecter' })).toHaveCount(0)
	})

	test('la session d’un admin ne change pas la Nav', async ({ context, page }) => {
		const admin = await creerCompte('admin')
		await context.addCookies(admin.session.cookies)

		await page.goto('/')

		await expect(
			page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Me connecter' })
		).toBeVisible()
	})

	test('une page publique garde les mêmes en-têtes de cache et le même contenu, avec ou sans cookie', async ({
		playwright,
		baseURL,
	}) => {
		const compte = await creerCompte('maquilleuse')
		const cookie = compte.session.enTetes.Cookie
		const lire = async (entetes: Record<string, string>) => {
			const client = await playwright.request.newContext({ baseURL: baseURL ?? '', extraHTTPHeaders: entetes })
			try {
				const reponse = await client.get('/')
				return { statut: reponse.status(), cache: reponse.headers()['cache-control'], corps: await reponse.text() }
			} finally {
				await client.dispose()
			}
		}

		const anonyme = await lire({})
		const connectee = await lire({ Cookie: cookie, Origin: baseURL ?? '' })

		expect(anonyme.statut).toBe(200)
		expect(anonyme.cache ?? '').not.toMatch(/no-store|private/)
		expect(connectee.cache).toBe(anonyme.cache)
		expect(connectee.corps).toBe(anonyme.corps)
	})

	test('la route de l’état ne répond qu’un booléen, jamais en cache', async ({ playwright, baseURL }) => {
		const compte = await creerCompte('maquilleuse')
		const client = await playwright.request.newContext({
			baseURL: baseURL ?? '',
			extraHTTPHeaders: { Cookie: compte.session.enTetes.Cookie, Origin: baseURL ?? '' },
		})
		try {
			const reponse = await client.get('/api/espace/session')
			expect(reponse.headers()['cache-control']).toBe('private, no-store')
			expect(await reponse.json()).toEqual({ connectee: true })
			const sans = await playwright.request.newContext({ baseURL: baseURL ?? '' })
			expect(await (await sans.get('/api/espace/session')).json()).toEqual({ connectee: false })
			await sans.dispose()
		} finally {
			await client.dispose()
		}
	})
})
