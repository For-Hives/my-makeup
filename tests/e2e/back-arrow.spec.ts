import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { EDIT_PATH } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * The back arrow of her space (27/10/2026), drawn once by the layout of `/auth`: top left of the preview and of the edit
 * mode of her page, named « Retour », 44 px at least, leading to her space; none on her space itself (it would lead to
 * itself) nor on the sign-in page (no loop). Set `SCREENSHOT_DIR` to keep the screenshots. Made-up people only.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++counter % 100)}` })
)

const created: number[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const owner of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: owner } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: owner }).catch(() => undefined)
	}
})

test.describe('la flèche de retour de l’espace', { tag: '@mobile' }, () => {
	test('présente, nommée « Retour », assez grande, et elle ramène à l’espace ; absente de l’espace et de la connexion', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		await context.addCookies(account.session.cookies as never[])

		// Her space itself: nothing to go back to inside the space.
		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Retour' })).toHaveCount(0)
		if (process.env.SCREENSHOT_DIR)
			await page.screenshot({
				path: `${process.env.SCREENSHOT_DIR}/fleche-espace-${page.viewportSize()?.width}.png`,
				fullPage: true,
			})

		// From her space to her page in edit mode: the arrow is there, named, at least 44 px, visible focus ring.
		await page.getByTestId('modifier-mon-profil').click()
		await expect(page).toHaveURL(/\/auth\/apercu-profil\?mode=edition$/)
		const arrow = page.getByRole('navigation', { name: 'Retour' }).getByRole('link', { name: 'Retour' })
		await expect(arrow).toBeVisible()
		const box = await arrow.boundingBox()
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		// Top left: left of the content column, at 390 px as at 1440 px.
		expect(box?.x ?? 999).toBeLessThan(120)
		expect(box?.y ?? 999).toBeLessThan(120)
		expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
		expect(await violationsSevere(page)).toEqual([])
		// Reached with the keyboard, so that the focus ring is the one a keyboard user sees.
		for (let press = 0; press < 4 && !(await arrow.evaluate(element => element === document.activeElement)); press += 1)
			await page.keyboard.press('Tab')
		await expect(arrow).toBeFocused()
		const outline = await arrow.evaluate(element => getComputedStyle(element).outlineStyle)
		expect(outline).not.toBe('none')
		if (process.env.SCREENSHOT_DIR)
			await page.screenshot({
				path: `${process.env.SCREENSHOT_DIR}/fleche-edition-${page.viewportSize()?.width}.png`,
				fullPage: false,
			})

		// The arrow really goes back to her space, in one step.
		await arrow.click()
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()

		// The preview has it too, and no loop: from her space the arrow is gone again.
		await page.goto('/auth/apercu-profil')
		await expect(page.getByRole('navigation', { name: 'Retour' })).toBeVisible()
		await page.getByRole('navigation', { name: 'Retour' }).getByRole('link', { name: 'Retour' }).click()
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByRole('navigation', { name: 'Retour' })).toHaveCount(0)
	})

	test('pas de flèche sur la page de connexion', async ({ page }) => {
		await page.goto('/auth/signin')
		await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Retour' })).toHaveCount(0)
	})

	test('l’édition directe garde son chemin : la flèche n’ôte rien à la barre de l’édition', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		await context.addCookies(account.session.cookies as never[])
		await page.goto(EDIT_PATH)
		await expect(page.getByRole('region', { name: 'Modification de ta page' })).toBeVisible()
		await expect(page.getByRole('navigation', { name: 'Retour' })).toBeVisible()
	})
})
