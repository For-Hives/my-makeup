// Shared helpers of the regression specs (espace.spec.mjs, mesure.spec.mjs):
// driving the fake Strapi (tests/regression/mock-api.mjs), signing in and
// signing up in the app. The specs share one fake Strapi: each resets it in
// its own beforeEach (reinitialiserStrapi).
import { expect } from '@playwright/test'
import { COMPTE_TEST } from './mock-api.mjs'

export const API = process.env.RG_API ?? 'http://127.0.0.1:4112'

// Never against the production: local hosts only
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(API).hostname))
	throw new Error(`API non locale refusée : ${API}`)

// --- the fake Strapi ---
export async function piloter(chemin, corps) {
	const reponse = await fetch(
		API + chemin,
		corps === undefined ? {} : { method: 'POST', body: JSON.stringify(corps) }
	)
	return reponse.json()
}
export const reinitialiserStrapi = () => piloter('/__reset', {})
export const etat = () => piloter('/__etat')
export const panne = corps => piloter('/__panne', corps)
// fields of the test account's profile, stored as the API would
export const profilDeDepart = champs => piloter('/__profil', champs)
export const profilServeur = async (id = COMPTE_TEST.id) =>
	(await etat()).profils[id]
export const appels = (journal, methode, chemin) =>
	journal.filter(entree => entree.m === methode && entree.p === chemin)

// --- sessions and pages ---
export async function connecter(
	page,
	{ email = COMPTE_TEST.email, password = COMPTE_TEST.password } = {}
) {
	const requete = page.context().request
	const { csrfToken } = await (await requete.get('/api/auth/csrf')).json()
	await requete.post('/api/auth/callback/credentials', {
		form: { csrfToken, email, password, json: 'true' },
	})
	const cookies = await page.context().cookies()
	return cookies.some(c => c.name.startsWith('next-auth.session-token'))
}

// Loads a page and waits for its hydration (SessionProvider asks for the
// session once React runs): a click before that would do nothing.
export async function aller(page, chemin) {
	const session = page.waitForResponse(r =>
		r.url().endsWith('/api/auth/session')
	)
	await page.goto(chemin)
	await session
}

export async function ouvrirProfil(page) {
	expect(await connecter(page)).toBe(true)
	await aller(page, '/auth/profil')
	await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
}

// a new account through /auth/signup, up to /auth/init-account
export async function inscrire(page, email = 'nouvelle@test.local') {
	await aller(page, '/auth/signup')
	await page.getByTestId('name').fill('nouvelle-compte')
	await page.getByTestId('email').fill(email)
	await page.getByTestId('password').fill('Test-1234')
	await page.getByTestId('submit').click()
	await expect(page).toHaveURL(/\/auth\/init-account/)
}
