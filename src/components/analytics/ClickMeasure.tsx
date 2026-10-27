'use client'

import { useEffect } from 'react'
import { measureDelegatedClick } from '@/lib/analytics/delegated'
import { track } from '@/lib/analytics/track'

/**
 * The one listener of the public pages for the clicks the markup reports by itself (`data-cta`, `data-share`,
 * `data-card-origin`, the links of an article): see src/lib/analytics/delegated.ts. It listens in the capture phase,
 * so a handler of the page cannot hide a click, and takes the middle button too (a link opened in a new tab sends
 * no `click`). Renders nothing.
 */
export function ClickMeasure() {
	useEffect(() => {
		const count = (event: MouseEvent) => {
			measureDelegatedClick(
				event.target instanceof Element ? event.target : null,
				{ origin: location.origin, path: location.pathname },
				track
			)
		}
		const countMiddle = (event: MouseEvent) => {
			if (event.button === 1) count(event)
		}
		document.addEventListener('click', count, true)
		document.addEventListener('auxclick', countMiddle, true)
		return () => {
			document.removeEventListener('click', count, true)
			document.removeEventListener('auxclick', countMiddle, true)
		}
	}, [])
	return null
}
