import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { LOADED_DEMO_PROFILES } from '../../src/demo-data/profiles'
import { createAccount } from '../support/account-factory'
import { keepSevere, REFERENCES } from '../support/axe'
import { withoutOutsideNetwork } from '../support/offline'
import { testPayload } from '../support/payload-test'

/**
 * Issue 1005: the admin suspends a profile from its sheet with a reason (refused without one), the public page
 * answers 404, the journal holds one line, the dashboard of the panel shows the numbers, and restoring needs a
 * new reason. At 390 and 1440 px: no horizontal scroll, targets of 44 px, no serious axe violation on what
 * this issue adds.
 */

const aSuffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`

async function setProfile(suffix: string) {
	const template = LOADED_DEMO_PROFILES.find(autre => autre.cle === 'reference')
	if (!template) throw new Error('Le profil type « reference » du jeu fictif manque.')
	const type = {
		...template,
		cle: `essai-mod-${suffix}`,
		compte: { email: `essai-mod-${suffix}@example.test`, nom: `Essai Moderation ${suffix}` },
		photos: { principale: template.photos.principale, galerie: [] },
	}
	const placed = await placeProfile(await testPayload(), type, readDemoPhoto, false)
	return { id: placed.profil, slug: placed.slug }
}

async function remove(suffix: string, profile?: number): Promise<void> {
	const payload = await testPayload()
	const accounts = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 50,
		pagination: false,
		where: { email: { like: 'essai-mod-' } },
	})
	for (const { id, email } of accounts.docs) {
		if (!email.includes(`-${suffix}@`)) continue
		await payload.delete({ collection: 'media', where: { owner: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'profiles', where: { pro: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id }).catch(() => undefined)
	}
	if (profile !== undefined)
		await payload
			.delete({ collection: 'moderation-events', where: { profile: { equals: profile } } })
			.catch(() => undefined)
}

const shot = async (page: Page, name: string, testInfo: import('@playwright/test').TestInfo) =>
	testInfo.attach(`${name}-${testInfo.project.name}`, {
		body: await page.screenshot({ fullPage: true }),
		contentType: 'image/png',
	})

async function ownViolations(page: Page, ...testIds: string[]) {
	let axe = new AxeBuilder({ page }).withTags([...REFERENCES])
	for (const id of testIds) axe = axe.include(`[data-testid="${id}"]`)
	return keepSevere((await axe.analyze()).violations)
}

const noHorizontalScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

/** The smallest height among the visible controls of a zone: the targets must be 44 px at least. */
const smallestTarget = (page: Page, selector: string) =>
	page.evaluate(sel => {
		const heights = [...document.querySelectorAll(sel)]
			.map(element => element.getBoundingClientRect().height)
			.filter(height => height > 0)
		return heights.length === 0 ? 0 : Math.min(...heights)
	}, selector)

test.describe('1005 : modérer un profil avec un motif, et le tableau de bord', { tag: '@mobile' }, () => {
	test('suspendre exige un motif, laisse une ligne au journal ; rétablir demande un autre motif', async ({
		context,
		page,
		request,
	}, testInfo) => {
		test.setTimeout(180_000)
		const suffix = aSuffix()
		await context.addCookies((await createAccount('admin')).session.cookies)
		await withoutOutsideNetwork(context)
		let profileId: number | undefined
		try {
			const profile = await setProfile(suffix)
			profileId = profile.id
			const payload = await testPayload()
			const pageStatus = async () => (await request.get(`/profil/${profile.slug}`)).status()
			await page.goto(`/admin/collections/profiles/${profile.id}`)
			await page.waitForLoadState('networkidle')

			await page.getByRole('button', { name: 'Suspendre…' }).click()
			const dialog = page.getByRole('group', { name: 'Suspendre ce profil' })
			await expect(dialog).toBeVisible()
			// No reason: nothing changes.
			await dialog.getByRole('button', { name: 'Suspendre le profil' }).click()
			await expect(page.getByText('Dis pourquoi')).toBeVisible()
			await shot(page, 'suspendre-sans-motif', testInfo)
			expect(
				await smallestTarget(page, '[data-testid="profile-actions"] button, [data-testid="profile-actions"] textarea')
			).toBeGreaterThanOrEqual(44)
			expect(await noHorizontalScroll(page)).toBe(true)
			expect(await ownViolations(page, 'profile-actions')).toEqual([])

			await page.getByLabel('Motif (obligatoire)').fill('Le profil enfreint les règles de publication.')
			await dialog.getByRole('button', { name: 'Suspendre le profil' }).click()
			await expect(page.getByRole('status').filter({ hasText: 'Statut choisi : suspendu' })).toBeVisible()
			await page.locator('#action-save').click()
			await expect(page.getByText('Mis à jour avec succès').first()).toBeVisible()
			await expect.poll(pageStatus, { timeout: 60_000 }).toBe(404)
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect([stored.status, stored.moderationAction]).toEqual(['hidden', 'suspend'])
			await shot(page, 'profil-suspendu', testInfo)

			// The journal holds the line.
			await page.goto(`/admin/collections/moderation-events?where[profile][equals]=${profile.id}`)
			await expect(page.locator('tbody tr')).toHaveCount(1)
			await expect(page.locator('tbody')).toContainText('Suspendu')
			await expect(page.locator('tbody')).toContainText('Le profil enfreint les règles de publication.')

			// Restoring asks for another reason.
			await page.goto(`/admin/collections/profiles/${profile.id}`)
			await page.waitForLoadState('networkidle')
			await page.getByRole('button', { name: 'Rétablir…' }).click()
			await page.getByLabel('Motif (obligatoire)').fill('Photos remplacées, profil conforme.')
			await page.getByRole('button', { name: 'Rétablir le profil' }).click()
			await page.locator('#action-save').click()
			await expect(page.getByText('Mis à jour avec succès').first()).toBeVisible()
			await expect.poll(pageStatus, { timeout: 60_000 }).toBe(200)
			const lines = await payload.find({
				collection: 'moderation-events',
				where: { profile: { equals: profile.id } },
				sort: 'date',
				depth: 0,
			})
			expect(lines.docs.map(line => line.action)).toEqual(['suspend', 'restore'])
		} finally {
			await remove(suffix, profileId)
		}
	})

	test('le tableau de bord montre les nombres, lisibles et sans défilement horizontal', async ({
		context,
		page,
	}, testInfo) => {
		test.setTimeout(120_000)
		await context.addCookies((await createAccount('admin')).session.cookies)
		await withoutOutsideNetwork(context)
		const payload = await testPayload()
		const count = async (status: string) =>
			(await payload.count({ collection: 'profiles', where: { status: { equals: status } } })).totalDocs
		await page.goto('/admin')
		const overview = page.getByTestId('dashboard-overview')
		await expect(overview).toBeVisible()
		await expect(page.getByTestId('count-published')).toHaveText(String(await count('published')))
		await expect(page.getByTestId('count-draft')).toHaveText(String(await count('draft')))
		await expect(page.getByTestId('count-hidden')).toHaveText(String(await count('hidden')))
		await shot(page, 'tableau-de-bord', testInfo)
		expect(await noHorizontalScroll(page)).toBe(true)
		expect(await smallestTarget(page, '[data-testid="dashboard-overview"] a')).toBeGreaterThanOrEqual(44)
		expect(await ownViolations(page, 'dashboard-overview')).toEqual([])
	})

	test('la rédaction ne voit pas le tableau de bord', async ({ context, page }) => {
		await context.addCookies((await createAccount('redaction')).session.cookies)
		await withoutOutsideNetwork(context)
		await page.goto('/admin')
		await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
		await expect(page.getByTestId('dashboard-overview')).toHaveCount(0)
	})
})
