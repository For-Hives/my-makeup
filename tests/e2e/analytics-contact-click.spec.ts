import { expect, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { agentByTest, fakeUmami, type ReadingFakeUmami } from '../support/fake-umami'
import { testPayload } from '../support/payload-test'

/**
 * The click on a contact of a public profile, end to end (ticket 144; plan 02 E52): a real browser
 * clicks the links of the page, and the fake Umami of the bench receives what the site relays.
 * One event per click, with the right channel; none for the artist herself, from her space or from a
 * reminder link; and a profile without a public contact has no link at all.
 *
 * Playwright's Chromium announces itself as automated, which the measure refuses: each test plays a
 * browser that is not (as tests/e2e/analytics-umami.spec.ts does).
 */

const PHONE = '06 12 34 56 78'
const EMAIL = 'contact-mesure@example.test'
const INSTAGRAM = 'https://instagram.com/mesure.exemple'

let umami: ReadingFakeUmami
let account: TestAccount<'maquilleuse'>
let other: TestAccount<'maquilleuse'>
let slug: string
let slugWithoutContact: string

test.describe.configure({ mode: 'serial' })

// An ordinary Chrome, with a mark of its own: the fake Umami is shared by every worker of the run, and each
// test reads only what came from its browser (tests/support/fake-umami.ts).
test.use(agentByTest())

/** The brake of the sign-in counts by client address: this file sends its own made-up address. */
test.beforeEach(async ({ context, userAgent }) => {
	umami = fakeUmami().pourLAgent(userAgent)
	await context.addInitScript(() => {
		Object.defineProperty(navigator, 'webdriver', { get: () => false })
	})
})

async function profileOf(c: TestAccount<'maquilleuse'>) {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: c.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	return { payload, fiche: sheet }
}

test.beforeAll(async () => {
	test.setTimeout(120_000)
	account = await createAccount('maquilleuse')
	other = await createAccount('maquilleuse')
	const { payload, fiche: sheet } = await profileOf(account)
	slug = sheet.slug
	await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: {
			firstName: 'Mesure',
			lastName: 'Exemple',
			networks: { instagram: INSTAGRAM },
			contactDetails: { phone: PHONE, email: EMAIL },
			publicContact: true,
			consentedAt: new Date().toISOString(),
		},
	})
	const { fiche: withoutContact } = await profileOf(other)
	slugWithoutContact = withoutContact.slug
})

test.afterAll(async () => {
	test.setTimeout(120_000)
	const payload = await testPayload()
	for (const c of [account, other]) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: c.id } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id })
		await payload.delete({ collection: 'pros', id: c.id }).catch(() => undefined)
	}
})

/** Opens a page and waits for the answer about the visitor, so that a click finds it known. */
async function open(page: Page, adresse: string) {
	const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/dashboard/my-pid')
	await page.goto(adresse)
	await response
}

/** The links open nothing in the test: a click is only played, and the page stays. */
async function click(page: Page, nom: string | RegExp) {
	await page.getByRole('link', { name: nom }).click({ modifiers: [], noWaitAfter: true })
}

test.describe('E52 : un clic de contact est compté une fois, avec le bon canal', () => {
	test('un visiteur anonyme : un événement par clic, téléphone, email et réseau', async ({ page }) => {
		// A link to « tel: » or « mailto: » opens nothing here; the instagram link opens a tab.
		await page.route('https://instagram.com/**', route => route.fulfill({ body: 'ok' }))
		await open(page, `/profil/${slug}`)

		await click(page, PHONE)
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(1)
		await click(page, EMAIL)
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(2)
		const [popup] = await Promise.all([page.waitForEvent('popup'), click(page, '@mesure.exemple')])
		await popup.close()
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(3)

		const received = (await umami.envois('contact_click')).map(
			recu => (recu.corps as { payload: { data: Record<string, unknown> } }).payload.data
		)
		const pid = received[0]?.pid
		expect(String(pid)).toMatch(/^(v3-)?\d+$/)
		expect(received).toEqual([
			{ pid, channel: 'phone' },
			{ pid, channel: 'email' },
			{ pid, channel: 'instagram' },
		])
		// Once only: nothing more arrives once the network is quiet.
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(3)
	})

	test('U84 : la propriétaire connectée ne compte pas ses propres clics', async ({ context, page }) => {
		await context.addCookies(account.session.cookies)
		await open(page, `/profil/${slug}`)
		await click(page, PHONE)
		await click(page, EMAIL)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})

	test('U84 : une autre maquilleuse connectée est comptée comme n’importe quelle visiteuse', async ({
		context,
		page,
	}) => {
		await context.addCookies(other.session.cookies)
		await open(page, `/profil/${slug}`)
		await click(page, PHONE)
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(1)
	})

	test('U84 : un lien de relance (utm_campaign=relance) ne compte pas', async ({ page }) => {
		await open(page, `/profil/${slug}?utm_source=email&utm_campaign=relance`)
		await click(page, PHONE)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})

	test('U84 : l’aperçu de sa propre page, depuis son espace, ne compte pas', async ({ context, page }) => {
		await context.addCookies(account.session.cookies)
		// The preview asks nothing about the visitor: it counts no click at all.
		await page.goto('/auth/profil?mode=preview')
		await expect(page.getByRole('link', { name: PHONE })).toBeVisible()
		await click(page, PHONE)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})

	// Ticket 290: the sheet of the « Contacter » button counts its clicks like the card of contacts.
	test('290 : la feuille « Contacter » compte le clic du téléphone, et Échap la ferme en rendant le focus', async ({
		page,
	}) => {
		await open(page, `/profil/${slug}`)
		const opener = page.getByRole('button', { name: 'Contacter Mesure' })
		await opener.click()
		const sheet = page.getByRole('dialog', { name: 'Contacter Mesure' })
		await expect(sheet).toBeVisible()

		await page.keyboard.press('Escape')
		await expect(sheet).toBeHidden()
		await expect(opener).toBeFocused()
		expect(await umami.envois('contact_click')).toHaveLength(0)

		await opener.press('Enter')
		await expect(sheet).toBeVisible()
		await sheet.getByRole('link', { name: /^Appeler Mesure/ }).click({ noWaitAfter: true })
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(1)
		const [received] = (await umami.envois('contact_click')).map(
			recu => (recu.corps as { payload: { data: Record<string, unknown> } }).payload.data
		)
		expect(received?.channel).toBe('phone')
	})

	test('un profil sans contact public : ni lien ni événement', async ({ page }) => {
		await page.goto(`/profil/${slugWithoutContact}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.locator('main a[href^="tel:"], main a[href^="mailto:"]')).toHaveCount(0)
		await expect(page.getByText('Réseaux sociaux & contacts')).toHaveCount(0)
		await expect(page.getByRole('button', { name: /^Contacter/ })).toHaveCount(0)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})
})
