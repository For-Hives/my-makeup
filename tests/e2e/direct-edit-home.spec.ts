import { expect, type Locator, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * Her space opens on her profile (issue 1022), at 390 px (tap) and at 1440 px (click): the sign-in leads to the
 * page of her profile in edit mode, the gauge sits above it, `?mode=preview` is her page as a visitor sees it, the
 * former addresses of the space go on for good, and her account has a page of its own. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

const PASSWORD = 'motdepasse-fictif'

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${60 + (++counter % 150)}` })
)

const isMobile = () => test.info().project.name === 'mobile'
const press = (target: Locator) => (isMobile() ? target.tap() : target.click())

/** The accounts a test made: their profiles would crowd the lists of the search specs. */
const created: number[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

type Artist = TestAccount<'maquilleuse'>

async function artist(data: Record<string, unknown> = {}): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	if (Object.keys(data).length > 0) {
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		const [sheet] = docs
		if (!sheet) throw new Error('pas de profil')
		await payload.update({ collection: 'profiles', id: sheet.id, data })
	}
	return account
}

async function shot(page: Page, name: string) {
	const folder = process.env.SCREENSHOT_DIR
	if (folder)
		await page.screenshot({ path: `${folder}/1022-${name}-${page.viewportSize()?.width}.png`, fullPage: true })
}

/** No sideways scroll, and no serious axe violation. */
async function checkScreen(page: Page, label: string) {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

/** The controls of her space that are not blocks: the two modes, the account link, the points of the gauge. */
async function expectTouchTargets(page: Page) {
	const small = await page.evaluate(() =>
		[
			...document.querySelectorAll<HTMLElement>(
				'[data-testid="mode-edition"], [data-testid="mode-apercu"], [data-testid="mon-compte"], [data-testid="completeness"] a, [data-testid="completeness"] summary, [data-testid="completeness"] button'
			),
		]
			.filter(element => element.getClientRects().length > 0)
			.map(element => ({
				label: element.textContent?.trim().slice(0, 30),
				height: element.getBoundingClientRect().height,
			}))
			.filter(({ height }) => height < 43.5)
	)
	expect(small).toEqual([])
}

test.describe('1022 : l’espace s’ouvre sur le profil', { tag: '@mobile' }, () => {
	test('la barre, la jauge puis le profil, dans cet ordre, sans défilement de côté', async ({ context, page }) => {
		const account = await artist()
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		const top = (locator: Locator) => locator.evaluate(node => node.getBoundingClientRect().top + window.scrollY)
		const bar = await top(page.getByTestId('edit-status'))
		const gauge = await top(page.getByTestId('completeness'))
		const title = await top(page.getByRole('heading', { level: 1 }))
		expect(bar).toBeLessThan(gauge)
		expect(gauge).toBeLessThan(title)
		await expect(page.getByTestId('mode-edition')).toHaveAttribute('aria-current', 'page')
		await expect(page.getByTestId('mode-edition')).toHaveText('Édition')
		await expect(page.getByTestId('mode-apercu')).toHaveText('Aperçu')
		await expectTouchTargets(page)
		await checkScreen(page, 'profil vide')
		await shot(page, 'profil-vide')
		// The page is private and never indexed.
		const response = await page.request.get('/auth/profil')
		expect(response.headers()['cache-control']).toBe('private, no-store')
		expect(response.headers()['x-robots-tag']).toContain('noindex')
	})

	test('la connexion, sans lien précis, mène au profil en édition quand il est publié', async ({ page }) => {
		const email = `espace-${crypto.randomUUID()}@example.test`
		const payload = await testPayload()
		const account = await payload.create({
			collection: 'pros',
			data: { email, password: PASSWORD, name: 'Espace Fictive', _verified: true },
			disableVerificationEmail: true,
			overrideAccess: true,
		})
		created.push(Number(account.id))
		await activateProfile(account.id)
		await page.goto('/auth/signin')
		await page.waitForLoadState('networkidle')
		await page.getByLabel('Adresse email').fill(email)
		await page.getByLabel('Mot de passe').fill(PASSWORD)
		await page.getByRole('button', { name: 'Se connecter' }).click()
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.getByTestId('mode-edition')).toHaveAttribute('aria-current', 'page')
		await expect(page.getByTestId('completeness')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Modifier ma photo principale' })).toBeVisible()
		await shot(page, 'connexion')
	})

	test('un profil masqué : la jauge le dit avec son motif, l’aperçu garde son bandeau', async ({ context, page }) => {
		const account = await artist({
			firstName: 'Léa',
			lastName: 'Masquée',
			chosenStatus: 'hidden',
			reason: 'Photos sans rapport avec le maquillage.',
		})
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		const gauge = page.getByTestId('completeness')
		await expect(gauge).toHaveAttribute('data-etat', 'masque')
		await expect(gauge).toContainText('Motif : Photos sans rapport avec le maquillage.')
		await expect(page.getByRole('button', { name: 'Modifier ma photo principale' })).toBeVisible()
		await checkScreen(page, 'profil masqué')
		await press(page.getByTestId('mode-apercu'))
		await expect(page).toHaveURL(/\/auth\/profil\?mode=preview$/)
		await expect(page.getByTestId('bandeau-apercu')).toHaveAttribute('data-etat', 'masque')
		await shot(page, 'apercu-masque')
	})

	test('un profil publié : « Ton profil est rempli à N % », la page est en ligne, et ses vues sont sous la page', async ({
		context,
		page,
	}) => {
		const account = await artist()
		await activateProfile(account.id)
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		await payload.update({
			collection: 'profiles',
			id: docs[0]?.id as number,
			data: {
				description: 'Maquilleuse fictive. '.repeat(12),
				serviceOffers: [{ name: 'Mariée', priceFrom: 120 }],
				networks: { instagram: 'studio.fictif' },
			},
		})
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		const gauge = page.getByTestId('completeness')
		await expect(gauge).toHaveAttribute('data-etat', 'publiable')
		await expect(gauge.locator('#completeness-title')).toHaveText(/^Ton profil est rempli à \d+ %$/)
		await expect(gauge.getByTestId('brouillon')).toHaveCount(0)
		await expect(page.getByTestId('page-en-ligne')).toBeVisible()
		await expect(page.getByTestId('mes-vues')).toBeVisible()
		await checkScreen(page, 'profil publié')
		await shot(page, 'profil-publie')
	})

	test('Aperçu et Édition : une saisie non enregistrée est gardée jusqu’à ce qu’elle soit abandonnée', async ({
		context,
		page,
	}) => {
		const account = await artist({ firstName: 'Léa', lastName: 'Bascule', skills: [{ name: 'Teint' }] })
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await page.waitForLoadState('networkidle')
		await press(page.getByRole('button', { name: 'Modifier mes compétences' }))
		await page.getByLabel('Compétence', { exact: true }).fill('Yeux')
		await press(page.getByTestId('mode-apercu'))
		const question = page.getByRole('alert').filter({ hasText: 'modifications non enregistrées' })
		await expect(question).toBeVisible()
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await shot(page, 'garde-apercu')
		await press(page.getByRole('button', { name: 'Continuer à modifier' }))
		await expect(page.getByLabel('Compétence', { exact: true })).toHaveValue('Yeux')
		await press(page.getByTestId('mode-apercu'))
		await press(page.getByRole('button', { name: 'Abandonner mes modifications' }))
		await expect(page).toHaveURL(/\/auth\/profil\?mode=preview$/)
		await expect(page.getByTestId('bandeau-apercu')).toBeVisible()
		// Nothing was stored, and the way back is one link.
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		expect(docs[0]?.skills?.map(skill => skill.name)).toEqual(['Teint'])
		await press(page.getByTestId('modifier-sur-ma-page'))
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByTestId('completeness')).toBeVisible()
	})

	test('les anciennes adresses : une redirection définitive en un saut, un signet n’est pas cassé', async ({
		context,
		page,
		request,
	}) => {
		const account = await artist({ firstName: 'Léa', lastName: 'Signet' })
		await context.addCookies(account.session.cookies)
		const preview = await page.request.get('/auth/apercu-profil', { maxRedirects: 0 })
		expect(preview.status()).toBe(308)
		expect(preview.headers().location).toBe('/auth/profil?mode=preview')
		const edit = await page.request.get('/auth/apercu-profil?mode=edition', { maxRedirects: 0 })
		expect(edit.status()).toBe(308)
		expect(edit.headers().location).toBe('/auth/profil')
		await page.goto('/auth/apercu-profil')
		await expect(page).toHaveURL(/\/auth\/profil\?mode=preview$/)
		await expect(page.getByTestId('bandeau-apercu')).toBeVisible()
		await page.goto('/auth/apercu-profil?mode=edition')
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByTestId('completeness')).toBeVisible()
		// Without a session, the closed space still answers with the one redirection to the sign-in page.
		const visitor = await request.get('/auth/apercu-profil', { maxRedirects: 0 })
		expect(visitor.status()).toBe(307)
		expect(visitor.headers().location).toContain('/auth/signin?callbackUrl=%2Fauth%2Fapercu-profil')
		const visitorAccount = await request.get('/auth/account', { maxRedirects: 0 })
		expect(visitorAccount.status()).toBe(307)
		expect(visitorAccount.headers().location).toContain('/auth/signin?callbackUrl=%2Fauth%2Faccount')
	})

	test('Mon compte : la déconnexion, le mot de passe et la suppression sont sur une page claire', async ({
		context,
		page,
	}) => {
		const account = await artist({ firstName: 'Léa', lastName: 'Compte' })
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await press(page.getByTestId('mon-compte'))
		await expect(page).toHaveURL(/\/auth\/account$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Me déconnecter', exact: true })).toBeVisible()
		await expect(page.getByTestId('zone-suppression')).toBeVisible()
		await expect(page.getByRole('heading', { name: /mot de passe/i }).first()).toBeVisible()
		const back = page.getByTestId('retour-profil')
		expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		await checkScreen(page, 'mon compte')
		await shot(page, 'compte')
		const response = await page.request.get('/auth/account')
		expect(response.headers()['cache-control']).toBe('private, no-store')
		expect(response.headers()['x-robots-tag']).toContain('noindex')
		await press(back)
		await expect(page).toHaveURL(/\/auth\/profil$/)
	})
})
