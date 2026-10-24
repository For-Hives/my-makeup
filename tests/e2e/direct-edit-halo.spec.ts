import { expect, type Page, test } from '@playwright/test'
import { checkScreen, editHarness, SIZES, shot as shotOf } from '../support/direct-edit-e2e'

/**
 * The halo of an editable block (issue 1070), at 390 px and at 1440 px: for every block of her page the
 * halo that shows on hover, on focus and while the editor is open has the rectangle and the radius of the
 * block, to the pixel (1 px at most), and no block changes size or position when it is hovered,
 * focused or opened (no layout shift). Set `SCREENSHOT_DIR` to keep the screenshots.
 */

const shot = (page: Page, name: string) => shotOf(page, '1070', name)

interface Measure {
	id: string
	wrapper: { x: number; y: number; width: number; height: number }
	content: { x: number; y: number; width: number; height: number }
	halo: { x: number; y: number; width: number; height: number }
	haloRadius: number
	contentRadius: number
	wrapperRadius: number
	haloShadow: string
	round: boolean
}

/** The rectangle and radius of the wrapper, of the content it draws, and of its halo, for each block. */
async function measure(page: Page, id: string): Promise<Measure> {
	return page.evaluate(blockId => {
		const wrapper = document.querySelector<HTMLElement>(`[data-direct-edit="${blockId}"]`)
		if (!wrapper) throw new Error(`bloc ${blockId} absent`)
		const halo = wrapper.querySelector<HTMLElement>(':scope > [data-direct-edit-halo]')
		const content = [...wrapper.children].find(
			child => !(child as HTMLElement).hasAttribute('data-direct-edit-halo') && child.tagName !== 'BUTTON'
		) as HTMLElement | undefined
		const clear = wrapper.querySelector<HTMLElement>(':scope > [data-direct-edit-halo]')
		if (!(halo && content && clear)) throw new Error(`bloc ${blockId} sans halo ou sans contenu`)
		const box = (element: Element) => {
			const { x, y, width, height } = element.getBoundingClientRect()
			return { x: x + window.scrollX, y: y + window.scrollY, width, height }
		}
		const radius = (element: Element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)
		return {
			id: blockId,
			wrapper: box(wrapper),
			content: box(content),
			halo: box(halo),
			haloRadius: radius(halo),
			contentRadius: radius(content),
			wrapperRadius: radius(wrapper),
			haloShadow: getComputedStyle(halo).boxShadow,
			round: getComputedStyle(wrapper).borderTopLeftRadius !== '22px',
		}
	}, id)
}

const SAME = 1
function sameBox(a: Measure['halo'], b: Measure['halo'], label: string) {
	for (const key of ['x', 'y', 'width', 'height'] as const)
		expect(Math.abs(a[key] - b[key]), `${label} : ${key}`).toBeLessThanOrEqual(SAME)
}

for (const size of SIZES) {
	test.describe(`1070 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })
		test.describe.configure({ timeout: 180_000 })
		const { open } = editHarness(size)

		test('le halo suit la taille, la position et l’arrondi de chaque bloc, sans décalage', async ({
			context,
			page,
		}) => {
			await open(page, context, 'reference')
			const ids = await page
				.locator('[data-direct-edit]')
				.evaluateAll(blocks => blocks.map(block => block.getAttribute('data-direct-edit') ?? ''))
			// Every block of the page: header (photo, identity, place, status) and body.
			expect(ids.length, 'blocs trouvés').toBeGreaterThanOrEqual(11)
			const resting = new Map<string, Measure>()
			for (const id of ids) resting.set(id, await measure(page, id))

			for (const id of ids) {
				const wrapper = page.locator(`[data-direct-edit="${id}"]`)
				const button = wrapper.locator(':scope > button')
				await wrapper.scrollIntoViewIfNeeded()
				const before = await measure(page, id)
				// Hover (a mouse) or focus (touch and keyboard): the halo is on.
				if (size.touch) await button.focus()
				else await wrapper.hover()
				// The colour comes in with a short transition: wait until it is the lipstick red, whole.
				await expect
					.poll(async () => (await measure(page, id)).haloShadow, { message: `${id} : halo coloré` })
					.toMatch(/rgb\(176, 41, 74\) 0px 0px 0px \d+px inset/)
				const during = await measure(page, id)
				sameBox(during.halo, during.content, `${id} : halo / bloc`)
				sameBox(during.halo, during.wrapper, `${id} : halo / cadre`)
				expect(
					Math.abs(during.haloRadius - during.contentRadius),
					`${id} : arrondi du halo / bloc`
				).toBeLessThanOrEqual(1)
				if (!during.round) expect(during.contentRadius, `${id} : arrondi d’une carte`).toBe(22)
				else
					expect(during.contentRadius, `${id} : arrondi d’une pastille`).toBeGreaterThanOrEqual(
						Math.min(during.content.width, during.content.height) / 2 - 1
					)
				// Nothing moves or grows.
				sameBox(during.wrapper, before.wrapper, `${id} : cadre au survol`)
				sameBox(during.content, before.content, `${id} : bloc au survol`)
			}
			await shot(page, 'survol')

			// While one editor is open, the block keeps its rectangle (the others are dimmed, not moved).
			const first = ids[0] as string
			const wrapperOfFirst = page.locator(`[data-direct-edit="${first}"]`)
			const restingFirst = resting.get(first) as Measure
			await wrapperOfFirst.locator(':scope > button').click()
			await expect(page.locator('[data-direct-edit-editor]')).toBeVisible()
			const open1 = await measure(page, first)
			await expect
				.poll(async () => (await measure(page, first)).haloShadow)
				.toMatch(/rgb\(176, 41, 74\) 0px 0px 0px 3px inset/)
			sameBox(open1.halo, open1.content, `${first} : halo ouvert / bloc`)
			sameBox(open1.wrapper, { ...restingFirst.wrapper, y: open1.wrapper.y }, `${first} : taille ouverte`)
			await checkScreen(page, 'halo ouvert')
			await shot(page, 'edition')
		})
	})
}
