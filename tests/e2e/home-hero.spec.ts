import { expect, type Page, test } from '@playwright/test'
import { FILM_STILLS, FILM_VIDEOS } from '../../src/components/home/film'
import { SCREENS } from '../support/e2e'

/**
 * The home hero « en arche » (decision of 25/10/2026, docs/accueil.md), in a browser, at 390 px and 1440 px: the
 * film comes once the page is loaded and the arch is seen, plays its intro then swaps to the loop; the ring of the
 * badge turns only while the film plays and the ribbon slides, and the button of the badge stops all three and
 * starts them again. With reduced motion: the end still, no video, nothing turns, no button. With Save-Data: the end
 * still, no video. Without script: the end still over the poster, the whole heading, and no loop runs. The files of
 * the film are kept a year and served by ranges.
 *
 * The helpers that wait for every animation to end (`settle` of motion.spec.ts, `scrollThrough` of
 * home-sections.spec.ts) leave out the endless and paused animations: this file is what checks that they run.
 */

const ONLINE_H1 = "Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple"

/** The play state of the animation of an element (`running`, `paused`), or `none` when it has none. */
const playState = (page: Page, selector: string): Promise<string> =>
	page
		.locator(selector)
		.first()
		.evaluate(element => element.getAnimations()[0]?.playState ?? 'none')

/** The film waits for the arch to be on the screen: below the fold on a phone. */
async function showArch(page: Page): Promise<void> {
	await page.locator('.home-hero-arch').scrollIntoViewIfNeeded()
}

for (const size of [SCREENS.mobile, SCREENS.chromium]) {
	test.describe(`l’accueil en arche à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('le film joue, l’anneau tourne, le bandeau glisse ; le bouton du badge arrête tout, puis relance', async ({
			page,
		}) => {
			await page.goto('/')
			const hero = page.locator('section.home-hero')
			await expect(hero).toHaveAttribute('data-hero-motion', 'running')
			await expect.poll(() => playState(page, '.home-hero-ribbon-track')).toBe('running')

			await showArch(page)
			await expect(hero).toHaveAttribute('data-film', 'playing', { timeout: 20_000 })
			await expect.poll(() => playState(page, '.home-hero-ring')).toBe('running')
			const videos = page.locator('.home-hero-arch video')
			await expect(videos).toHaveCount(2)
			// The bundled Chromium has no H.264 decoder: it takes the AV1 file, the first of the list.
			expect(await videos.last().evaluate(video => (video as HTMLVideoElement).currentSrc)).toContain('.av1.mp4')

			// Off the screen the film pauses, and the ring with it: it turns only while the film plays.
			await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
			await expect(hero).not.toHaveAttribute('data-film', 'playing')
			expect(await playState(page, '.home-hero-ring')).toBe('paused')
			await expect(hero).toHaveAttribute('data-hero-motion', 'running')
			await showArch(page)
			await expect(hero).toHaveAttribute('data-film', 'playing')

			await page.getByRole('button', { name: 'Mettre le film en pause' }).click()
			await expect(hero).toHaveAttribute('data-hero-motion', 'paused')
			await expect(hero).not.toHaveAttribute('data-film', 'playing')
			expect(await playState(page, '.home-hero-ribbon-track')).toBe('paused')
			expect(await playState(page, '.home-hero-ring')).toBe('paused')
			expect(await videos.evaluateAll(elements => elements.every(video => (video as HTMLVideoElement).paused))).toBe(
				true
			)

			await page.getByRole('button', { name: 'Lire le film' }).click()
			await expect(hero).toHaveAttribute('data-film', 'playing')
			expect(await playState(page, '.home-hero-ribbon-track')).toBe('running')
			await expect.poll(() => playState(page, '.home-hero-ring')).toBe('running')
		})

		test('l’intro joue une fois, puis la boucle, chargée pendant l’intro, prend sa place', async ({ page }) => {
			await page.goto('/')
			await showArch(page)
			const phase = page.locator('[data-film-phase]')
			await expect(phase).toHaveAttribute('data-film-phase', 'intro', { timeout: 20_000 })
			const intro = page.locator('.home-hero-arch video:not([loop])')
			const loop = page.locator('.home-hero-arch video[loop]')
			await expect.poll(() => loop.evaluate(video => (video as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2)
			// To its last quarter of a second rather than waiting for it: the end is what is checked.
			await intro.evaluate(video => {
				const element = video as HTMLVideoElement
				element.currentTime = Math.max(0, element.duration - 0.25)
			})
			await expect(phase).toHaveAttribute('data-film-phase', 'loop')
			expect(await intro.evaluate(video => getComputedStyle(video).visibility)).toBe('hidden')
			expect(await loop.evaluate(video => getComputedStyle(video).visibility)).toBe('visible')
			await expect.poll(() => loop.evaluate(video => !(video as HTMLVideoElement).paused)).toBe(true)
		})

		test('le titre tient ses lignes, la police d’affichage est celle du titre seul', async ({ page }) => {
			await page.goto('/')
			const title = page.getByRole('heading', { level: 1 })
			await expect(title).toHaveText(ONLINE_H1)
			await expect(page.getByRole('heading', { level: 1, name: ONLINE_H1, exact: true })).toBeVisible()
			await page.evaluate(() => document.fonts.ready)
			const facts = await title.evaluate(element => {
				const style = getComputedStyle(element)
				const pills = [...element.querySelectorAll('img')].map(image => getComputedStyle(image).display)
				return {
					lines: Math.round(element.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)),
					family: style.fontFamily,
					lede: getComputedStyle(document.querySelector('.home-hero-lede') as Element).fontFamily,
					pills,
				}
			})
			expect(facts.family).toMatch(/bodoni/i)
			expect(facts.lede).not.toMatch(/bodoni/i)
			if (size.width >= 640) {
				expect(facts.lines).toBe(4)
				expect(facts.pills).toEqual(['inline-block', 'inline-block'])
			} else expect(facts.pills).toEqual(['inline-block', 'none'])
		})

		test('chaque texte en Bodoni est dessiné par sa coupe du dépôt, sans un glyphe de repli', async ({ page }) => {
			// The cuts are subsets (src/components/home/hero-font.ts): a character left out would be drawn by the fallback
			// serif, which the computed style does not say. Chromium does: the fonts that drew the text of a node.
			await page.goto('/')
			await page.evaluate(() => document.fonts.ready)
			const cdp = await page.context().newCDPSession(page)
			await cdp.send('DOM.enable')
			await cdp.send('CSS.enable')
			const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
			const drawnBy = async (selector: string): Promise<string[]> => {
				const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector })
				expect(nodeIds.length, selector).toBeGreaterThan(0)
				const faces = new Set<string>()
				for (const nodeId of nodeIds)
					for (const font of (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts)
						faces.add(font.isCustomFont ? font.postScriptName : `repli ${font.familyName}`)
				return [...faces].sort()
			}
			expect(await drawnBy('.home-hero-line')).toEqual(['BodoniModa-96pt', 'BodoniModaItalic-96ptItalic'])
			// The italic line by the italic cut alone: in a family without it, the upright cut would be slanted instead.
			expect(await drawnBy('.home-hero-title em')).toEqual(['BodoniModaItalic-96ptItalic'])
			expect(await drawnBy('.home-hero-step-number')).toEqual(['BodoniModaItalic-11ptItalic'])
			expect(await drawnBy('.home-hero-ribbon-list li')).toEqual(['BodoniModaItalic-11ptItalic'])
		})

		test('les trois lignes sous la recherche : le texte part du même bord, quelle que soit la largeur du numéro', async ({
			page,
		}) => {
			await page.goto('/')
			await page.evaluate(() => document.fonts.ready)
			const offsets = await page.locator('.home-hero-steps li').evaluateAll(items =>
				items.map(item => {
					const [number, text] = [...item.children].map(child => child.getBoundingClientRect().left)
					return Math.round((text ?? 0) - (number ?? 0))
				})
			)
			expect(offsets).toHaveLength(3)
			expect(new Set(offsets).size).toBe(1)
		})

		test('avec Save-Data : aucune vidéo, l’image de fin dans l’arche, et le bandeau s’arrête encore au bouton', async ({
			page,
		}) => {
			await page.addInitScript(() =>
				Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } })
			)
			await page.goto('/')
			await page.waitForLoadState('networkidle')
			await showArch(page)
			await expect(page.locator('[data-film-phase]')).toHaveAttribute('data-film-phase', 'still')
			const still = page.locator('[data-film-phase] img')
			await expect(still).toHaveJSProperty('complete', true)
			expect(await still.evaluate(image => (image as HTMLImageElement).currentSrc)).toContain(
				FILM_STILLS.end[0]?.src ?? 'fin'
			)
			await expect(page.locator('.home-hero-arch video')).toHaveCount(0)
			const hero = page.locator('section.home-hero')
			await expect(hero).not.toHaveAttribute('data-film', 'playing')
			await page.getByRole('button', { name: 'Mettre le film en pause' }).click()
			expect(await playState(page, '.home-hero-ribbon-track')).toBe('paused')
		})
	})
}

test.describe('avec un mouvement réduit', () => {
	test.use({ contextOptions: { reducedMotion: 'reduce' } })

	for (const size of [SCREENS.mobile, SCREENS.chromium]) {
		test(`à ${size.width} px : l’image de fin, aucune vidéo, rien ne tourne ni ne glisse, et pas de bouton`, async ({
			page,
		}) => {
			await page.setViewportSize(size)
			await page.goto('/')
			await page.waitForLoadState('networkidle')
			await showArch(page)
			const poster = page.locator('.home-hero-arch img')
			await expect(poster).toHaveJSProperty('complete', true)
			expect(await poster.evaluate(image => (image as HTMLImageElement).currentSrc)).toContain(
				FILM_STILLS.end[0]?.src ?? 'fin'
			)
			await expect(page.locator('section.home-hero')).not.toHaveAttribute('data-hero-motion')
			await expect(page.locator('.home-hero-arch video')).toHaveCount(0)
			await expect(page.locator('button.home-hero-disc')).toHaveCount(0)
			expect(await playState(page, '.home-hero-ring')).toBe('none')
			expect(await playState(page, '.home-hero-ribbon-track')).toBe('none')
		})
	}
})

/** The requests the page made for the two stills (poster and end), in order: the file and what asked for it. */
const stillRequests = (page: Page): Promise<{ file: string; by: string }[]> =>
	page.evaluate(() =>
		(performance.getEntriesByType('resource') as PerformanceResourceTiming[])
			.filter(entry => /\/ombre-nette-(debut|fin)-/.test(entry.name))
			.map(entry => ({ file: new URL(entry.name).pathname, by: entry.initiatorType }))
	)

/**
 * The last candidate of the largest paint, read before any scroll: whether it is the poster, when it was painted, and
 * when the poster was asked (`null`: not yet).
 */
const largestPaint = (page: Page): Promise<{ poster: boolean; paintedAt: number; posterAskedAt: number | null }> =>
	page.evaluate(async () => {
		const entries = await new Promise<PerformanceEntryList>(resolve =>
			new PerformanceObserver(list => resolve(list.getEntries())).observe({
				type: 'largest-contentful-paint',
				buffered: true,
			})
		)
		// `paintTime`: the end of the paint step of its frame (Chromium, since 2025); `renderTime` adds the time to show it.
		const last = entries.at(-1) as (LargestContentfulPaint & { paintTime?: number }) | undefined
		const asked = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find(entry =>
			/\/ombre-nette-(debut|fin)-/.test(entry.name)
		)
		return {
			poster: last?.element === document.querySelector('.home-hero-arch > picture img'),
			paintedAt: last?.paintTime ?? Number.NaN,
			posterAskedAt: asked?.startTime ?? null,
		}
	})

/** Two more screens than those of the projects: a tablet held upright, and a phone held sideways. */
const TABLET_UPRIGHT = { width: 768, height: 1024 } as const
const PHONE_SIDEWAYS = { width: 844, height: 390 } as const

/** Where the top of the arch is, against the height of the first screen (motion reduced: no rise, no mask). */
const archTop = (page: Page): Promise<{ top: number; fold: number }> =>
	page.evaluate(() => ({
		top: document.querySelector('.home-hero-arch')?.getBoundingClientRect().top ?? Number.NaN,
		fold: innerHeight,
	}))

test.describe('l’affiche de l’arche, demandée une fois, au bon moment', () => {
	// The poster is lazy: on a phone, upright or sideways, the arch is under the text, below the first screen, and a byte
	// asked before the largest paint delays it (LCP of P01). Where the arch is in the first screen, the poster is that
	// largest paint, and a preload in the head asks for it early (`POSTER_SCREENS` of film.ts: from 64rem, or a tablet held
	// upright). The preload must be the very file the <picture> takes, or the browser downloads two.
	for (const reducedMotion of ['no-preference', 'reduce'] as const) {
		const still = reducedMotion === 'reduce' ? FILM_STILLS.end : FILM_STILLS.start
		const file = still[0]?.src ?? 'avif'
		test.describe(`mouvement ${reducedMotion}`, () => {
			test.use({ contextOptions: { reducedMotion } })

			for (const screen of [SCREENS.chromium, TABLET_UPRIGHT])
				test(`à ${screen.width} × ${screen.height} px : l’arche dans le premier écran, l’affiche préchargée, un seul téléchargement, celui que l’image affiche`, async ({
					page,
				}) => {
					await page.setViewportSize(screen)
					await page.goto('/')
					await expect(page.locator('head link[rel="preload"][as="image"][href*="/ombre-nette-"]')).toHaveCount(2)
					const poster = page.locator('.home-hero-arch > picture img')
					await expect(poster).toHaveJSProperty('complete', true)
					expect(await poster.evaluate(image => (image as HTMLImageElement).currentSrc)).toContain(file)
					expect(await stillRequests(page)).toEqual([{ file, by: 'link' }])
					if (reducedMotion === 'reduce') {
						const { top, fold } = await archTop(page)
						expect(top).toBeLessThan(fold)
						// From the first frame. With motion the arch rises under a mask first (about 0.8 s), and whether Chromium
						// then counts the poster depends on when it was first painted: not checked there.
						expect((await largestPaint(page)).poster).toBe(true)
					}
				})

			test(`à ${SCREENS.mobile.width} px : rien n’est préchargé ; l’image la demande elle-même, une fois, jamais avant la plus grande peinture`, async ({
				page,
			}) => {
				await page.setViewportSize(SCREENS.mobile)
				await page.goto('/')
				await page.waitForLoadState('networkidle')
				// Before any scroll. Lazy, the poster is asked once the page is laid out, after the paint of its largest element
				// (with reduced motion in that very frame, after its paint and before it is shown), or not at all yet. Not lazy,
				// the parser would ask for it long before that paint.
				const before = await largestPaint(page)
				expect(before.poster).toBe(false)
				expect(before.paintedAt).toBeGreaterThan(0)
				if (before.posterAskedAt !== null) expect(before.posterAskedAt).toBeGreaterThanOrEqual(before.paintedAt)
				await showArch(page)
				const poster = page.locator('.home-hero-arch > picture img')
				await expect(poster).toHaveJSProperty('complete', true)
				expect(await poster.evaluate(image => (image as HTMLImageElement).currentSrc)).toContain(file)
				expect(await stillRequests(page)).toEqual([{ file, by: 'img' }])
			})

			// Wider than 768 px, but the arch is under the text, far below the first screen: no preload (it had one before).
			// The order against the largest paint is not checked here: with motion that paint is the pill of the lips, lazy
			// itself, painted once it has loaded, after the poster was asked.
			test(`à ${PHONE_SIDEWAYS.width} × ${PHONE_SIDEWAYS.height} px (téléphone couché) : l’arche sous le premier écran, rien n’est préchargé, l’image la demande elle-même, une fois`, async ({
				page,
			}) => {
				await page.setViewportSize(PHONE_SIDEWAYS)
				await page.goto('/')
				await page.waitForLoadState('networkidle')
				expect((await largestPaint(page)).poster).toBe(false)
				if (reducedMotion === 'reduce') {
					const { top, fold } = await archTop(page)
					expect(top).toBeGreaterThan(fold)
				}
				await showArch(page)
				const poster = page.locator('.home-hero-arch > picture img')
				await expect(poster).toHaveJSProperty('complete', true)
				expect(await poster.evaluate(image => (image as HTMLImageElement).currentSrc)).toContain(file)
				expect(await stillRequests(page)).toEqual([{ file, by: 'img' }])
			})
		})
	}
})

test.describe('sans script', () => {
	test.use({ javaScriptEnabled: false })

	test('l’image de fin, nette, sur l’affiche du début ; le titre entier, et aucune boucle ne tourne', async ({
		page,
	}) => {
		await page.goto('/')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(ONLINE_H1)
		await expect(page.locator('section.home-hero')).not.toHaveAttribute('data-hero-motion')
		expect(
			await page
				.locator('.home-hero-ring, .home-hero-ribbon-track')
				.evaluateAll(elements => elements.map(element => getComputedStyle(element).animationName))
		).toEqual(['none', 'none'])
		// The film that would bring the poster into focus never comes: the end still covers it.
		const still = page.locator('.home-hero-arch noscript img')
		await expect(still).toHaveJSProperty('complete', true)
		expect(await still.evaluate(image => (image as HTMLImageElement).currentSrc)).toContain(
			FILM_STILLS.end[0]?.src ?? 'fin'
		)
		const covers = await page.evaluate(() => {
			const arch = document.querySelector('.home-hero-arch')?.getBoundingClientRect()
			const box = document.querySelector('.home-hero-arch noscript img')?.getBoundingClientRect()
			return arch && box ? [box.width - arch.width, box.height - arch.height] : null
		})
		expect(covers?.map(Math.round)).toEqual([0, 0])
		await expect(page.locator('button.home-hero-disc')).toHaveCount(0)
	})
})

test('les fichiers du film sont gardés un an, du bon type, et servis par morceaux', async ({ request }) => {
	const intro = FILM_VIDEOS.intro[0]?.src ?? ''
	for (const [path, type] of [
		...[...FILM_VIDEOS.intro, ...FILM_VIDEOS.loop].map(source => [source.src, 'video/mp4'] as const),
		...[...FILM_STILLS.start, ...FILM_STILLS.end].map(source => [source.src, source.type] as const),
	]) {
		const whole = await request.get(path)
		expect(whole.status(), path).toBe(200)
		expect(whole.headers()['cache-control'], path).toBe('public, max-age=31536000, immutable')
		expect(whole.headers()['content-type'], path).toBe(type)
	}
	const part = await request.get(intro, { headers: { Range: 'bytes=0-99' } })
	expect(part.status()).toBe(206)
	expect(part.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/)
	expect((await part.body()).length).toBe(100)
})
