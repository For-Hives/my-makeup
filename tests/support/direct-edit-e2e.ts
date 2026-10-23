import { expect, type Locator, type Page, test } from '@playwright/test'
import { type PageProfile, pageProfilesUnderPrefix, setPageProfiles } from '../fixtures/page-profiles'
import { violationsSevere } from './axe'
import { SCREENS } from './e2e'
import { testPayload } from './payload-test'
import { openSessionWithoutPassword } from './session'

/**
 * What the end-to-end tests of the direct edition (issues 1008 to 1021) share: the two screen sizes,
 * a profile of their own for each test (the two sizes run side by side), her session, the checks of
 * every screen (no sideways scroll, targets of 44 px, no serious axe violation) and the screenshots.
 */

export const SIZES = [
	{ ...SCREENS.mobile, prefix: 'Directphone', touch: true },
	{ ...SCREENS.chromium, prefix: 'Directlarge', touch: false },
] as const
export type Size = (typeof SIZES)[number]

export const EDIT_PATH = '/auth/apercu-profil?mode=edition'

export async function sessionOf(profile: PageProfile) {
	const payload = await testPayload()
	const sheet = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0, select: { pro: true } })
	const pro = typeof sheet.pro === 'object' ? sheet.pro.id : sheet.pro
	if (pro === undefined || pro === null) throw new Error('pas de compte')
	return openSessionWithoutPassword(payload, { collection: 'pros', id: pro })
}

/** Keeps a screenshot in `SCREENSHOT_DIR`, named for the issue, the state and the width. */
export async function shot(page: Page, issue: string, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/${issue}-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

/** The checks of the issue on the screen that is open: no sideways scroll, targets of 44 px, axe. */
export async function checkScreen(page: Page, label: string): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	const small = await page.evaluate(() =>
		[
			...document.querySelectorAll<HTMLElement>(
				// A file field is drawn as the big button of its label (56 px): the field itself is only read by a keyboard.
				'main button, main input:not([type="hidden"]):not([type="file"]), [data-direct-edit-editor] a'
			),
		]
			.filter(element => {
				const box = element.getBoundingClientRect()
				return box.width > 0 && box.height > 0 && box.height < 44
			})
			.map(
				element =>
					`${element.tagName} ${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}`
			)
	)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

export const block = (page: Page, id: string): Locator => page.locator(`[data-direct-edit="${id}"]`)
export const pen = (page: Page, name: string): Locator => page.getByRole('button', { name })

/**
 * Call inside `test.describe` of a size: gives `open`, which makes a profile of the test's own and opens
 * her page in edit mode signed in as her, and takes every profile it made away after each test.
 */
export function editHarness(size: Size) {
	const made: PageProfile[] = []
	async function makeProfile(key: string): Promise<PageProfile> {
		const letters = Math.random()
			.toString(36)
			.replace(/[^a-z]/g, '')
			.slice(0, 6)
		const type = pageProfilesUnderPrefix(`${size.prefix}${letters}`).get(key)
		if (!type) throw new Error(`profil d’essai « ${key} » manquant`)
		const profile = (await setPageProfiles(new Map([[key, type]]))).get(key)
		if (!profile) throw new Error(`profil d’essai « ${key} » non créé`)
		made.push(profile)
		return profile
	}
	test.afterEach(async () => {
		const payload = await testPayload()
		for (const { id } of made.splice(0)) {
			const profile = await payload
				.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
				.catch(() => null)
			if (!profile) continue
			await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
			const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
			if (pro !== undefined && pro !== null)
				await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
		}
	})
	async function open(page: Page, context: Page['context'] extends () => infer C ? C : never, key: string) {
		const profile = await makeProfile(key)
		const session = await sessionOf(profile)
		await context.addCookies(session.cookies)
		await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${(size.width + key.length) % 200}` })
		await page.goto(EDIT_PATH)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		return profile
	}
	return { open, makeProfile }
}
