import { expect, type Locator, type Page, test } from '@playwright/test'
import { NO_PROFILE_CONTEXT } from '../../src/collections/Profiles'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { largePhotoSynthetic } from '../support/synthetic-photo'

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

const PASSWORD = 'motdepasse-fictif'
const PAGE = '/auth/init-account'

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${100 + (++counter % 100)}` })
)

const created: string[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const email of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })
		for (const account of docs) {
			const profiles = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
			for (const { id } of profiles.docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
			await payload.delete({ collection: 'pros', id: account.id }).catch(() => undefined)
		}
	}
})

const randomInLetters = () =>
	crypto
		.randomUUID()
		.replace(/-/g, '')
		.replace(/[0-9]/g, chiffre => 'ghijklmnop'.charAt(Number(chiffre)))

/** A confirmed account made by the server, as the sign-up leaves it: with its empty profile. */
async function newAccount(): Promise<string> {
	const email = `accueil-${crypto.randomUUID()}@example.test`
	const payload = await testPayload()
	await payload.create({
		collection: 'pros',
		data: { email, password: PASSWORD, name: `Accueil ${randomInLetters()}`, _verified: true },
		disableVerificationEmail: true,
		overrideAccess: true,
	})
	created.push(email)
	return email
}

async function signInAction(page: Page, email: string) {
	await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent(PAGE)}`)
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(PASSWORD)
	await page.getByRole('button', { name: 'Se connecter' }).click()
	await expect(page).toHaveURL(new RegExp(`${PAGE}$`))
}

/** Axe reads the page once: wait for the title of the page, which Next streams after a transition. */
async function violationsAfterTitle(page: Page) {
	await expect(page).toHaveTitle(/Prépare ton profil/)
	return violationsSevere(page)
}

/** A capture of the page as it is, when DASHBOARD_SCREENSHOTS names a folder (the check of ticket 140 at 390 px). */
async function takeScreenshot(page: Page, nom: string) {
	const folder = process.env.DASHBOARD_SCREENSHOTS
	if (folder)
		await page.screenshot({ path: `${folder}/accueil-${nom}-${test.info().project.name}.png`, fullPage: true })
}

/** A finger on a phone, a click elsewhere. */
const press = (cible: Locator) => (test.info().project.name === 'mobile' ? cible.tap() : cible.click())

const title = (page: Page) => page.locator('#accueil-titre-etape')

async function profileOf(email: string) {
	const payload = await testPayload()
	const account = (await payload.find({ collection: 'pros', depth: 0, where: { email: { equals: email } } })).docs[0]
	const profile = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account?.id } } }))
		.docs[0]
	if (!profile) throw new Error('pas de profil')
	return profile
}

async function fillIdentity(page: Page) {
	await page.getByLabel('Prénom').fill('Léa')
	await page.getByLabel('Nom', { exact: true }).fill('Fictive')
	await page.getByLabel(/Spécialité/).fill('Maquillage mariée')
}

async function chooseLille(page: Page) {
	const field = page.getByRole('combobox', { name: 'Où travailles-tu ?' })
	await field.fill('Lille')
	await press(page.getByRole('option', { name: /^Lille \(59\)/ }).first())
}

async function choosePhoto(page: Page) {
	const bytes = await largePhotoSynthetic()
	await page
		.getByLabel('Choisir une photo')
		.setInputFiles({ name: 'accueil.webp', mimeType: 'image/webp', buffer: Buffer.from(bytes) })
	await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
}

/**
 * Holds every server action of the page, as a very slow server would, until the test releases the
 * oldest one: the state is asserted while the server has not answered, never after a fixed time.
 */
async function keepActions(page: Page) {
	const carried: (() => void)[] = []
	let armed = false
	await page.route(`**${PAGE}`, async route => {
		const request = route.request()
		if (armed && request.method() === 'POST' && request.headers()['next-action'])
			await new Promise<void>(resolve => carried.push(resolve))
		await route.continue()
	})
	return {
		// The searches of communes are server actions too: only the save that follows is held.
		armer: () => {
			armed = true
		},
		liberer: () => {
			armed = false
			carried.shift()?.()
		},
	}
}

/** Signs in by the form, from the sign-in page with the given `callbackUrl` (none: the page by itself). */
async function signInFrom(page: Page, email: string, callbackUrl?: string) {
	await page.goto(
		callbackUrl === undefined ? '/auth/signin' : `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
	)
	await page.waitForLoadState('networkidle')
	await page.getByLabel('Adresse email').fill(email)
	await page.getByLabel('Mot de passe').fill(PASSWORD)
	await page.getByRole('button', { name: 'Se connecter' }).click()
}

test.describe('ticket 296 : revenir avec un profil encore vide', { tag: '@mobile' }, () => {
	test('« Me connecter » sans lien précis, ou depuis son espace fermé : l’accueil, sans cycle', async ({ page }) => {
		const email = await newAccount()
		await signInFrom(page, email)
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(title(page)).toHaveText('Ton identité')
		// Signed out, the closed space asks for the same sign-in: the same arrival.
		await page.context().clearCookies()
		await signInFrom(page, email, '/auth/profil')
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(title(page)).toHaveText('Ton identité')
	})

	test('un lien précis vers une page privée est respecté', async ({ page }) => {
		const email = await newAccount()
		await signInFrom(page, email, '/auth/apercu-profil')
		await expect(page).toHaveURL(/\/auth\/apercu-profil$/)
	})

	test('un compte repris sans profil : l’accueil, et le profil est créé', async ({ page }) => {
		const email = `accueil-${crypto.randomUUID()}@example.test`
		const payload = await testPayload()
		await payload.create({
			collection: 'pros',
			data: { email, password: PASSWORD, name: `Sans profil ${randomInLetters()}`, _verified: true },
			context: NO_PROFILE_CONTEXT,
			disableVerificationEmail: true,
			overrideAccess: true,
		})
		created.push(email)
		await signInFrom(page, email)
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(title(page)).toHaveText('Ton identité')
		expect((await profileOf(email)).id).toBeGreaterThan(0)
	})

	test('dans l’espace, le bandeau compte les étapes qui restent et « Reprendre » mène à la première', async ({
		page,
	}) => {
		const email = await newAccount()
		const profile = await profileOf(email)
		const payload = await testPayload()
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée' },
			overrideAccess: true,
		})
		await signInFrom(page, email, '/auth/profil')
		// Two steps remain, so she is offered the onboarding; the space is reached by its own address.
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(title(page)).toHaveText('Ta zone')
		await page.goto('/auth/profil')
		const banner = page.getByTestId('bandeau-accueil')
		await expect(banner).toContainText('Il te reste 2 étapes pour être visible.')
		await expect(banner).toHaveAttribute('data-premiere', '2')
		await takeScreenshot(page, 'bandeau')
		await press(banner.getByRole('link', { name: /Reprendre/ }))
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect(title(page)).toHaveText('Ta zone')
		expect(await violationsAfterTitle(page)).toEqual([])
	})
})

test.describe('E02 : l’accueil en trois étapes', { tag: '@mobile' }, () => {
	test('identité, zone, photo : profil actif, arrivée dans l’espace', async ({ page }) => {
		test.setTimeout(150_000)
		const email = await newAccount()
		await signInAction(page, email)

		// Step 1: the speciality is required, and nothing is sent without it.
		await expect(page.getByRole('heading', { level: 1, name: 'Prépare ton profil' })).toBeVisible()
		await expect(title(page)).toHaveText('Ton identité')
		await page.waitForLoadState('networkidle')
		await press(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByText('Indique ton prénom.')).toBeVisible()
		await expect(page.getByText('Indique ta spécialité.')).toBeVisible()
		expect((await profileOf(email)).firstName ?? null).toBeNull()
		expect(await violationsAfterTitle(page)).toEqual([])
		await fillIdentity(page)
		await takeScreenshot(page, 'etape-1')
		await press(page.getByRole('button', { name: 'Suivant' }))

		// Step 2: the identity is stored before the zone opens, and the title has the focus.
		await expect(title(page)).toHaveText('Ta zone')
		await expect(title(page)).toBeFocused()
		expect(await profileOf(email)).toMatchObject({
			firstName: 'Léa',
			lastName: 'Fictive',
			specialty: 'Maquillage mariée',
		})
		// A commune typed but not chosen in the list is no commune.
		await page.getByRole('combobox', { name: 'Où travailles-tu ?' }).fill('Lille')
		await press(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByText('Choisis ta commune dans la liste')).toBeVisible()
		await chooseLille(page)
		await takeScreenshot(page, 'etape-2')
		expect(await violationsAfterTitle(page)).toEqual([])
		await press(page.getByRole('button', { name: 'Suivant' }))

		// Step 3.
		await expect(title(page)).toHaveText('Ta photo principale')
		expect((await profileOf(email)).city?.inseeCode).toBe('59350')
		await choosePhoto(page)
		await takeScreenshot(page, 'etape-3')
		expect(await violationsAfterTitle(page)).toEqual([])
		await press(page.getByRole('button', { name: 'Terminer' }))

		// The server saw the three steps done: she arrives in her space, with an active, published profile.
		await expect(page).toHaveURL(/\/auth\/profil$/, { timeout: 60_000 })
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
		const profile = await profileOf(email)
		expect(profile.active).toBe(true)
		expect(profile.status).toBe('published')

		// The onboarding has nothing left for an active profile, and the banner of the steps is gone (ticket 296).
		await expect(page.getByTestId('bandeau-accueil')).toHaveCount(0)
		await page.goto(PAGE)
		await expect(page).toHaveURL(/\/auth\/profil$/)
	})

	test('ticket 266 : à l’étape 2, une zone à l’étranger suffit : profil actif, arrivée dans l’espace', async ({
		page,
	}) => {
		test.setTimeout(150_000)
		const email = await newAccount()
		await signInAction(page, email)
		await expect(title(page)).toHaveText('Ton identité')
		await page.waitForLoadState('networkidle')
		await fillIdentity(page)
		await press(page.getByRole('button', { name: 'Suivant' }))
		await expect(title(page)).toHaveText('Ta zone')

		await press(page.getByRole('button', { name: 'Je travaille à l’étranger ou dans plusieurs pays' }))
		const picker = page.getByRole('combobox', { name: 'Ajouter un pays' })
		await picker.fill('Belg')
		await press(page.getByRole('option', { name: /Belgique/ }))
		await page.getByLabel('Ville (facultatif)').fill('Bruxelles')
		await takeScreenshot(page, 'etape-2-etranger')
		expect(await violationsAfterTitle(page)).toEqual([])
		await press(page.getByRole('button', { name: 'Suivant' }))

		await expect(title(page)).toHaveText('Ta photo principale')
		expect(await profileOf(email)).toMatchObject({ zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles' })
		await choosePhoto(page)
		await press(page.getByRole('button', { name: 'Terminer' }))
		await expect(page).toHaveURL(/\/auth\/profil$/, { timeout: 60_000 })
		const profile = await profileOf(email)
		expect(profile.active).toBe(true)
		expect(profile.status).toBe('published')
	})

	test('RG-07 : un serveur qui tarde ne montre ni arrivée ni étape suivante avant sa réponse', async ({ page }) => {
		test.setTimeout(150_000)
		const email = await newAccount()
		await signInAction(page, email)
		await page.waitForLoadState('networkidle')
		const server = await keepActions(page)

		await fillIdentity(page)
		server.armer()
		await press(page.getByRole('button', { name: 'Suivant' }))
		// The server has not answered: the step says so, and nothing else opens.
		await expect(page.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
		await expect(title(page)).toHaveText('Ton identité')
		expect((await profileOf(email)).firstName ?? null).toBeNull()
		server.liberer()
		await expect(title(page)).toHaveText('Ta zone')

		await chooseLille(page)
		server.armer()
		await press(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
		await expect(title(page)).toHaveText('Ta zone')
		server.liberer()
		await expect(title(page)).toHaveText('Ta photo principale')

		await choosePhoto(page)
		server.armer()
		await press(page.getByRole('button', { name: 'Terminer' }))
		// The last answer has not come: she is still on the step, no arrival is claimed.
		await expect(page.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled()
		await expect(page).toHaveURL(/\/auth\/init-account$/)
		await expect.poll(async () => (await profileOf(email)).mainPicture ?? null, { timeout: 5000 }).toBeNull()
		server.liberer()
		await expect(page).toHaveURL(/\/auth\/profil$/, { timeout: 60_000 })
		expect((await profileOf(email)).active).toBe(true)
	})

	test('un échec reste sur l’étape, la saisie est gardée, puis ça passe ; reprise à l’étape 2 après un départ', async ({
		page,
	}) => {
		test.setTimeout(120_000)
		const email = await newAccount()
		await signInAction(page, email)
		await page.waitForLoadState('networkidle')

		// The network fails on the first save.
		await page.route(`**${PAGE}`, route =>
			route.request().method() === 'POST' && route.request().headers()['next-action'] ? route.abort() : route.continue()
		)
		await fillIdentity(page)
		await press(page.getByRole('button', { name: 'Suivant' }))
		await expect(page.getByRole('alert').filter({ hasText: 'n’a pas abouti' })).toBeVisible()
		await expect(title(page)).toHaveText('Ton identité')
		await expect(page.getByLabel('Prénom')).toHaveValue('Léa')
		await expect(page.getByLabel(/Spécialité/)).toHaveValue('Maquillage mariée')
		expect((await profileOf(email)).firstName ?? null).toBeNull()

		// The network is back: the same form passes.
		await page.unroute(`**${PAGE}`)
		await press(page.getByRole('button', { name: 'Suivant' }))
		await expect(title(page)).toHaveText('Ta zone')

		// She leaves, and comes back later: step 2, not step 1.
		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
		await page.goto(PAGE)
		await expect(title(page)).toHaveText('Ta zone')
		await expect(page.locator('[aria-current="step"]')).toContainText('Zone')
		await page.reload()
		await expect(title(page)).toHaveText('Ta zone')
	})

	test('au clavier : Entrée envoie l’étape, les flèches choisissent la commune, le focus suit le titre', async ({
		page,
	}) => {
		const email = await newAccount()
		await signInAction(page, email)
		await page.waitForLoadState('networkidle')

		await page.getByLabel('Prénom').focus()
		await page.keyboard.type('Léa')
		await page.keyboard.press('Tab')
		await page.keyboard.type('Fictive')
		await page.keyboard.press('Tab')
		await page.keyboard.press('Tab')
		await page.keyboard.type('Maquillage mariée')
		await page.keyboard.press('Enter')
		await expect(title(page)).toHaveText('Ta zone')
		await expect(title(page)).toBeFocused()

		await page.getByRole('combobox', { name: 'Où travailles-tu ?' }).focus()
		await page.keyboard.type('Lille')
		await expect(page.getByRole('option').first()).toBeVisible()
		await page.keyboard.press('ArrowDown')
		await page.keyboard.press('Enter')
		await expect(page.getByRole('combobox', { name: 'Où travailles-tu ?' })).toHaveValue(/Lille/)
		await page.getByRole('button', { name: 'Suivant' }).focus()
		await page.keyboard.press('Enter')
		await expect(title(page)).toHaveText('Ta photo principale')
		await expect(title(page)).toBeFocused()
		expect(await violationsAfterTitle(page)).toEqual([])
	})

	test('un compte venu sans profil : le profil vide est créé côté serveur, puis l’accueil', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse-sans-profil')
		await context.addCookies(account.session.cookies)
		const payload = await testPayload()
		const profiles = () =>
			payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }).then(r => r.docs)
		expect(await profiles()).toHaveLength(0)
		try {
			await page.goto('/auth/profil')
			// Her space sends her to the onboarding, which makes the profile.
			await expect(page).toHaveURL(/\/auth\/init-account$/)
			await expect(title(page)).toHaveText('Ton identité')
			const after = await profiles()
			expect(after).toHaveLength(1)
			await page.reload()
			expect(await profiles()).toHaveLength(1)
		} finally {
			for (const { id } of await profiles()) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
			await payload.delete({ collection: 'pros', id: account.id }).catch(() => undefined)
		}
	})
})
