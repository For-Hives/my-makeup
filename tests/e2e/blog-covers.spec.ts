import { expect, type Page, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The generated illustrations of the blog (issue 1136): the list and the head of an article show a picture that
 * loads, is decorative, has the shape of its frame, and moves nothing (no layout shift), without a horizontal scroll
 * and with nothing serious for axe, at 1440 and 390 px.
 */

const suffix = Date.now().toString(36)
/** An address of the site online: its article has its own illustration (the others draw theirs from the pool). */
const OWN = 'essai-maquillage-mariee'
const slugs = [`essai-couverture-a-${suffix}`, `essai-couverture-b-${suffix}`, `essai-couverture-c-${suffix}`]
const identifiers: number[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	for (const [index, slug] of slugs.entries()) {
		identifiers.push(
			await createContent(request, 'articles', {
				title: `Essai de couverture ${index + 1} ${suffix}`,
				slug,
				excerpt: 'Un extrait fictif.',
				content: '## Une partie\n\nUn texte fictif.',
				_status: 'published',
			})
		)
		// `publishedAt` is written at the first publication: the order of the list follows it.
		const start = Date.now()
		await expect.poll(() => Date.now() - start, { intervals: [250] }).toBeGreaterThan(1100)
	}
})

test.afterAll(async ({ request }) => {
	for (const id of identifiers) await deleteContent(request, 'articles', id)
})

/** Scrolls the page through so the lazy pictures load, then waits for each of them. */
async function loadPictures(page: Page) {
	await page.evaluate(async () => {
		for (let y = 0; y < document.body.scrollHeight; y += 300) {
			window.scrollTo(0, y)
			await new Promise(done => requestAnimationFrame(() => done(null)))
		}
		window.scrollTo(0, 0)
	})
	await expect
		.poll(() =>
			page.evaluate(() =>
				[...document.querySelectorAll<HTMLImageElement>('[data-cover] img')].every(
					image => image.complete && image.naturalWidth > 0
				)
			)
		)
		.toBe(true)
}

const watchShifts = (page: Page) =>
	page.addInitScript(() => {
		const w = window as unknown as { __cls: number }
		w.__cls = 0
		new PerformanceObserver(list => {
			for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
				if (!entry.hadRecentInput) w.__cls += entry.value
		}).observe({ type: 'layout-shift', buffered: true })
	})

test.describe('Illustrations du blog', { tag: '@mobile' }, () => {
	test('la liste : chaque carte a son illustration décorative, à la forme de son cadre, sans décalage', async ({
		page,
	}) => {
		await watchShifts(page)
		await page.goto('/blog')
		await expect(page.getByRole('heading', { level: 1, name: 'Blog & News' })).toBeVisible()
		await loadPictures(page)

		const pictures = page.locator('[data-blog-card] [data-cover] img')
		expect(await pictures.count()).toBeGreaterThanOrEqual(3)
		const shapes = await pictures.evaluateAll(images =>
			images.map(image => {
				const box = image.getBoundingClientRect()
				return {
					alt: image.getAttribute('alt'),
					ratio: box.width / box.height,
					feature: image.closest('[data-featured]') !== null,
				}
			})
		)
		for (const { alt, ratio, feature } of shapes) {
			expect(alt).toBe('')
			// 4:3 for the large card, 5:4 for the others.
			expect(ratio).toBeCloseTo(feature ? 4 / 3 : 5 / 4, 1)
		}
		// Three articles that came from the pool or the table are not three copies of one picture.
		const sources = await pictures.evaluateAll(images =>
			images.map(image => new URL((image as HTMLImageElement).currentSrc).searchParams.get('url'))
		)
		expect(new Set(sources).size).toBeGreaterThanOrEqual(2)
		for (const source of sources) expect(source).toMatch(/^\/assets\/blog\/[a-z-]+\.webp$/)

		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0)
		expect(await violationsSevere(page)).toEqual([])
		await page.screenshot({
			path: `test-results/essais/blog-covers-list-${test.info().project.name}.png`,
			fullPage: true,
		})
	})

	test('un article : la même illustration que sur sa carte, en 16:7, sans décalage', async ({ page }) => {
		const slug = slugs[0] ?? ''
		await watchShifts(page)
		await page.goto('/blog')
		const onCard = await page
			.locator(`[data-blog-card]:has(a[href="/blog/${slug}"]) [data-cover] img`)
			.evaluate(image =>
				new URL((image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src).searchParams.get('url')
			)

		await page.goto(`/blog/${slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await loadPictures(page)
		const cover = page.locator('article [data-cover] img').first()
		await expect(cover).toHaveAttribute('alt', '')
		const box = await cover.boundingBox()
		if (!box) throw new Error('The cover is not on screen.')
		expect(box.width / box.height).toBeCloseTo(16 / 7, 1)
		expect(await cover.evaluate(image => new URL((image as HTMLImageElement).currentSrc).searchParams.get('url'))).toBe(
			onCard
		)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
		expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0)
		expect(await violationsSevere(page)).toEqual([])
		await page.screenshot({ path: `test-results/essais/blog-covers-article-${test.info().project.name}.png` })
	})

	test('un article du site a sa propre illustration, celle de son sujet', async ({ request, page }) => {
		// The address is the one of the site: both sizes would make it at once. The 1440 run is enough, the choice is not about size.
		if (test.info().project.name === 'mobile') return
		const id = await createContent(request, 'articles', {
			title: `Essai de couverture propre ${suffix}`,
			slug: OWN,
			_status: 'published',
		})
		try {
			await page.goto(`/blog/${OWN}`)
			await loadPictures(page)
			const source = await page
				.locator('article [data-cover] img')
				.first()
				.evaluate(image => new URL((image as HTMLImageElement).currentSrc).searchParams.get('url'))
			expect(source).toBe('/assets/blog/makeup-trial.webp')
		} finally {
			await deleteContent(request, 'articles', id)
		}
	})
})
