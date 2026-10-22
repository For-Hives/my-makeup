import { expect, test } from '@playwright/test'
import { type PageProfile, setPageProfiles } from '../fixtures/page-profiles'
import { users } from '../support/lock'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The visual comparison of the key pages (issue 984; plan 02 E72): 9 pages at 3 widths against references taken on a
 * CI runner (tests/e2e/visual.spec.ts-snapshots/, one file per page and width, `-linux`). Played at night
 * (.github/workflows/nuit.yml) by `bun run test:e2e --project=visual`: it is a project of its own, which neither
 * screen size of the pull-request CI plays.
 *
 * The bench holds the made-up people of the page profiles (tests/fixtures/page-profiles.ts) and one talent with fixed
 * text, so the pages do not move from one night to the next. The references are never taken on a developer's machine:
 * fonts and anti-aliasing differ from one system to the next. The workflow .github/workflows/references-visuelles.yml
 * takes them on the runner and hands them over as a file; a change of look that is wanted is a new set of references,
 * committed with the change.
 */

/** The nine key pages. The addresses that hold a slug are built when the test runs. */
const VISUAL_PAGES: { name: string; path: () => string }[] = [
	{ name: 'home', path: () => '/' },
	{ name: 'search', path: () => '/search?city=Annecy' },
	{ name: 'profile', path: () => `/profil/${profileSlug()}` },
	{ name: 'talent', path: () => `/talent/${TALENT_SLUG}` },
	{ name: 'contact', path: () => '/contact' },
	{ name: 'legal-notice', path: () => '/mentions-legales' },
	{ name: 'sign-in', path: () => '/auth/signin' },
	{ name: 'sign-up', path: () => '/auth/signup' },
	{ name: 'forgotten-password', path: () => '/auth/mot-de-passe-oublie' },
]

/** Phone, tablet, desktop. */
const VISUAL_WIDTHS = [390, 768, 1440] as const

const TALENT_SLUG = 'essai-visuel-talent'
let talentId: number | undefined
let profiles: ReadonlyMap<string, PageProfile>

const profileSlug = (): string => {
	const found = profiles.get('reference')
	if (!found) throw new Error('pas de profil d’essai « reference »')
	return found.slug
}

// One worker for the whole file: one set-up and one clean-up serve all its tests.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	test.setTimeout(180_000)
	await users('profils-de-page', 1)
	profiles = await setPageProfiles()
	talentId = await createContent(request, 'talents', {
		title: 'Talent visuel',
		slug: TALENT_SLUG,
		pageTitle: 'Maquillage fictif : une maquilleuse près de chez vous',
		description: 'Une présentation écrite pour la comparaison visuelle.',
		content: '# Un titre du texte\n\nUn paragraphe avec du **gras**.\n',
		_status: 'published',
	})
})

test.afterAll(async ({ request }) => {
	test.setTimeout(180_000)
	if (talentId !== undefined) await deleteContent(request, 'talents', talentId)
	// The other files that use these profiles may still run: the last one to end takes them away.
	if ((await users('profils-de-page', -1)) > 0 || !profiles) return
	const payload = await testPayload()
	for (const { id } of profiles.values()) {
		const profile = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profile) continue
		await payload.delete({ collection: 'profiles', id })
		const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

for (const width of VISUAL_WIDTHS)
	test.describe(`${width} px`, () => {
		test.use({ viewport: { width, height: 900 } })

		for (const { name, path } of VISUAL_PAGES)
			test(`${name} looks like its reference`, async ({ page }) => {
				test.setTimeout(90_000)
				await page.goto(path())
				await page.waitForLoadState('networkidle')
				// Lazy images: go down the page once so that every one is asked for, then back up.
				await page.evaluate(async () => {
					for (let y = 0; y < document.body.scrollHeight; y += 600) {
						window.scrollTo(0, y)
						await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
					}
					window.scrollTo(0, 0)
				})
				await page.evaluate(() => document.fonts.ready)
				await page.waitForFunction(() => [...document.images].every(image => image.complete))
				await expect(page).toHaveScreenshot(`${name}-${width}.png`, {
					fullPage: true,
					animations: 'disabled',
					caret: 'hide',
					maxDiffPixelRatio: 0.01,
				})
			})
	})
