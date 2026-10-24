'use client'

import { useEffect, useRef, useState } from 'react'
import { TURNSTILE_UNAVAILABLE_FIELD } from '@/lib/contact/turnstile-fields'

/** The part of Cloudflare's `window.turnstile` this widget uses. */
interface TurnstileApi {
	render: (
		container: HTMLElement,
		options: {
			sitekey: string
			appearance: 'interaction-only'
			callback: () => void
			'error-callback': () => void
			'timeout-callback': () => void
		}
	) => string
	reset: (widgetId: string) => void
	remove: (widgetId: string) => void
}

declare global {
	interface Window {
		turnstile?: TurnstileApi
	}
}

export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** How long the script is given to load before the form says the check is unavailable. */
const SCRIPT_DEADLINE_MS = 10_000

/**
 * The Turnstile widget of the contact form (ticket 1000), « managed » and `interaction-only`: nothing is
 * drawn unless Cloudflare doubts the visitor. Cloudflare adds the field `cf-turnstile-response` to the
 * form once the check is done.
 *
 * When the script cannot load (a blocker, Cloudflare down) or the widget fails, the form sets the hidden
 * field `turnstile-unavailable`: the server then lets the message through under a tight brake instead of
 * blocking a real visitor (src/lib/contact/turnstile.ts).
 *
 * The token is single use: the widget starts again after each answer of the server (`answer` changes).
 */
export function TurnstileWidget({ siteKey, answer }: { siteKey: string; answer: number }) {
	const container = useRef<HTMLDivElement>(null)
	const widget = useRef<string | undefined>(undefined)
	const [unavailable, setUnavailable] = useState(false)

	useEffect(() => {
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | undefined
		const render = () => {
			if (cancelled || !container.current || !window.turnstile || widget.current !== undefined) return
			clearTimeout(timer)
			widget.current = window.turnstile.render(container.current, {
				sitekey: siteKey,
				appearance: 'interaction-only',
				callback: () => setUnavailable(false),
				'error-callback': () => setUnavailable(true),
				'timeout-callback': () => setUnavailable(false),
			})
		}
		if (window.turnstile) render()
		else {
			let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`)
			if (!script) {
				script = document.createElement('script')
				script.src = TURNSTILE_SCRIPT
				script.async = true
				document.head.appendChild(script)
			}
			script.addEventListener('load', render)
			script.addEventListener('error', () => !cancelled && setUnavailable(true))
			timer = setTimeout(() => !cancelled && !widget.current && setUnavailable(true), SCRIPT_DEADLINE_MS)
		}
		return () => {
			cancelled = true
			clearTimeout(timer)
			if (widget.current !== undefined) window.turnstile?.remove(widget.current)
			widget.current = undefined
		}
	}, [siteKey])

	// A token is spent by the answer: ask for a new one.
	useEffect(() => {
		if (widget.current !== undefined) window.turnstile?.reset(widget.current)
	}, [answer])

	return (
		<>
			<div ref={container} data-testid="turnstile" className="mt-6 flex justify-center empty:hidden" />
			{unavailable ? <input type="hidden" name={TURNSTILE_UNAVAILABLE_FIELD} value="1" /> : null}
		</>
	)
}
