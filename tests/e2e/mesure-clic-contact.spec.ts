import { expect, type Page, test } from '@playwright/test'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { fauxUmami, type OutilFauxUmami } from '../outils/faux-umami'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The click on a contact of a public profile, end to end (ticket 144; plan 02 E52): a real browser
 * clicks the links of the page, and the fake Umami of the bench receives what the site relays.
 * One event per click, with the right channel; none for the artist herself, from her space or from a
 * reminder link; and a profile without a public contact has no link at all.
 *
 * Playwright's Chromium announces itself as automated, which the measure refuses: each test plays a
 * browser that is not (as tests/e2e/mesure-umami.spec.ts does).
 */

const TELEPHONE = '06 12 34 56 78'
const EMAIL = 'contact-mesure@example.test'
const INSTAGRAM = 'https://instagram.com/mesure.exemple'

let umami: OutilFauxUmami
let compte: CompteDeTest<'maquilleuse'>
let autre: CompteDeTest<'maquilleuse'>
let slug: string
let slugSansContact: string

test.describe.configure({ mode: 'serial' })

const AGENT_ORDINAIRE =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
test.use({ userAgent: AGENT_ORDINAIRE })

/** The brake of the sign-in counts by client address: this file sends its own made-up address. */
test.beforeEach(async ({ context }) => {
	umami = fauxUmami()
	await umami.vider()
	await context.addInitScript(() => {
		Object.defineProperty(navigator, 'webdriver', { get: () => false })
	})
})

async function profilDe(c: CompteDeTest<'maquilleuse'>) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: c.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	return { payload, fiche }
}

test.beforeAll(async () => {
	test.setTimeout(120_000)
	compte = await creerCompte('maquilleuse')
	autre = await creerCompte('maquilleuse')
	const { payload, fiche } = await profilDe(compte)
	slug = fiche.slug
	await payload.update({
		collection: 'profils',
		id: fiche.id,
		data: {
			prenom: 'Mesure',
			nom: 'Exemple',
			reseaux: { instagram: INSTAGRAM },
			coordonnees: { telephone: TELEPHONE, email: EMAIL },
			contactPublic: true,
			consentiLe: new Date().toISOString(),
		},
	})
	const { fiche: sansContact } = await profilDe(autre)
	slugSansContact = sansContact.slug
})

test.afterAll(async () => {
	test.setTimeout(120_000)
	const payload = await payloadDeTest()
	for (const c of [compte, autre]) {
		const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: c.id } } })
		for (const { id } of docs) await payload.delete({ collection: 'profils', id })
		await payload.delete({ collection: 'pros', id: c.id }).catch(() => undefined)
	}
})

/** Opens a page and waits for the answer about the visitor, so that a click finds it known. */
async function ouvrir(page: Page, adresse: string) {
	const reponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/espace/mon-pid')
	await page.goto(adresse)
	await reponse
}

/** The links open nothing in the test: a click is only played, and the page stays. */
async function cliquer(page: Page, nom: string | RegExp) {
	await page.getByRole('link', { name: nom }).click({ modifiers: [], noWaitAfter: true })
}

test.describe('E52 : un clic de contact est compté une fois, avec le bon canal', () => {
	test('un visiteur anonyme : un événement par clic, téléphone, email et réseau', async ({ page }) => {
		// A link to « tel: » or « mailto: » opens nothing here; the instagram link opens a tab.
		await page.route('https://instagram.com/**', route => route.fulfill({ body: 'ok' }))
		await ouvrir(page, `/profil/${slug}`)

		await cliquer(page, TELEPHONE)
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(1)
		await cliquer(page, EMAIL)
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(2)
		const [popup] = await Promise.all([page.waitForEvent('popup'), cliquer(page, INSTAGRAM)])
		await popup.close()
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(3)

		const recus = (await umami.envois('contact_click')).map(
			recu => (recu.corps as { payload: { data: Record<string, unknown> } }).payload.data
		)
		const pid = recus[0]?.pid
		expect(String(pid)).toMatch(/^(v3-)?\d+$/)
		expect(recus).toEqual([
			{ pid, channel: 'phone' },
			{ pid, channel: 'email' },
			{ pid, channel: 'instagram' },
		])
		// Once only: nothing more arrives once the network is quiet.
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(3)
	})

	test('U84 : la propriétaire connectée ne compte pas ses propres clics', async ({ context, page }) => {
		await context.addCookies(compte.session.cookies)
		await ouvrir(page, `/profil/${slug}`)
		await cliquer(page, TELEPHONE)
		await cliquer(page, EMAIL)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})

	test('U84 : une autre maquilleuse connectée est comptée comme n’importe quelle visiteuse', async ({
		context,
		page,
	}) => {
		await context.addCookies(autre.session.cookies)
		await ouvrir(page, `/profil/${slug}`)
		await cliquer(page, TELEPHONE)
		await expect.poll(async () => (await umami.envois('contact_click')).length).toBe(1)
	})

	test('U84 : un lien de relance (utm_campaign=relance) ne compte pas', async ({ page }) => {
		await ouvrir(page, `/profil/${slug}?utm_source=email&utm_campaign=relance`)
		await cliquer(page, TELEPHONE)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})

	test('U84 : l’aperçu de sa propre page, depuis son espace, ne compte pas', async ({ context, page }) => {
		await context.addCookies(compte.session.cookies)
		// The preview asks nothing about the visitor: it counts no click at all.
		await page.goto('/auth/apercu-profil')
		await expect(page.getByRole('link', { name: TELEPHONE })).toBeVisible()
		await cliquer(page, TELEPHONE)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})

	test('un profil sans contact public : ni lien ni événement', async ({ page }) => {
		await page.goto(`/profil/${slugSansContact}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.locator('main a[href^="tel:"], main a[href^="mailto:"]')).toHaveCount(0)
		await expect(page.getByText('Réseaux sociaux & contacts')).toHaveCount(0)
		await page.waitForLoadState('networkidle')
		expect(await umami.envois('contact_click')).toHaveLength(0)
	})
})
