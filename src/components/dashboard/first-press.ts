import { type MouseEvent, type PointerEvent, useRef } from 'react'

/**
 * A control that must answer the first press (ticket 297). Pressing it takes the focus from the
 * field above, the list of suggestions closes on that blur, the control moves up and the release of
 * the finger lands beside it: the click never comes. So the action runs at the press itself, and the
 * click that may follow is ignored. A click with no press before it (the keyboard: Tab then Enter
 * or Space) runs the action as usual.
 *
 * The press does not take the focus (the mousedown that follows is cancelled), so the field keeps it
 * until the action has run.
 */
export function useFirstPress(action: () => void) {
	const pressed = useRef(false)
	return {
		onPointerDown(event: PointerEvent<HTMLElement>) {
			// Only the main button or a finger: a right click is not a press.
			if (event.button !== 0) return
			pressed.current = true
			action()
			swallowNextClick()
		},
		onMouseDown(event: MouseEvent<HTMLElement>) {
			event.preventDefault()
		},
		onClick(event: MouseEvent<HTMLElement>) {
			const followsPress = pressed.current && event.detail > 0
			pressed.current = false
			// A click of the keyboard has no press before it (detail 0): it runs the action, whatever was pressed before.
			if (!followsPress) action()
		},
	}
}

/** How long the click that follows a press may still arrive. */
const CLICK_WINDOW_MS = 600

/**
 * The action moved the layout: the click that ends the press lands on whatever now sits under the
 * finger (the control that replaced this one), and would trigger it. That one click is stopped
 * before it reaches the page.
 */
function swallowNextClick() {
	if (typeof document === 'undefined') return
	const stop = (event: Event) => {
		// A click of the keyboard (detail 0) is not the end of this press.
		if ((event as globalThis.MouseEvent).detail === 0) return
		event.stopPropagation()
		event.preventDefault()
		done()
	}
	const timer = setTimeout(() => done(), CLICK_WINDOW_MS)
	function done() {
		clearTimeout(timer)
		document.removeEventListener('click', stop, true)
		document.removeEventListener('pointerdown', done, true)
	}
	document.addEventListener('click', stop, true)
	// A new press is another gesture: the click of this one will not come.
	document.addEventListener('pointerdown', done, true)
}
