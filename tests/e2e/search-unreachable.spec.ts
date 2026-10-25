import { expect, type Page, test } from '@playwright/test'
import { type PageProfile, pageProfilesUnderPrefix, setPageProfiles } from '../fixtures/page-profiles'
import { type SearchProfile, setSearchProfiles, TEST_WORD } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { testPayload } from '../support/payload-test'
import { refreshProfilePages } from '../support/public-pages'
import { openSessionWithoutPassword } from '../support/session'

/**
 * The screens ticket 291 changes, at 390 px and at 1440 px: the search (a profile with no way to be
 * reached goes last in its section and says so), her space (the line that tells her, with the link to
 * her contact card) and the terms of use (no quote form). On each screen: no horizontal scroll, every
 * link or button at least 44 px tall, and axe finds no « serious » or « critical » violation.
 * Set `SCREENSHOT_DIR` to a folder to keep the screenshots. All made-up people.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const
const UNREACHABLE_TEXT = 'Coordonnées pas encore indiquées'

let profiles: ReadonlyMap<string, SearchProfile>
let spaceProfiles: ReadonlyMap<string, PageProfile>

test.beforeAll(async () => {
	test.setTimeout(180_000)
	profiles = await setSearchProfiles()
	// Profiles of their own (« Dixsept ») for her space: the other page specs take theirs away at their end.
	spaceProfiles = await setPageProfiles(pageProfilesUnderPrefix('Dixsept'))
})

test.afterAll(async () => {
	test.setTimeout(180_000)
	const payload = await testPayload()
	for (const { id } of spaceProfiles.values()) {
		const profile = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profile) continue
		await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

async function shot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/291-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

/** The size checks of the ticket on the screen that is open. */
async function checkScreen(page: Page, label: string, targets = true): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	// Links that are part of a sentence are exempt from the target size (WCAG 2.5.8), the rest is not.
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('main a, main button, main summary')]
			.filter(element => {
				const box = element.getBoundingClientRect()
				if (box.width === 0 || box.height === 0) return false
				if (
					element.closest('p, li')?.textContent !== element.textContent &&
					element.tagName === 'A' &&
					element.closest('p')
				)
					return false
				return box.height < 44
			})
			.map(element => `${element.tagName} ${element.textContent?.trim().slice(0, 40)}`)
	)
	// The empty state is not changed by the ticket: its two links are the ones of ticket 098.
	if (targets) expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

for (const size of SIZES) {
	test.describe(`291 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('la recherche : joignables d’abord, puis les profils sans contact avec leur bandeau', async ({
			page,
			request,
		}) => {
			const reachable = profiles.get('reference')
			const unreachable = profiles.get('sans-contact-public')
			if (!reachable || !unreachable) throw new Error('profils d’essai manquants')
			// The directory of the search is cached by Next: an earlier spec of the shard may have cached it before these profiles.
			await refreshProfilePages(request, reachable)
			await page.goto(`/search?search=${encodeURIComponent(TEST_WORD)}&city=Annecy`)
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

			const links = page.locator('main a[href^="/profil/"]')
			const hrefs = await links.evaluateAll(items => items.map(item => item.getAttribute('href')))
			const first = hrefs.indexOf(`/profil/${reachable.slug}`)
			const last = hrefs.indexOf(`/profil/${unreachable.slug}`)
			expect(first).toBeGreaterThanOrEqual(0)
			expect(last).toBeGreaterThan(first)

			const cardOf = (slug: string) => page.locator('article', { has: page.locator(`a[href="/profil/${slug}"]`) })
			const card = cardOf(unreachable.slug)
			await expect(card).toContainText(UNREACHABLE_TEXT)
			await expect(cardOf(reachable.slug)).not.toContainText(UNREACHABLE_TEXT)
			await expect(card.getByRole('button')).toHaveCount(0)
			await checkScreen(page, 'recherche')
			await shot(page, 'recherche')
		})

		test('la recherche sans résultat', async ({ page }) => {
			await page.goto('/search?search=zzqqxxyy&city=Annecy')
			await expect(page.getByRole('heading', { level: 1 })).toContainText('Aucun résultat')
			await checkScreen(page, 'recherche vide', false)
			await shot(page, 'recherche-vide')
		})

		test('son espace : le message et le lien vers le bloc des coordonnées', async ({ context, page }) => {
			const profile = spaceProfiles.get('sans-contact-public')
			if (!profile) throw new Error('profil d’essai manquant')
			const payload = await testPayload()
			const sheet = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0, select: { pro: true } })
			const pro = typeof sheet.pro === 'object' ? sheet.pro.id : sheet.pro
			if (pro === undefined || pro === null) throw new Error('pas de compte')
			const session = await openSessionWithoutPassword(payload, { collection: 'pros', id: pro })
			await context.addCookies(session.cookies)
			await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${size.width % 200}` })

			await page.goto('/auth/profil')
			const message = page.getByTestId('avancement-sans-contact')
			await expect(message).toContainText('Sans moyen de contact, ton profil passe après les autres dans la recherche.')
			const link = message.getByRole('link', { name: 'Ajouter mes coordonnées' })
			await expect(link).toHaveAttribute('href', '/auth/apercu-profil?mode=edition#bloc-contacts')
			await checkScreen(page, 'espace')
			await shot(page, 'espace')
		})

		test('les CGU : le formulaire de devis est décrit (issue 1003)', async ({ page }) => {
			await page.goto('/cgu')
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			await expect(page.locator('main')).toContainText('7. Demandes de devis')
			await checkScreen(page, 'cgu')
			await shot(page, 'cgu')
		})
	})
}
