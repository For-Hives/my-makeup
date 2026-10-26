import { expect, type Page, test } from '@playwright/test'
import { SCREENS } from '../support/e2e'

/**
 * The home page below the hero (issue 1101), end to end, at 390 px and 1440 px: every section has a head and blocks
 * that wait below the fold and rise once when they come into view, in a short cascade; the sections are apart (room
 * above and below, a hairline, a numbered head); nothing is hidden without script, with reduced motion, and the words
 * of the community block are the ones of the site online.
 */

/** Words of the community block, copied from the site online: a rewrite would be a visible change. */
const COMMUNITY_WORDS = [
	'My-Makeup c’est avant tout une communauté',
	'Où les maquilleuses et les particuliers se retrouvent pour collaborer en toute simplicité.',
	'Des particuliers',
	'Aux multiples spécialités et personnalités',
	'Pensée et conçue pour collaborer',
	'Boostez votre activité',
	'Vous cherchez à vous épanouir dans votre carrière de maquilleuse professionnelle ? Ne cherchez plus, My-Makeup est la solution idéale pour vous !',
	'Pour toutes & tous !',
	'Trouvez le profil idéal en seulement deux clics',
	'Centralisez vos recherches dans une seule plateforme',
]

const SECTIONS = 'main > section.home-section'

async function scrollThrough(page: Page): Promise<void> {
	await page.evaluate(async () => {
		for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight / 3) {
			scrollTo(0, y)
			await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
		}
	})
	// The loops of the hero (the ring of the badge, the ribbon) and the banner of the kit repeat forever or wait in pause:
	// they never end, so they are left out on purpose. tests/e2e/home-hero.spec.ts checks that the loops of the hero run
	// and stop at the button of the badge.
	await page.evaluate(async () => {
		const ending = document
			.getAnimations()
			.filter(
				animation =>
					animation.playState !== 'paused' &&
					animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY
			)
		await Promise.all(ending.map(animation => animation.finished.catch(() => undefined)))
	})
}

for (const size of [SCREENS.mobile, SCREENS.chromium]) {
	test.describe(`1101 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('les sections sous le héros sont là, et chacune a un en-tête et des blocs qui attendent', async ({ page }) => {
			await page.goto('/')
			const sections = page.locator(SECTIONS)
			// The community, the project and the collaboration are always there; « Mise en avant » and the talents may be.
			expect(await sections.count()).toBeGreaterThanOrEqual(3)
			const report = await sections.evaluateAll(elements =>
				elements.map(element => ({
					top: element.getBoundingClientRect().top + scrollY,
					blocks: element.querySelectorAll('.reveal').length,
					waiting: element.querySelectorAll('.reveal[data-reveal="wait"]').length,
					head: element.querySelectorAll('.home-eyebrow').length,
					title: element.querySelectorAll('h2.reveal').length,
				}))
			)
			for (const section of report) {
				expect(section.head).toBe(1)
				expect(section.title).toBe(1)
				// The head (the hairline and the title) and at least one block: « Mise en avant » may hold a single card.
				expect(section.blocks).toBeGreaterThanOrEqual(3)
				// A section whose head is below the first screen hides its blocks until it comes into view.
				if (section.top > size.height) expect(section.waiting).toBeGreaterThan(0)
			}
		})

		test('chaque bloc monte une fois en entrant dans l’écran, les blocs d’un même passage en cascade, puis tout est entier', async ({
			page,
		}) => {
			await page.goto('/')
			const last = page.locator(SECTIONS).last()
			const head = last.locator('.home-eyebrow, h2.reveal')
			await expect(head.first()).toHaveAttribute('data-reveal', 'wait')
			await last.scrollIntoViewIfNeeded()
			await last.locator('h2.reveal').evaluate(element => element.scrollIntoView({ block: 'center' }))
			await expect(last.locator('h2.reveal')).toHaveAttribute('data-reveal', 'in')
			// The eyebrow and the title came into view together: two steps of the cascade (0, then 1 or more).
			const order = await head.evaluateAll(elements =>
				elements.map(element => Number((element as HTMLElement).style.getPropertyValue('--reveal-i')))
			)
			expect(new Set(order).size).toBe(order.length)
			await scrollThrough(page)
			const state = await page.evaluate(() => {
				const revealed = [...document.querySelectorAll<HTMLElement>('main > section.home-section .reveal')]
				return {
					count: revealed.length,
					notWhole: revealed.filter(
						element => Number(getComputedStyle(element).opacity) < 1 || getComputedStyle(element).transform !== 'none'
					).length,
					stillWaiting: revealed.filter(element => element.dataset.reveal === 'wait').length,
				}
			})
			expect(state.count).toBeGreaterThan(10)
			expect(state.notWhole).toBe(0)
			expect(state.stillWaiting).toBe(0)
		})

		test('les sections sont séparées : de l’air au-dessus et au-dessous, un filet ou un fond, une tête numérotée', async ({
			page,
		}) => {
			await page.goto('/')
			const room = size.width < 768 ? 64 : 96
			const report = await page.locator(SECTIONS).evaluateAll(elements =>
				elements.map(element => {
					const style = getComputedStyle(element)
					const eyebrow = element.querySelector('.home-eyebrow')
					return {
						top: Number.parseFloat(style.paddingTop),
						bottom: Number.parseFloat(style.paddingBottom),
						rule: Number.parseFloat(style.borderTopWidth) > 0,
						background: style.backgroundColor,
						// The browser gives the rule, not the number the counter reaches: the number is looked at in the capture.
						counter: getComputedStyle(element).counterIncrement,
						number: eyebrow ? getComputedStyle(eyebrow, '::before').content : null,
					}
				})
			)
			report.forEach((section, index) => {
				expect(section.top).toBeGreaterThanOrEqual(room)
				expect(section.bottom).toBeGreaterThanOrEqual(room)
				// Apart from its neighbour above: a hairline, or another tone.
				if (index > 0) expect(section.rule || section.background !== report[index - 1]?.background).toBe(true)
				// Each section counts once: the numbers run 01, 02… whatever sections exist.
				expect(section.counter).toBe('home-section 1')
				expect(section.number).toBe('counter(home-section, decimal-leading-zero)')
			})
			// The numbers are drawn by the style sheet: they are not in the text of the page nor in the accessibility tree.
			expect(await page.locator('.home-eyebrow').evaluateAll(es => es.every(e => e.textContent === ''))).toBe(true)
			expect(await page.locator('.home-eyebrow[aria-hidden="true"]').count()).toBe(report.length)
		})

		test('les textes de la communauté sont ceux du site en ligne, mot pour mot, et aucun défilement latéral', async ({
			page,
		}) => {
			await page.goto('/')
			const text = (await page.locator('main').innerText()).replaceAll(' ', ' ').replaceAll("'", '’')
			for (const words of COMMUNITY_WORDS) expect(text).toContain(words.replaceAll("'", '’'))
			await scrollThrough(page)
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		})
	})

	test.describe(`1101 sans mouvement à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('mouvement réduit : aucun bloc n’attend', async ({ browser }) => {
			const context = await browser.newContext({ viewport: size, reducedMotion: 'reduce' })
			const page = await context.newPage()
			await page.goto('/')
			expect(await page.locator('main [data-reveal]').count()).toBe(0)
			expect(
				await page.locator('main .reveal').evaluateAll(es => es.every(e => getComputedStyle(e).opacity === '1'))
			).toBe(true)
			await context.close()
		})

		test('sans JavaScript : toutes les sections sont là, entières', async ({ browser }) => {
			const context = await browser.newContext({ viewport: size, javaScriptEnabled: false })
			const page = await context.newPage()
			await page.goto('/')
			expect(await page.locator('main [data-reveal]').count()).toBe(0)
			expect(
				await page.locator('main .reveal').evaluateAll(es => es.every(e => getComputedStyle(e).opacity === '1'))
			).toBe(true)
			await expect(
				page.getByRole('heading', { name: 'Vous allez adorer cette nouvelle façon de collaborer' })
			).toBeAttached()
			await context.close()
		})
	})
}
