import { expect, type Locator, type Page, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The hover of the public site (issue 1137, docs/mouvement.md, docs/navbar.md), at 390 px and 1440 px: the group of the
 * bar that holds the current page is ringed like « Blog », a blog card is washed and not shadowed, the chips under an
 * article ease their fill, and nothing moves around a hovered control. The hover is a mouse thing: a phone has no hover,
 * so the phone width checks the rest state, the 44 px targets, the sideways scroll and the rings.
 */

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navigation principale' })

/** Every page of every group of the bar, and the group it belongs to. */
const GROUP_PAGES: readonly (readonly [string, string])[] = [
	['/pourquoi-utiliser-my-makeup-en-tant-que-particulier', 'Particulier'],
	['/particulier/trouver-une-maquilleuse', 'Particulier'],
	['/particulier/centraliser-ses-recherches', 'Particulier'],
	['/particulier/explorer-les-profils', 'Particulier'],
	['/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse', 'Maquilleuse'],
	['/maquilleuse/partenariats', 'Maquilleuse'],
	['/solutions/pour-les-particuliers', 'Solutions'],
	['/solutions/pour-les-maquilleuses', 'Solutions'],
]
const GROUPS = ['Particulier', 'Maquilleuse', 'Solutions']

/** Waits for React to have hydrated the element, or a click lands on nothing. */
const hydrated = (locator: Locator) =>
	expect
		.poll(() => locator.evaluate(element => Object.keys(element).some(key => key.startsWith('__reactProps'))))
		.toBe(true)

/** Opens the menu of the narrow bar once React has hydrated its button: an earlier click opens nothing. */
async function openMenu(page: Page) {
	const menu = page.getByRole('button', { name: 'Menu' })
	await hydrated(menu)
	await menu.click()
	await expect(menu).toHaveAttribute('aria-expanded', 'true')
}

/** The wash behind a card: its colour, how long it takes and how far it reaches. */
const washOf = (card: Locator) =>
	card.evaluate(element => {
		const wash = getComputedStyle(element, '::before')
		return {
			background: wash.backgroundColor,
			duration: wash.transitionDuration,
			inset: wash.top,
			shadow: getComputedStyle(element).boxShadow,
		}
	})

/** The alpha of a computed `rgba(...)` or `rgb(...)` colour, or 0 for `transparent`. */
function alpha(color: string): number {
	if (color === 'transparent') return 0
	const channels = color.match(/[\d.]+/g)?.map(Number) ?? []
	return channels.length === 4 ? (channels[3] ?? 1) : 1
}

/** The positions of what surrounds a card must not change while it is hovered. */
async function frames(page: Page, selector: string) {
	return page
		.locator(selector)
		.evaluateAll(elements => elements.map(element => JSON.stringify(element.getBoundingClientRect().toJSON())))
}

/** Waits until the transitions of the page are over (the marquee and the spinning marks loop for ever, they are not waited for): the reveal rises the cards by 28 px when they come into view. */
const still = (page: Page) =>
	page.evaluate(() =>
		Promise.all(
			document
				.getAnimations()
				.filter(animation => animation instanceof CSSTransition)
				.map(animation => animation.finished.catch(() => undefined))
		)
	)

const noSidewaysScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const size of [SCREENS.mobile, SCREENS.chromium]) {
	test.describe(`à ${size.width} px`, () => {
		test.use({ viewport: size })

		test.describe('le groupe de la page courante, dans la barre', () => {
			for (const [path, group] of GROUP_PAGES) {
				test(`${path} entoure « ${group} » d’une ellipse, et d’aucun autre groupe`, async ({ page }) => {
					await page.goto(path)
					if (size.width < 1024) {
						await openMenu(page)
					}
					for (const name of GROUPS) {
						const button = nav(page).getByRole('button', { name, exact: true })
						const ellipse = button.locator('svg[viewBox="0 0 124 54"]')
						if (name === group) {
							await expect(button).toHaveAttribute('data-current-group', '')
							await expect(ellipse).toHaveCount(1)
							await expect(ellipse).toBeVisible()
							// One mark only: the bar that slides under an entry gives way to the ellipse.
							expect(await button.evaluate(element => getComputedStyle(element, '::after').content)).toBe('none')
							const box = await button.boundingBox()
							expect(box?.height).toBeGreaterThanOrEqual(44)
						} else {
							await expect(button).not.toHaveAttribute('data-current-group')
							await expect(ellipse).toHaveCount(0)
						}
					}
					// « Blog » is not ringed here, and no group button claims to be the page: `aria-current` stays on the link of the panel.
					await expect(nav(page).getByRole('link', { name: 'Blog', exact: true })).not.toHaveAttribute('aria-current')
					for (const name of GROUPS)
						await expect(nav(page).getByRole('button', { name, exact: true })).not.toHaveAttribute('aria-current')
				})
			}

			test('la page courante du groupe garde son aria-current dans le panneau, et le panneau s’ouvre comme avant', async ({
				page,
			}) => {
				await page.goto('/solutions/pour-les-particuliers')
				if (size.width < 1024) await openMenu(page)
				const button = nav(page).getByRole('button', { name: 'Solutions', exact: true })
				await hydrated(button)
				await button.click()
				await expect(button).toHaveAttribute('aria-expanded', 'true')
				await expect(nav(page).getByRole('link', { name: 'Pour les particuliers' })).toHaveAttribute(
					'aria-current',
					'page'
				)
				expect(await violationsSevere(page)).toEqual([])
			})

			test('sur « Blog » et hors des groupes, seul « Blog » a son ellipse', async ({ page }) => {
				for (const path of ['/blog', '/search', '/']) {
					await page.goto(path)
					if (size.width < 1024) await openMenu(page)
					for (const name of GROUPS)
						await expect(
							nav(page).getByRole('button', { name, exact: true }).locator('svg[viewBox="0 0 124 54"]')
						).toHaveCount(0)
					const blog = nav(page).getByRole('link', { name: 'Blog', exact: true })
					await expect(blog.locator('svg[viewBox="0 0 124 54"]')).toHaveCount(path === '/blog' ? 1 : 0)
				}
			})
		})
	})
}

test.describe('le survol, sur ordinateur', () => {
	test.use({ viewport: SCREENS.chromium })
	const suffix = Date.now().toString(36)
	const slugs = [`essai-survol-a-${suffix}`, `essai-survol-b-${suffix}`]
	const identifiers: number[] = []

	test.describe.configure({ mode: 'serial' })

	test.beforeAll(async ({ request }) => {
		test.setTimeout(120_000)
		for (const slug of slugs)
			identifiers.push(
				await createContent(request, 'articles', {
					title: `Essai ${slug}`,
					slug,
					excerpt: 'Un extrait fictif pour le survol.',
					_status: 'published',
				})
			)
		await expect
			.poll(async () => (await (await request.get('/blog')).text()).includes(`href="/blog/${slugs[1]}"`))
			.toBe(true)
	})

	test.afterAll(async ({ request }) => {
		test.setTimeout(120_000)
		for (const id of identifiers) await deleteContent(request, 'articles', id)
	})

	test('une carte du blog se lave au survol : aucune ombre, un fond qui déborde de 20 px, en 400 ms, rien ne bouge', async ({
		page,
	}) => {
		await page.goto('/blog')
		for (const selector of ['[data-article-card]', '[data-featured]']) {
			const card = page.locator(selector).first()
			await card.scrollIntoViewIfNeeded()
			await page.mouse.move(2, 2)
			await expect.poll(async () => alpha((await washOf(card)).background)).toBe(0)
			// The reveal flips a card from `wait` to `in` once it is seen: measure after, and after its 600 ms rise.
			await expect
				.poll(() => card.evaluate(element => element.closest('.reveal')?.getAttribute('data-reveal') ?? 'in'))
				.not.toBe('wait')
			await still(page)
			const before = await frames(page, '[data-blog-card]')
			const rest = await washOf(card)
			expect(rest.shadow, selector).toBe('none')
			expect(rest.inset, selector).toBe('-20px')
			expect(rest.duration, selector).toContain('0.4s')

			const box = await card.boundingBox()
			await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2)
			await expect.poll(async () => alpha((await washOf(card)).background), selector).toBeGreaterThan(0.1)
			const hovered = await washOf(card)
			// No hard shadow: the old one drew a dark edge around a card that has no background.
			expect(hovered.shadow, selector).toBe('none')
			expect(await frames(page, '[data-blog-card]'), selector).toEqual(before)
			expect(await noSidewaysScroll(page), selector).toBe(true)
			// The line under « Lire l’article » slides in with the hover.
			await expect
				.poll(
					() => card.locator('.read-more-label').evaluate(element => getComputedStyle(element, '::after').transform),
					selector
				)
				.toBe('matrix(1, 0, 0, 1, 0, 0)')
		}
	})

	test('sous l’article, les pastilles de partage ont un fond qui se fond, sans trait de soulignement ni bloc', async ({
		page,
	}) => {
		await page.goto(`/blog/${slugs[0]}`)
		const share = page.getByTestId('partage')
		await share.scrollIntoViewIfNeeded()
		for (const name of [/Par e-mail/, /LinkedIn/, /Facebook/]) {
			const chip = share.getByRole('link', { name })
			await page.mouse.move(2, 2)
			const before = await chip.boundingBox()
			const rest = await chip.evaluate(element => {
				const style = getComputedStyle(element)
				return {
					background: style.backgroundColor,
					property: style.transitionProperty,
					duration: style.transitionDuration,
				}
			})
			// The fill and the border ease, in the 200 ms of the site.
			expect(rest.property).toContain('background-color')
			expect(rest.property).toContain('border-color')
			expect(rest.duration).toBe('0.2s')
			await chip.hover()
			await expect
				.poll(() => chip.evaluate(element => getComputedStyle(element).backgroundColor))
				.not.toBe(rest.background)
			expect(await chip.evaluate(element => getComputedStyle(element).textDecorationLine)).toBe('none')
			expect(await chip.boundingBox()).toEqual(before)
			expect(before?.height).toBeGreaterThanOrEqual(44)
		}
		const back = share.locator('a').first()
		await back.hover()
		expect(await back.evaluate(element => getComputedStyle(element).textDecorationLine)).toBe('none')
	})

	test('les ronds et les liens du pied de page adoucissent leur survol aux jetons du site', async ({ page }) => {
		await page.goto('/')
		const footer = page.getByRole('contentinfo')
		await footer.scrollIntoViewIfNeeded()
		const links = footer.locator('a')
		expect(await links.count()).toBeGreaterThan(3)
		const durations = await links.evaluateAll(elements => [
			...new Set(elements.map(element => getComputedStyle(element).transitionDuration)),
		])
		expect(durations).toEqual(['0.2s'])
		const properties = await links.first().evaluate(element => getComputedStyle(element).transitionProperty)
		expect(properties).toContain('border-color')
	})

	test('mouvement réduit : le fond d’une carte du blog apparaît tout de suite, sans transition', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await page.goto('/blog')
		const card = page.locator('[data-blog-card]').first()
		await expect(card).toBeVisible()
		await card.scrollIntoViewIfNeeded()
		const box = await card.boundingBox()
		await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2)
		await expect.poll(async () => alpha((await washOf(card)).background)).toBeGreaterThan(0.1)
		// 0.01 ms is read back by the browser as « 1e-05s ».
		expect(Number.parseFloat((await washOf(card)).duration)).toBeLessThan(0.001)
	})
})
