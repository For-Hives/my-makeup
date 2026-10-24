import { expect, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'

/**
 * The design pass on the public content pages (issue 1102), in a browser at 390 and 1440 px: the display face on
 * the titles, a reading measure on the text, no horizontal scroll, no layout shift (the faces are swapped in with a
 * size-adjusted fallback), nothing waiting with reduced motion, and no serious accessibility violation. The words
 * are held by tests/unit/content-pages-design.test.tsx.
 */
const URLS = [
	'/a-propos',
	'/contact',
	'/demande-envoyee',
	'/maquilleuse/partenariats',
	'/particulier/trouver-une-maquilleuse',
	'/particulier/centraliser-ses-recherches',
	'/particulier/explorer-les-profils',
	'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
	'/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
	'/solutions/pour-les-maquilleuses',
	'/solutions/pour-les-particuliers',
	'/cgu',
	'/mentions-legales',
	'/politique-de-confidentialite',
] as const

test.describe('Les pages de contenu', { tag: '@mobile' }, () => {
	for (const url of URLS) {
		test(`${url} : polices de la direction artistique, mesure de lecture, aucun défilement latéral, aucun décalage, axe`, async ({
			page,
		}) => {
			await page.addInitScript(() => {
				const w = window as unknown as { __cls: number; __shifts: string[] }
				w.__cls = 0
				w.__shifts = []
				new PerformanceObserver(list => {
					for (const entry of list.getEntries() as unknown as {
						value: number
						hadRecentInput: boolean
						sources: { node: Element | null }[]
					}[])
						if (!entry.hadRecentInput) {
							w.__cls += entry.value
							w.__shifts.push(
								`${entry.value.toFixed(4)} ${entry.sources.map(({ node }) => node?.nodeName.toLowerCase()).join(',')}`
							)
						}
				}).observe({ type: 'layout-shift', buffered: true })
			})
			const response = await page.goto(url)
			expect(response?.status()).toBe(200)
			await page.evaluate(() => document.fonts.ready)

			// The title takes the display face, the page the body face.
			const faces = await page.evaluate(() => ({
				h1: getComputedStyle(document.querySelector('h1') as Element).fontFamily,
				// The thank-you page has no h2: its title is the h1.
				h2: getComputedStyle((document.querySelector('main h2') ?? document.querySelector('h1')) as Element).fontFamily,
				main: getComputedStyle(document.querySelector('main') as Element).fontFamily,
			}))
			expect(faces.h1).toMatch(/bodoni/i)
			expect(faces.h2).toMatch(/bodoni/i)
			expect(faces.main).toMatch(/instrument/i)

			// A paragraph of the article is never wider than a reading line (about 72 characters).
			const wide = await page.evaluate(() =>
				[...document.querySelectorAll('main section p, main article p')]
					.map(paragraph => ({
						text: paragraph.textContent ?? '',
						em: paragraph.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(paragraph).fontSize),
					}))
					// 66 characters of this face are about 46 em wide: 48 leaves the rounding, and refuses a line past 72.
					.filter(({ em, text }) => em > 48 && text.length > 30)
			)
			expect(wide).toEqual([])

			// Scroll the page through: the reveal moves blocks, never the layout.
			await page.evaluate(async () => {
				for (let y = 0; y <= document.documentElement.scrollHeight; y += innerHeight / 2) {
					scrollTo(0, y)
					await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
				}
				scrollTo(0, 0)
			})
			// Not 0: the faces are swapped in with a size-adjusted fallback (see « Mon espace » in motion.spec.ts).
			const shifts = await page.evaluate(() => (window as unknown as { __cls: number; __shifts: string[] }).__shifts)
			expect(shifts.join(' | ')).toBe(
				shifts.length === 0 || shifts.reduce((sum, line) => sum + Number.parseFloat(line), 0) < 0.005
					? shifts.join(' | ')
					: 'no shift'
			)
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
			expect(await violationsSevere(page)).toEqual([])
		})
	}

	test.describe('avec un mouvement réduit', () => {
		test.use({ contextOptions: { reducedMotion: 'reduce' } })

		test('rien n’attend, rien ne bouge', async ({ page }) => {
			await page.goto('/particulier/trouver-une-maquilleuse')
			const hidden = await page
				.locator('.reveal')
				.evaluateAll(
					elements =>
						elements.filter(
							element =>
								Number(getComputedStyle(element).opacity) < 1 ||
								getComputedStyle(element).transform !== 'none' ||
								element.getAttribute('data-reveal') === 'wait'
						).length
				)
			expect(hidden).toBe(0)
			expect(await page.locator('.reveal').count()).toBeGreaterThan(3)
		})
	})
})
