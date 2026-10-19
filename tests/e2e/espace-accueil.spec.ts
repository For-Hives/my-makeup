import { expect, type Locator, type Page, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'
import { grandePhotoSynthetique } from '../outils/photo-synthetique'

/**
 * The onboarding in three steps (ticket 140; plan 02 E02, RG-07): a new account lands on the first
 * step, each step is saved before the next opens, a failure stays on the step with the typing, she
 * resumes at step 2 after leaving, a slow server never produces a false arrival, and an
 * account that came without a profile gets one. At 390 px (tap) as at 1440 px (click).
 *
 * The accounts these tests make are removed after each test: an active, published profile would
 * crowd the lists of the search specs. The brake of the sign-in counts by client address: each test
 * sends its own made-up address.
 */

const MOT_DE_PASSE = 'motdepasse-fictif'
const PAGE = '/auth/init-account'

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${100 + (++compteur % 100)}` })
)

const creees: string[] = []
test.afterEach(async () => {
	const payload = await payloadDeTest()
	for (const email of creees.splice(0)) {
		const { docs } = await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })
		for (const compte of docs) {
			const profils = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
			for (const { id } of profils.docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
			await payload.delete({ collection: 'pros', id: compte.id }).catch(() => undefined)
		}
	}
})

const aleatoireEnLettres = () =>
	crypto
		.randomUUID()
		.replace(/-/g, '')
		.replace(/[0-9]/g, chiffre => 'ghijklmnop'.charAt(Number(chiffre)))

/** A confirmed account made by the server, as the sign-up leaves it: with its empty profile. */
async function nouveauCompte(): Promise<string> {
	const email = `accueil-${crypto.randomUUID()}@example.test`
	const payload = await payloadDeTest()
	await payload.create({
		collection: 'pros',
		data: { email, password: MOT_DE_PASSE, name: `Accueil ${aleatoireEnLettres()}`, _verified: true },
		disableVerificationEmail: true,
		overrideAccess: true,
	})
	creees.push(email)
	return email
}

async function seConnecter(page: Page, email: string) {
	await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(PAGE)}`)
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
	await page.getByRole('button', { name: 'Se connecter' }).click()
	await expect(page).toHaveURL(new RegExp(`${PAGE}$`))
}

/** Axe reads the page once: wait for the title of the page, which Next streams after a transition. */
async function violationsApresLeTitre(page: Page) {
	await expect(page).toHaveTitle(/Prépare ton profil/)
	return violationsGraves(page)
}

/** A capture of the page as it is, when CAPTURES_ESPACE names a folder (the check of ticket 140 at 390 px). */
async function capturer(page: Page, nom: string) {
	const dossier = process.env.CAPTURES_ESPACE
	if (dossier)
		await page.screenshot({ path: `${dossier}/accueil-${nom}-${test.info().project.name}.png`, fullPage: true })
}

/** A finger on a phone, a click elsewhere. */
const appuyer = (cible: Locator) => (test.info().project.name === 'mobile' ? cible.tap() : cible.click())

const titre = (page: Page) => page.locator('#accueil-titre-etape')

async function profilDe(email: string) {
	const payload = await payloadDeTest()
	const compte = (await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })).docs[0]
	const profil = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte?.id } } }))
		.docs[0]
	if (!profil) throw new Error('pas de profil')
	return profil
}

async function remplirIdentite(page: Page) {
	await page.getByLabel('Prénom').fill('Léa')
	await page.getByLabel('Nom', { exact: true }).fill('Fictive')
	await page.getByLabel(/Spécialité/).fill('Maquillage mariée')
}

async function choisirLille(page: Page) {
	const champ = page.getByRole('combobox', { name: 'Ta commune' })
	await champ.fill('Lille')
	await appuyer(page.getByRole('option', { name: /^Lille \(59\)/ }).first())
}

async function choisirLaPhoto(page: Page) {
	const octets = await grandePhotoSynthetique()
	await page
		.getByLabel('Choisir une photo')
		.setInputFiles({ name: 'accueil.webp', mimeType: 'image/webp', buffer: Buffer.from(octets) })
	await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
}

/**
 * Holds every server action of the page, as a very slow server would, until the test releases the
 * oldest one: the state is asserted while the server has not answered, never after a fixed time.
 */
async function retenirLesActions(page: Page) {
	const portes: (() => void)[] = []
	let armee = false
	await page.route(`**${PAGE}`, async route => {
		const requete = route.request()
		if (armee && requete.method() === 'POST' && requete.headers()['next-action'])
			await new Promise<void>(resolve => portes.push(resolve))
		await route.continue()
	})
	return {
		// The searches of communes are server actions too: only the save that follows is held.
		armer: () => {
			armee = true
		},
		liberer: () => {
			armee = false
			portes.shift()?.()
		},
	}
}

test.describe('E02 : l’accueil en trois étapes', { tag: '@mobile' }, () => {
	test('identité, zone, photo : profil actif, arrivée dans l’espace', async ({ page }) => {
		test.setTimeout(150_000)
		const email = await nouveauCompte()
		await seConnecter(page, email)

		// Step 1: the speciality is required, and nothing is sent without it.
		await expect(page.getByRole('heading', { level: 1, name: 'Prépare ton profil' })).toBeVisible()
		await expect(titre(page)).toHaveText('Ton identité')
		await page.waitForLoadState('networkidle')
		await appuyer(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByText('Indique ton prénom.')).toBeVisible()
		await expect(page.getByText('Indique ta spécialité.')).toBeVisible()
		expect((await profilDe(email)).firstName ?? null).toBeNull()
		expect(await violationsApresLeTitre(page)).toEqual([])
		await remplirIdentite(page)
		await capturer(page, 'etape-1')
		await appuyer(page.getByRole('button', { name: 'Suivant' }))

		// Step 2: the identity is stored before the zone opens, and the title has the focus.
		await expect(titre(page)).toHaveText('Ta zone')
		await expect(titre(page)).toBeFocused()
		expect(await profilDe(email)).toMatchObject({
			firstName: 'Léa',
			lastName: 'Fictive',
			specialty: 'Maquillage mariée',
		})
		// A commune typed but not chosen in the list is no commune.
		await page.getByRole('combobox', { name: 'Ta commune' }).fill('Lille')
		await appuyer(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByText('Choisis ta commune dans la liste')).toBeVisible()
		await choisirLille(page)
		await capturer(page, 'etape-2')
		expect(await violationsApresLeTitre(page)).toEqual([])
		await appuyer(page.getByRole('button', { name: 'Suivant' }))

		// Step 3.
		await expect(titre(page)).toHaveText('Ta photo principale')
		expect((await profilDe(email)).city?.inseeCode).toBe('59350')
		await choisirLaPhoto(page)
		await capturer(page, 'etape-3')
		expect(await violationsApresLeTitre(page)).toEqual([])
		await appuyer(page.getByRole('button', { name: 'Terminer' }))

		// The server saw the three steps done: she arrives in her space, with an active, published profile.
		await expect(page).toHaveURL(/\/auth\/profil$/, { timeout: 60_000 })
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
		const profil = await profilDe(email)
		expect(profil.active).toBe(true)
		expect(profil.status).toBe('published')

		// The onboarding has nothing left for an active profile.
		await page.goto(PAGE)
		await expect(page).toHaveURL(/\/auth\/profil$/)
	})

	test('RG-07 : un serveur qui tarde ne montre ni arrivée ni étape suivante avant sa réponse', async ({ page }) => {
		test.setTimeout(150_000)
		const email = await nouveauCompte()
		await seConnecter(page, email)
		await page.waitForLoadState('networkidle')
		const serveur = await retenirLesActions(page)

		await remplirIdentite(page)
		serveur.armer()
		await appuyer(page.getByRole('button', { name: 'Suivant' }))
		// The server has not answered: the step says so, and nothing else opens.
		await expect(page.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
		await expect(titre(page)).toHaveText('Ton identité')
		expect((await profilDe(email)).firstName ?? null).toBeNull()
		serveur.liberer()
		await expect(titre(page)).toHaveText('Ta zone')

		await choisirLille(page)
		serveur.armer()
		await appuyer(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
		await expect(titre(page)).toHaveText('Ta zone')
		serveur.liberer()
		await expect(titre(page)).toHaveText('Ta photo principale')

		await choisirLaPhoto(page)
		serveur.armer()
		await appuyer(page.getByRole('button', { name: 'Terminer' }))
		// The last answer has not come: she is still on the step, no arrival is claimed.
		await expect(page.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect.poll(async () => (await profilDe(email)).mainPicture ?? null, { timeout: 5000 }).toBeNull()
		serveur.liberer()
		await expect(page).toHaveURL(/\/auth\/profil$/, { timeout: 60_000 })
		expect((await profilDe(email)).active).toBe(true)
	})

	test('un échec reste sur l’étape, la saisie est gardée, puis ça passe ; reprise à l’étape 2 après un départ', async ({
		page,
	}) => {
		test.setTimeout(120_000)
		const email = await nouveauCompte()
		await seConnecter(page, email)
		await page.waitForLoadState('networkidle')

		// The network fails on the first save.
		await page.route(`**${PAGE}`, route =>
			route.request().method() === 'POST' && route.request().headers()['next-action'] ? route.abort() : route.continue()
		)
		await remplirIdentite(page)
		await appuyer(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByRole('alert').filter({ hasText: 'n’a pas abouti' })).toBeVisible()
		await expect(titre(page)).toHaveText('Ton identité')
		await expect(page.getByLabel('Prénom')).toHaveValue('Léa')
		await expect(page.getByLabel(/Spécialité/)).toHaveValue('Maquillage mariée')
		expect((await profilDe(email)).firstName ?? null).toBeNull()

		// The network is back: the same form passes.
		await page.unroute(`**${PAGE}`)
		await appuyer(page.getByRole('button', { name: 'Suivant' }))
		await expect(titre(page)).toHaveText('Ta zone')

		// She leaves, and comes back later: step 2, not step 1.
		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
		await page.goto(PAGE)
		await expect(titre(page)).toHaveText('Ta zone')
		await expect(page.locator('[aria-current="step"]')).toContainText('Zone')
		await page.reload()
		await expect(titre(page)).toHaveText('Ta zone')
	})

	test('au clavier : Entrée envoie l’étape, les flèches choisissent la commune, le focus suit le titre', async ({
		page,
	}) => {
		const email = await nouveauCompte()
		await seConnecter(page, email)
		await page.waitForLoadState('networkidle')

		await page.getByLabel('Prénom').focus()
		await page.keyboard.type('Léa')
		await page.keyboard.press('Tab')
		await page.keyboard.type('Fictive')
		await page.keyboard.press('Tab')
		await page.keyboard.press('Tab')
		await page.keyboard.type('Maquillage mariée')
		await page.keyboard.press('Enter')
		await expect(titre(page)).toHaveText('Ta zone')
		await expect(titre(page)).toBeFocused()

		await page.getByRole('combobox', { name: 'Ta commune' }).focus()
		await page.keyboard.type('Lille')
		await expect(page.getByRole('option').first()).toBeVisible()
		await page.keyboard.press('ArrowDown')
		await page.keyboard.press('Enter')
		await expect(page.getByRole('combobox', { name: 'Ta commune' })).toHaveValue(/Lille/)
		await page.getByRole('button', { name: 'Suivant' }).focus()
		await page.keyboard.press('Enter')
		await expect(titre(page)).toHaveText('Ta photo principale')
		await expect(titre(page)).toBeFocused()
		expect(await violationsApresLeTitre(page)).toEqual([])
	})

	test('un compte venu sans profil : le profil vide est créé côté serveur, puis l’accueil', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('maquilleuse-sans-profil')
		await context.addCookies(compte.session.cookies)
		const payload = await payloadDeTest()
		const profils = () =>
			payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }).then(r => r.docs)
		expect(await profils()).toHaveLength(0)
		try {
			await page.goto('/auth/profil')
			// Her space sends her to the onboarding, which makes the profile.
			await expect(page).toHaveURL(/\/auth\/init-account$/)
			await expect(titre(page)).toHaveText('Ton identité')
			const apres = await profils()
			expect(apres).toHaveLength(1)
			await page.reload()
			expect(await profils()).toHaveLength(1)
		} finally {
			for (const { id } of await profils()) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
			await payload.delete({ collection: 'pros', id: compte.id }).catch(() => undefined)
		}
	})
})
