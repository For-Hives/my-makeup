'use client'

import type { MouseEvent } from 'react'

/**
 * « Aller au contenu » (ticket 304; audit UX, improvement 23): the first tab stop of every page. It is
 * hidden until it has the focus, and sends the focus to the `main` of the page, past the navigation.
 * The pages have each their own `main`, so the link looks for it when it is used. The address
 * `#contenu` is what the link leads to where JavaScript has not run: a `main` without an id is not
 * reachable then, which is why the link is a help for the keyboard and not a promise of the page.
 */
export function SkipLink() {
	const goToMain = (event: MouseEvent<HTMLAnchorElement>) => {
		const main = document.querySelector<HTMLElement>('main')
		if (!main) return
		event.preventDefault()
		if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
		main.focus()
		main.scrollIntoView?.({ block: 'start' })
	}
	return (
		// biome-ignore lint/a11y/useValidAnchor: a link to a place of the page; the click moves the focus into main
		<a
			href="#contenu"
			onClick={goToMain}
			className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-indigo-900 focus:shadow-lg focus:outline-2 focus:outline-indigo-600 focus:outline-offset-2"
		>
			Aller au contenu
		</a>
	)
}
