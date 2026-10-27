import { expect, type Locator, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { EDIT_PATH } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * The zone in the block « Zone » of her page (tickets 265 and 266, moved
 * to the block by issue 1022; plan 02
 * U14 to U16, PLAN-ZONES.md §3.3 and §3.4): a postal code that names one commune chooses it, a shared
 * one opens the list, a zone to review offers its communes, and a zone abroad is told with countries.
 * The communes come from the fake list of the bench (tests/support/fake-cities): nothing leaves the
 * machine. At 390 px (tap) as at 1440 px (click).
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${10 + (++counter % 200)}` })
)

const created: number[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

const press = (cible: Locator) => (test.info().project.name === 'mobile' ? cible.tap() : cible.click())

/** A capture of the page as it is, when DASHBOARD_SCREENSHOTS names a folder (the check at 390 px). */
async function takeScreenshot(page: Page, nom: string) {
	const folder = process.env.DASHBOARD_SCREENSHOTS
	if (folder) await page.screenshot({ path: `${folder}/zone-${nom}-${test.info().project.name}.png`, fullPage: true })
}

/** A makeup artist with an empty profile, a session in the browser, and the profile as it is stored. */
async function artist(context: { addCookies: (c: never) => Promise<void> }) {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [profile] = docs
	if (!profile) throw new Error('pas de profil')
	await context.addCookies(account.session.cookies as never)
	return { id: profile.id, payload }
}

const stored = async (id: number) =>
	(await testPayload()).findByID({ collection: 'profiles', id, depth: 0, overrideAccess: true })

async function openPanel(page: Page) {
	await page.goto(EDIT_PATH)
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
	await page.waitForLoadState('networkidle')
	await press(page.getByRole('button', { name: 'Modifier ma zone', exact: true }))
	await expect(page.locator('[data-direct-edit-editor]')).toBeVisible()
}

test.describe('U14 à U16 : le code postal, la zone à revoir, l’étranger', { tag: '@mobile' }, () => {
	test('un code postal d’une seule commune la choisit ; un code partagé ouvre la liste', async ({ context, page }) => {
		test.setTimeout(90_000)
		const { id } = await artist(context)
		await openPanel(page)
		const dialog = page.locator('[data-direct-edit-editor]')
		const field = dialog.getByRole('combobox', { name: 'Où travailles-tu ?' })

		await field.fill('51290')
		await expect(dialog.getByRole('status').filter({ hasText: 'Code postal 51290' })).toContainText('choisie')
		await expect(field).toHaveValue(/Saint-Remy-en-Bouzemont/)

		await field.fill('74990')
		await expect(dialog.getByText('Ce code postal couvre 2 communes : choisis la tienne.')).toBeVisible()
		await expect(dialog.getByRole('option', { name: /Valbrume \(74\) · 74990/ })).toBeVisible()
		await expect(dialog.getByRole('option', { name: /Hautcombe \(74\) · 74990/ })).toBeVisible()
		await takeScreenshot(page, 'code-partage')
		expect(await violationsSevere(page)).toEqual([])

		// The keyboard is unchanged: arrows, Enter.
		await field.press('ArrowDown')
		await field.press('Enter')
		await expect(field).toHaveValue(/Valbrume|Hautcombe/)
		await press(dialog.getByRole('button', { name: 'Enregistrer' }))
		await expect(page.locator('[data-direct-edit-editor]')).toHaveCount(0)
		const profile = await stored(id)
		expect(profile.zoneKind).toBe('city')
		expect(profile.city?.postalCodes).toEqual(['74990'])
	})

	test('une zone à revoir : le bandeau propose les communes, un appui enregistre et le bandeau disparaît', async ({
		context,
		page,
	}) => {
		test.setTimeout(90_000)
		const { id, payload } = await artist(context)
		await payload.update({
			collection: 'profiles',
			id,
			data: {
				zoneReview: {
					reason: 'sharedPostalCode',
					postalCode: '74990',
					candidates: [
						{ inseeCode: '74990', name: 'Valbrume', department: '74' },
						{ inseeCode: '74991', name: 'Hautcombe', department: '74' },
					],
				},
			},
		})
		await openPanel(page)
		const banner = page.getByTestId('zone-a-revoir')
		await expect(banner).toContainText('le code postal 74990 couvre 2 communes. Choisis la tienne.')
		await takeScreenshot(page, 'bandeau')
		expect(await violationsSevere(page)).toEqual([])
		await press(banner.getByRole('button', { name: 'Hautcombe (74)' }))
		await expect(banner).toHaveCount(0)
		const profile = await stored(id)
		expect(profile.city?.inseeCode).toBe('74991')
		expect(profile.zoneReview?.reason ?? null).toBeNull()
		await page.reload()
		await page.waitForLoadState('networkidle')
		await press(page.getByRole('button', { name: 'Modifier ma zone', exact: true }))
		await expect(page.getByTestId('zone-a-revoir')).toHaveCount(0)
	})

	test('ticket 297 : « Genève » dans le panneau propose « Choisir un pays », un appui suffit', async ({
		context,
		page,
	}) => {
		test.setTimeout(90_000)
		const { id } = await artist(context)
		await openPanel(page)
		const dialog = page.locator('[data-direct-edit-editor]')
		const field = dialog.getByRole('combobox', { name: 'Où travailles-tu ?' })
		const choose = dialog.getByRole('button', { name: 'Choisir un pays' })

		await takeScreenshot(page, 'panneau-normal')
		await field.fill('Genève')
		await expect(dialog.getByText('Pas de commune française de ce nom.')).toBeVisible()
		await expect(choose).toBeVisible()
		await takeScreenshot(page, 'panneau-aucune-commune')
		expect((await choose.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])

		await press(choose)
		await expect(dialog.getByRole('button', { name: 'Retirer Suisse' })).toBeVisible()
		await expect(choose).toHaveCount(0)
		await takeScreenshot(page, 'panneau-pays-prechoisi')
		expect(await violationsSevere(page)).toEqual([])
		await press(dialog.getByRole('button', { name: 'Enregistrer' }))
		await expect(page.locator('[data-direct-edit-editor]')).toHaveCount(0)
		expect(await stored(id)).toMatchObject({ zoneKind: 'countries', countries: ['CH'] })
	})

	test('l’étranger : la Belgique et Bruxelles, puis la France et l’Italie, puis une commune', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { id } = await artist(context)
		await openPanel(page)
		const dialog = page.locator('[data-direct-edit-editor]')

		await press(dialog.getByRole('button', { name: 'Je travaille à l’étranger ou dans plusieurs pays' }))
		const picker = dialog.getByRole('combobox', { name: 'Ajouter un pays' })
		await picker.fill('Belg')
		await press(dialog.getByRole('option', { name: /Belgique/ }))
		await expect(dialog.getByRole('button', { name: 'Retirer Belgique' })).toBeVisible()
		await dialog.getByLabel('Ville (facultatif)').fill('Bruxelles')
		await takeScreenshot(page, 'etranger')
		expect(await violationsSevere(page)).toEqual([])
		await press(dialog.getByRole('button', { name: 'Enregistrer' }))
		await expect(page.locator('[data-direct-edit-editor]')).toHaveCount(0)
		await expect(page.getByText('Bruxelles (Belgique)')).toBeVisible()
		expect(await stored(id)).toMatchObject({ zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles' })

		// Two countries, the keyboard only.
		await openPanelAgain(page)
		const again = page.locator('[data-direct-edit-editor]')
		await again.getByRole('button', { name: 'Retirer Belgique' }).focus()
		await page.keyboard.press('Enter')
		const picker2 = again.getByRole('combobox', { name: 'Ajouter un pays' })
		await picker2.fill('Fran')
		await picker2.press('ArrowDown')
		await picker2.press('Enter')
		await picker2.fill('Ital')
		await picker2.press('ArrowDown')
		await picker2.press('Enter')
		await expect(again.getByRole('button', { name: 'Retirer France' })).toBeVisible()
		await expect(again.getByRole('button', { name: 'Retirer Italie' })).toBeVisible()
		await press(again.getByRole('button', { name: 'Enregistrer' }))
		await expect(page.locator('[data-direct-edit-editor]')).toHaveCount(0)
		expect(await stored(id)).toMatchObject({ zoneKind: 'countries', countries: ['FR', 'IT'] })
		await expect(page.getByText('France et Italie')).toBeVisible()

		// Back to a commune: the countries are emptied.
		await openPanelAgain(page)
		const last = page.locator('[data-direct-edit-editor]')
		await press(last.getByRole('button', { name: 'Revenir à une commune en France' }))
		await last.getByRole('combobox', { name: 'Où travailles-tu ?' }).fill('51290')
		await expect(last.getByRole('combobox', { name: 'Où travailles-tu ?' })).toHaveValue(/Saint-Remy/)
		await press(last.getByRole('button', { name: 'Enregistrer' }))
		await expect(page.locator('[data-direct-edit-editor]')).toHaveCount(0)
		const back = await stored(id)
		expect(back.zoneKind).toBe('city')
		expect(back.countries ?? []).toEqual([])
		expect(back.town ?? null).toBeNull()
	})

	test('zoom à 200 % : la zone à l’étranger ne déborde pas de côté', async ({ context, page }) => {
		test.setTimeout(90_000)
		await artist(context)
		const size = page.viewportSize()
		// 200 % of zoom halves the width in CSS pixels; the phone width is floored at 320, the width of WCAG 1.4.10.
		if (size) await page.setViewportSize({ width: Math.max(320, Math.round(size.width / 2)), height: size.height })
		await openPanel(page)
		const dialog = page.locator('[data-direct-edit-editor]')
		await press(dialog.getByRole('button', { name: 'Je travaille à l’étranger ou dans plusieurs pays' }))
		const picker = dialog.getByRole('combobox', { name: 'Ajouter un pays' })
		await picker.fill('Belg')
		await press(dialog.getByRole('option', { name: /Belgique/ }))
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(overflow).toBeLessThanOrEqual(0)
	})
})

async function openPanelAgain(page: Page) {
	await press(page.getByRole('button', { name: 'Modifier ma zone', exact: true }))
	await expect(page.locator('[data-direct-edit-editor]')).toBeVisible()
}
