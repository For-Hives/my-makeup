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
