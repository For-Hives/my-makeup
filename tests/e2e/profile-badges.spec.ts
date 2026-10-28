import { expect, type Page, test } from '@playwright/test'
import { type SearchProfile, setSearchProfiles, TEST_WORD } from '../fixtures/search-profiles'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The badges « Super maquilleuse » and « Vérifiée » (badges du 28/10/2026), at 390 px and 1440 px: on a card of the search, in the
 * head of a profile, and the small bonus of order. The four profiles are the ones of the search fixture (made up), their
 * two boxes set here through the administration API.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const

let profiles: ReadonlyMap<string, SearchProfile>
const profile = (key: string): SearchProfile => {
	const found = profiles.get(key)
	if (!found) throw new Error(`pas de profil d’essai « ${key} »`)
	return found
}

test.beforeAll(async ({ request }) => {
	test.setTimeout(180_000)
	profiles = await setSearchProfiles()
	const headers = (await createAccount('admin')).session.enTetes
	const set = async (key: string, data: { superArtist: boolean; verified: boolean }) => {
		const response = await request.patch(`/api/profiles/${profile(key).id}`, { headers, data })
		expect(response.ok(), key).toBe(true)
	}
	await set('reference', { superArtist: false, verified: false })
	await set('ville-voisine', { superArtist: true, verified: false })
	await set('ville-eloignee', { superArtist: false, verified: true })
	await set('verifiee', { superArtist: true, verified: true })
	await refreshProfilePages(request, profile('reference'))
})

async function shot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/badges-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

const cardOf = (page: Page, key: string) =>
	page.locator('article', { has: page.getByRole('link', { name: profile(key).nom }) })

test('une carte de la recherche montre les badges de la case cochée, et rien sans elle', async ({ page }) => {
	for (const size of SIZES) {
		await page.setViewportSize(size)
		await page.goto(`/search?search=${encodeURIComponent(TEST_WORD)}`)
		const super_ = cardOf(page, 'ville-voisine')
		await expect(super_.getByText('Super maquilleuse')).toBeVisible()
		await expect(super_.getByText('Vérifiée', { exact: true })).toHaveCount(0)
		const verified = cardOf(page, 'ville-eloignee')
		await expect(verified.getByText('Vérifiée', { exact: true })).toBeVisible()
		await expect(verified.getByText('Super maquilleuse')).toHaveCount(0)
		const both = cardOf(page, 'verifiee')
		await expect(both.getByText('Super maquilleuse')).toBeVisible()
		await expect(both.getByText('Vérifiée', { exact: true })).toBeVisible()
		const none = cardOf(page, 'reference')
		await expect(none.locator('[data-badge]')).toHaveCount(0)
		// A badge is on the photo: no horizontal scroll, and nothing serious for axe.
		expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
		expect(await violationsSevere(page)).toEqual([])
		await shot(page, 'recherche')
	}
})

test('à pertinence égale, « Super maquilleuse » puis « Vérifiée » passent avant les autres, et personne n’est retiré', async ({
	page,
}) => {
	await page.goto(`/search?search=${encodeURIComponent(TEST_WORD)}`)
	const hrefs = await page
		.locator('main article a[href^="/profil/"]')
		.evaluateAll(links => links.map(link => link.getAttribute('href') ?? ''))
	const index = (key: string) => hrefs.indexOf(`/profil/${profile(key).slug}`)
	for (const key of ['reference', 'ville-voisine', 'ville-eloignee', 'verifiee'])
		expect(index(key), key).toBeGreaterThanOrEqual(0)
	expect(Math.max(index('ville-voisine'), index('verifiee'))).toBeLessThan(index('ville-eloignee'))
	expect(index('ville-eloignee')).toBeLessThan(index('reference'))
})

test('la page du profil montre les badges et le lien vers leur légende', async ({ page }) => {
	for (const size of SIZES) {
		await page.setViewportSize(size)
		await page.goto(`/profil/${profile('verifiee').slug}`)
		const head = page.locator('header', { has: page.locator('h1') })
		await expect(head.getByText('Super maquilleuse')).toBeVisible()
		await expect(head.getByText('Vérifiée', { exact: true })).toBeVisible()
		await shot(page, 'profil')
		await head.getByRole('link', { name: 'Que veulent dire ces badges ?' }).click()
		await expect(page).toHaveURL(/\/classement#badges$/)
		await expect(page.getByRole('heading', { name: /Les badges « Super maquilleuse » et « Vérifiée »/ })).toBeVisible()
		await page.goto(`/profil/${profile('reference').slug}`)
		await expect(page.locator('header', { has: page.locator('h1') }).locator('[data-badge]')).toHaveCount(0)
	}
})
