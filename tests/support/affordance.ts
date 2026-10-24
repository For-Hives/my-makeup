/**
 * What a hand on the mouse sees (issue 1068): every element that can be clicked shows the hand, every one that
 * cannot does not, a disabled one shows « not allowed », and a clickable one shows a hover, a keyboard focus and
 * an active state.
 *
 * This file holds what the end-to-end test (tests/e2e/interaction-affordance.spec.ts) and the inventory share:
 *  - `readAffordance`, read inside the browser, which lists the interactive elements of the open page with
 *    their computed `cursor` and the cursor they should have, and the elements that show the hand without
 *    being clickable;
 *  - `readStates`, which hovers, focuses and presses one element and reports what changed.
 *
 * Out of scope, by decision of the issue: the frame of the Cloudflare Turnstile widget, and the Payload
 * administration (`/admin`).
 */

import type { Page } from '@playwright/test'

/** One interactive element, or one element that shows the hand without being clickable. */
export interface AffordanceItem {
	/**
	 * `clickable`: should show the hand. `disabled`: should show « not allowed ». `plain`: must not show the hand.
	 * `inert`: a control that its component declares dead at this width (`cursor-default`, the folded cards of a
	 * profile on a computer): it must show no hover and no pressed state either.
	 * `covered`: a control under the pen that covers its block in the direct edition (the block is then one button):
	 * counted, never judged.
	 */
	role: 'clickable' | 'disabled' | 'plain' | 'inert' | 'covered'
	/** Why the element is clickable (the selector family that matched), or empty for a plain one. */
	why: string
	/** A short readable selector. */
	selector: string
	text: string
	cursor: string
	/** `aria-busy="true"`: the control is sending, and may show « wait » while it is disabled. */
	busy: boolean
	/** Tag, role, type and classes: one value for all the elements that are drawn the same way. */
	signature: string
	/** The index among the elements that `data-affordance-index` marks, to find the element again. */
	index: number
}

/**
 * The cursors a disabled element may show: « not allowed »; and « wait » when the control says it is busy (`aria-busy`,
 * a form that is sending, which also disables its button). The first is the rule; the second is how a component
 * says « wait », and `affordanceDefect` reads it from the item.
 */
export const DISABLED_CURSORS = ['not-allowed'] as const

/** Reads the open page. Pure DOM, no import: it is serialised into the browser. */
export function readAffordance(): AffordanceItem[] {
	const OUT_OF_SCOPE =
		'iframe, .cf-turnstile, [data-turnstile], nextjs-portal, #payload-admin, .payload__modal-container'
	const CLICKABLE = [
		'a[href]',
		'area[href]',
		'button',
		'summary',
		'select',
		'[role="button"]',
		'[role="link"]',
		'[role="tab"]',
		'[role="menuitem"]',
		'[role="switch"]',
		'[role="option"]',
		'[role="checkbox"]',
		'[role="radio"]',
		'input[type="checkbox"]',
		'input[type="radio"]',
		'input[type="file"]',
		'input[type="submit"]',
		'input[type="button"]',
		'input[type="reset"]',
		'input[type="image"]',
	].join(',')
	const PRESSABLE_INPUT = /^(checkbox|radio|file|submit|button|reset|image)$/

	const hasBox = (element: Element): boolean => {
		// Not drawn: display none, hidden, or inside a closed `<details>` (its content keeps a box, but is skipped).
		if (!element.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) return false
		const box = element.getBoundingClientRect()
		return box.width > 0 && box.height > 0
	}
	const isDisabled = (element: Element): boolean => {
		if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return true
		// A disabled control inside a `<details>` or a label still disables what points at it.
		return false
	}
	const labelControl = (element: Element): HTMLElement | null =>
		element instanceof HTMLLabelElement ? (element.control as HTMLElement | null) : null
	// A label is clicked like its control only when the control is pressed: a box, a radio, a file field. The
	// label of a text field or of a list only moves the focus, and keeps the arrow.
	const pressesControl = (control: HTMLElement | null): boolean =>
		control instanceof HTMLInputElement && PRESSABLE_INPUT.test(control.type)
	const reactClick = (element: Element): boolean => {
		for (const key of Object.keys(element)) {
			if (!key.startsWith('__reactProps$')) continue
			const props = (element as unknown as Record<string, { onClick?: unknown }>)[key]
			if (props && typeof props.onClick === 'function') return true
		}
		return false
	}
	/** Why this element can be clicked, or '' when it cannot. */
	const clickableWhy = (element: Element): string => {
		if (element.matches(CLICKABLE)) {
			if (element instanceof HTMLInputElement && element.type === 'hidden') return ''
			return element.tagName.toLowerCase()
		}
		if (element instanceof HTMLLabelElement && pressesControl(labelControl(element))) return 'label'
		return ''
	}
	/** The nearest clickable thing this element is part of (itself included), or null. */
	const ownerOf = (element: Element): Element | null => {
		for (let node: Element | null = element; node; node = node.parentElement) {
			if (clickableWhy(node)) return node
		}
		return null
	}
	const underBlockPen = (element: Element): boolean => {
		const pen = element.closest('[data-direct-edit]')?.querySelector(':scope > button.inset-0')
		return !!pen && !pen.contains(element)
	}
	const selectorOf = (element: Element): string => {
		const id = element.id ? `#${element.id}` : ''
		const classes = [...element.classList].slice(0, 2).map(name => `.${name}`)
		return `${element.tagName.toLowerCase()}${id}${classes.join('')}`
	}
	const signatureOf = (element: Element): string => {
		const classes = [...element.classList].sort().join(' ')
		return [
			element.tagName.toLowerCase(),
			element.getAttribute('role') ?? '',
			element.getAttribute('type') ?? '',
			classes,
		].join('|')
	}

	const items: AffordanceItem[] = []
	let index = 0
	const mark = (element: Element, kind: string): number => {
		element.setAttribute('data-affordance-kind', kind)
		element.setAttribute('data-affordance-index', String(index))
		return index++
	}
	for (const old of document.querySelectorAll('[data-affordance-index]')) old.removeAttribute('data-affordance-index')

	for (const element of document.body.querySelectorAll('*')) {
		if (element.closest(OUT_OF_SCOPE)) continue
		if (!hasBox(element)) continue
		const cursor = getComputedStyle(element).cursor
		const why = clickableWhy(element)
		const handler = !why && reactClick(element) ? 'react-onclick' : ''
		if (why || handler) {
			const control = labelControl(element)
			const disabled = isDisabled(element) || (control ? isDisabled(control) : false)
			// Two controls that are dead on purpose: one that its component says so (`cursor-default`), and what sits
			// under the pen that covers its block in the direct edition (the whole block is then one button).
			const dead = element.matches('.cursor-default, .md\\:cursor-default')
			const role = disabled ? 'disabled' : dead ? 'inert' : underBlockPen(element) ? 'covered' : 'clickable'
			items.push({
				role,
				why: why || handler,
				selector: selectorOf(element),
				text: (element.getAttribute('aria-label') ?? element.textContent ?? '')
					.trim()
					.replace(/\s+/g, ' ')
					.slice(0, 50),
				cursor,
				busy: element.getAttribute('aria-busy') === 'true',
				signature: signatureOf(element),
				index: mark(element, role),
			})
			continue
		}
		// Not clickable itself: it shows the hand only by inheritance from a clickable owner (a span in a link).
		if (cursor !== 'pointer') continue
		if (ownerOf(element)) continue
		let handlerOwner = false
		for (let node: Element | null = element; node; node = node.parentElement) {
			if (reactClick(node)) handlerOwner = true
		}
		if (handlerOwner) continue
		items.push({
			role: 'plain',
			why: '',
			selector: selectorOf(element),
			text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50),
			cursor,
			busy: false,
			signature: signatureOf(element),
			index: mark(element, 'plain'),
		})
	}
	return items
}

/** Whether an item is in the wrong. An empty string is « right »; otherwise what is wrong, in a few words. */
export function affordanceDefect(item: AffordanceItem): string {
	if (item.role === 'clickable' && item.cursor !== 'pointer') return `cliquable sans curseur main (${item.cursor})`
	const allowed = item.busy ? [...DISABLED_CURSORS, 'wait'] : [...DISABLED_CURSORS]
	if (item.role === 'disabled' && !allowed.includes(item.cursor))
		return `désactivé sans curseur interdit (${item.cursor})`
	if (item.role === 'plain') return 'non cliquable avec le curseur main'
	return ''
}

/**
 * The clickable elements that a click would not reach: another element, in front of them, takes the pointer
 * (a decorative image that overflows its section, a layer left over a link). Each is scrolled to the middle of the
 * screen and asked what sits under its center. Pure DOM, serialised. A skip link, drawn only on focus, is left out.
 */
export function readCovered(): string[] {
	const covered: string[] = []
	const CLICKABLE =
		'a[href], button, summary, select, label, [role="button"], [role="link"], input[type="checkbox"], input[type="radio"], input[type="file"]'
	for (const element of document.querySelectorAll<HTMLElement>('[data-affordance-index]')) {
		const kind = element.getAttribute('data-affordance-kind')
		if (kind !== 'clickable') continue
		if (element.matches('.sr-only') || element.closest('.sr-only')) continue
		element.scrollIntoView({ block: 'center', inline: 'center' })
		// A link that wraps over two lines has a box whose center may fall on the text beside it: ask its first line.
		const box = element.getClientRects()[0] ?? element.getBoundingClientRect()
		if (box.width < 4 || box.height < 4) continue
		const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
		if (!hit) continue
		const owner = hit.closest(CLICKABLE)
		if (element.contains(hit) || owner === element || (owner?.contains(element) ?? false)) continue
		if (hit instanceof HTMLLabelElement && hit.control === element) continue
		const name = (element.getAttribute('aria-label') ?? element.textContent ?? '')
			.trim()
			.replace(/\s+/g, ' ')
			.slice(0, 40)
		const front = `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(' ').slice(0, 2).join('.')}` : ''}`
		covered.push(`${element.tagName.toLowerCase()} « ${name} » est recouvert par ${front}`)
	}
	return covered
}

/** The states of one clickable element: what changed on hover, on keyboard focus, and while it is pressed. */
export interface States {
	hover: boolean
	focus: boolean
	active: boolean
	/** Contrast of the keyboard ring against what is behind it, or null when the ring is not an outline. */
	ringContrast: number | null
}

/** The look of an element and of its first descendants: what a hover, a focus or a press can change. */
function lookOf(selector: string): string {
	const root = document.querySelector(selector)
	if (!root) return ''
	// The element, what it holds, and the box around it: a pen that covers its block draws its hover on the block.
	const nodes = [
		root,
		...(root.parentElement ? [root.parentElement] : []),
		...[...root.querySelectorAll('*')].slice(0, 40),
	]
	return nodes
		.map(node => {
			const style = getComputedStyle(node)
			return [
				style.color,
				style.backgroundColor,
				style.borderTopColor,
				style.boxShadow,
				style.textDecorationLine,
				style.textDecorationColor,
				style.textDecorationThickness,
				style.textUnderlineOffset,
				style.transform,
				style.opacity,
				style.filter,
				style.outlineStyle === 'none' ? 'no-outline' : `${style.outlineWidth} ${style.outlineColor}`,
				style.display,
			].join(';')
		})
		.join('|')
}

/** The ring a keyboard focus draws on the element itself: an outline or a shadow. */
function ringOf(selector: string): string {
	const element = document.querySelector(selector)
	if (!element) return ''
	const style = getComputedStyle(element)
	const outline =
		style.outlineStyle === 'none' || Number.parseFloat(style.outlineWidth) === 0
			? ''
			: `outline ${style.outlineWidth} ${style.outlineColor}`
	const shadow = style.boxShadow === 'none' ? '' : `shadow ${style.boxShadow}`
	return `${outline}|${shadow}`
}

/** Cuts the transitions, so that a state is read at once and not half way through its fade. */
export async function freezeMotion(page: Page): Promise<void> {
	await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' })
}

/**
 * The contrast (WCAG ratio) between the outline of the element and the first opaque background found going up from
 * its parent, which is what sits behind a ring drawn outside the element. Colors are read through a canvas, which
 * turns `lab()` and `oklch()` (Tailwind 4) into RGB. Pure DOM, serialised.
 */
function contrastOf(selector: string): number | null {
	const element = document.querySelector(selector)
	if (!element) return null
	const style = getComputedStyle(element)
	if (style.outlineStyle === 'none' || Number.parseFloat(style.outlineWidth) === 0) return null
	const canvas = document.createElement('canvas')
	canvas.width = canvas.height = 1
	const context = canvas.getContext('2d', { willReadFrequently: true })
	if (!context) return null
	const rgba = (color: string): [number, number, number, number] => {
		context.clearRect(0, 0, 1, 1)
		context.fillStyle = '#000'
		context.fillStyle = color
		context.fillRect(0, 0, 1, 1)
		const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data
		return [r, g, b, a / 255]
	}
	const luminance = ([r, g, b]: [number, number, number, number]): number => {
		const channel = (value: number) => {
			const unit = value / 255
			return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
		}
		return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
	}
	let behind: [number, number, number, number] = [255, 255, 255, 1]
	for (let node = element.parentElement; node; node = node.parentElement) {
		const color = rgba(getComputedStyle(node).backgroundColor)
		if (color[3] > 0.99) {
			behind = color
			break
		}
	}
	const ring = rgba(style.outlineColor)
	const [light, dark] = [luminance(ring), luminance(behind)].sort((a, b) => b - a) as [number, number]
	return (light + 0.05) / (dark + 0.05)
}

/**
 * Hovers, focuses (with the keyboard as the last input, so that `:focus-visible` matches) and presses the
 * element that carries `data-affordance-index`, and says which of the three changed what it looks like.
 * Pressing is not clicking: the pointer leaves before it is released.
 */
export async function readStates(page: Page, index: number): Promise<States | null> {
	const selector = `[data-affordance-index="${index}"]`
	const target = page.locator(selector)
	if ((await target.count()) === 0) return null
	// Centered, so that the sticky header does not sit on the element the mouse is sent to.
	await target.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }))
	const box = await target.boundingBox()
	if (!box) return null
	await page.mouse.move(2, 2)
	const rest = await page.evaluate(lookOf, selector)
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	const hovered = await page.evaluate(lookOf, selector)
	await page.mouse.down()
	const pressed = await page.evaluate(lookOf, selector)
	await page.mouse.move(2, 2)
	await page.mouse.up()
	const restAgain = await page.evaluate(lookOf, selector)
	// The press focused the element (a field, a button): the keyboard ring is read from a blurred element.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
	await page.keyboard.press('Shift')
	const ringBefore = await page.evaluate(ringOf, selector)
	await target.focus()
	const ringAfter = await page.evaluate(ringOf, selector)
	const focused = await page.evaluate(lookOf, selector)
	const ringContrast = await page.evaluate(contrastOf, selector)
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
	return {
		hover: hovered !== rest,
		active: pressed !== hovered,
		focus: ringAfter !== '|' && (ringAfter !== ringBefore || focused !== restAgain),
		ringContrast,
	}
}
