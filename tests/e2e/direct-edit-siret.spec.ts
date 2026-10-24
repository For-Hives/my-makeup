import { expect, test } from '@playwright/test'
import { BADGE_ANCHOR, BADGE_LABEL } from '@/lib/activity/badge-text'
import { violationsSevere } from '../support/axe'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * The SIRET and the badge « Activité vérifiée » (issue 1004), at 390 px and at 1440 px: the optional SIRET card of
 * her own page in edit mode, the refusal of a typo, the save, and the badge on her page, on the page of a visitor
 * and on a card of the search once the check says « active ». No horizontal scroll, targets of 44 px, no serious
 * axe violation. The registry is never asked: the answer is written the way the daily task writes it.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1004', name)
const PEN = 'Modifier mon SIRET'
const SIRET = '00000000100016'

for (const size of SIZES) {
	test.describe(`1004 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })
		test.describe.configure({ timeout: 120_000 })
		const { open } = editHarness(size)

		test('sans SIRET : une invitation facultative, accessible', async ({ context, page }) => {
			await open(page, context, 'reference')
			const card = block(page, 'siret')
			await card.scrollIntoViewIfNeeded()
			await expect(card).toContainText('Ajoute ton SIRET (facultatif).')
			await expect(pen(page, PEN)).toBeVisible()
			await checkScreen(page, 'normal')
			await shot(page, 'invitation')
		})

		test('une faute de frappe est refusée, un SIRET juste est enregistré avec ses espaces, et reste privé', async ({
			context,
			page,
			request,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, PEN).click()
			const editor = page.locator('[data-direct-edit-editor]')
			await expect(editor).toContainText('SIRET et badge « Activité vérifiée » · je modifie')
			await expect(page.locator('#direct-siret')).toBeFocused()
			await expect(editor).toContainText(
				'Sans SIRET, tu n’es ni moins bien classée ni moins bien placée dans la recherche.'
			)
			await page.locator('#direct-siret').fill('000 000 001 00017')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.locator('#direct-siret-error')).toContainText('faute de frappe')
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')

			await page.locator('#direct-siret').fill('000 000 001 00016')
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			await expect(editor).toHaveCount(0)
			const payload = await testPayload()
			expect((await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).siret).toBe(SIRET)
			const rows = await payload.find({
				collection: 'activity-checks',
				depth: 0,
				where: { profile: { equals: profile.id } },
			})
			expect(rows.docs[0]?.outcome).toBe('pending')
			// She reads it back, formatted, with where the check stands.
			await expect(block(page, 'siret')).toContainText('000 000 001 00016')
			await expect(block(page, 'siret')).toContainText('Le contrôle a lieu dans la journée')
			await checkScreen(page, 'enregistré')
			await shot(page, 'enregistre')
			// A visitor reads neither the number nor a badge.
			const html = await (await request.get(`/profil/${profile.slug}`)).text()
			expect(html).not.toContain(SIRET)
			expect(html).not.toContain(BADGE_LABEL)
		})

		test('une fois l’activité vérifiée : le badge est sur sa page, sur la page publique et sur sa carte', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			const payload = await testPayload()
			await payload.update({ collection: 'profiles', id: profile.id, data: { siret: SIRET } })
			const row = await payload.find({
				collection: 'activity-checks',
				depth: 0,
				where: { profile: { equals: profile.id } },
			})
			const id = row.docs[0]?.id
			if (id === undefined) throw new Error('pas de ligne de contrôle')
			await payload.update({
				collection: 'activity-checks',
				id,
				data: { outcome: 'active', checkedAt: '2026-10-20T09:00:00.000Z' },
			})

			// Her page: the badge, what it says, and the card of her SIRET that says it is shown.
			await page.goto('/auth/profil')
			await expect(page.getByText(BADGE_LABEL, { exact: true }).first()).toBeVisible()
			await expect(page.getByText('contrôlé le 20 octobre 2026')).toBeVisible()
			await expect(block(page, 'siret')).toContainText(`Le badge « ${BADGE_LABEL} » s’affiche sur ta page.`)
			await checkScreen(page, 'avec le badge')
			await shot(page, 'badge-fiche-edition')

			// The page of a visitor.
			await page.goto(`/profil/${profile.slug}`)
			await expect(page.getByText(BADGE_LABEL, { exact: true })).toBeVisible()
			expect(await violationsSevere(page)).toEqual([])
			expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
			expect(await page.content()).not.toContain(SIRET)
			await shot(page, 'badge-fiche')
			const link = page.getByRole('link', { name: 'Qu’est-ce que c’est ?' })
			expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
			await link.click()
			await expect(page).toHaveURL(new RegExp(`/classement#${BADGE_ANCHOR}$`))
			await expect(page.getByRole('heading', { name: 'Le badge « Activité vérifiée »' })).toBeVisible()
			await expect(page.getByText('Il ne dit rien de la qualité de son travail')).toBeVisible()
			expect(await violationsSevere(page)).toEqual([])
			await shot(page, 'explication')

			// A card of the search: a readable text, inside the one link of the card, and no link in the link.
			await page.goto(`/search?search=${encodeURIComponent(profile.slug.split('-')[0] ?? '')}`)
			const card = page.locator(`a[href="/profil/${profile.slug}"]`)
			await expect(card).toBeVisible()
			await expect(card.getByText(BADGE_LABEL, { exact: true })).toBeVisible()
			expect(await card.locator('a').count()).toBe(0)
			expect(await violationsSevere(page)).toEqual([])
			expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
			await shot(page, 'badge-carte')
		})
	})
}
