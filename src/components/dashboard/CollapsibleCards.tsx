'use client'

import { type ReactNode, useEffect, useRef } from 'react'

/**
 * A group of cards that is folded (ticket 307): « Pour aller plus loin ». A native `<details>`: its
 * summary is a button for the keyboard (Enter and Space) and for a screen reader.
 *
 * - The open state lives in the element itself, never in React: the page is rendered again after each
 *   save, and a group she opened stays open (nothing here sets `open` after the first render).
 * - A link to a card of the group (`#carte-langues`, in the list of what she lacks) opens the group
 *   first, then the browser goes to the card: the click is caught before the navigation, and a change
 *   of address made by other means (typed, back button, first load) is read as well. A browser does not
 *   open a folded `<details>` by itself for a fragment, and the support differs from one to the next.
 */
export function CollapsibleCards({ id, titre, children }: { id: string; titre: string; children: ReactNode }) {
	const details = useRef<HTMLDetailsElement>(null)

	useEffect(() => {
		const group = details.current
		if (group === null) return
		/** Opens the group when the fragment names something inside it. Gives back that element. */
		const open = (fragment: string): HTMLElement | null => {
			let name = fragment.startsWith('#') ? fragment.slice(1) : ''
			try {
				name = decodeURIComponent(name)
			} catch {
				// A fragment that is not valid text names nothing.
				return null
			}
			if (name === '') return null
			const target = document.getElementById(name)
			if (target === null || !group.contains(target)) return null
			group.open = true
			return target
		}
		const onClick = (evenement: MouseEvent) => {
			if (evenement.defaultPrevented || evenement.button !== 0) return
			const link = evenement.target instanceof Element ? evenement.target.closest('a[href^="#"]') : null
			// Opened before the navigation: the browser then scrolls to a card that is shown.
			if (link !== null) open(link.getAttribute('href') ?? '')
		}
		const onFragment = () => open(window.location.hash)?.scrollIntoView?.()
		onFragment()
		document.addEventListener('click', onClick, true)
		window.addEventListener('hashchange', onFragment)
		return () => {
			document.removeEventListener('click', onClick, true)
			window.removeEventListener('hashchange', onFragment)
		}
	}, [])

	return (
		<details
			ref={details}
			id={id}
			data-testid={id}
			className="group w-full min-w-0 rounded border border-neutral-300 bg-white"
		>
			<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded p-5 font-bold text-neutral-800 text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:px-6 [&::-webkit-details-marker]:hidden">
				<span>{titre}</span>
				<span aria-hidden="true" className="text-base transition-transform group-open:rotate-180">
					▾
				</span>
			</summary>
			<div className="flex flex-col gap-5 p-5 pt-0 sm:p-6 sm:pt-0">{children}</div>
		</details>
	)
}
