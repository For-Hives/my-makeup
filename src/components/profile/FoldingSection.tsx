'use client'

import { type ReactNode, useEffect, useRef } from 'react'

/**
 * A card of the page of a profile that folds on a phone (ticket 304): skills, languages, courses and
 * experiences come after the prices and the portfolio, and a closed card is one line instead of a
 * screen. It is a native `<details>`: the summary is a tab stop and Enter or Space open it.
 *
 * The server sends it open. Without JavaScript, and on a computer, nothing is folded; on a phone the
 * browser closes it once the page is ready. The text is in the HTML either way, for a search engine.
 * The title stays an `h2`, inside the summary, which is where the HTML puts a heading of a `<details>`.
 */

const COMPUTER = '(min-width: 768px)'

const onComputer = (): boolean => typeof matchMedia === 'function' && matchMedia(COMPUTER).matches

export function FoldingSection({ titre, children }: { titre: string; children: ReactNode }) {
	const details = useRef<HTMLDetailsElement>(null)

	useEffect(() => {
		if (typeof matchMedia === 'function' && !onComputer() && details.current) details.current.open = false
	}, [])

	return (
		<section className="reveal w-full min-w-0 rounded border border-gray-300 bg-white">
			<details ref={details} open className="group">
				{/* biome-ignore lint/a11y/noStaticElementInteractions: summary is a native control; the handler only keeps it open on a computer */}
				<summary
					// On a computer the card is not a control: it stays open.
					onClick={event => {
						if (onComputer()) event.preventDefault()
					}}
					className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 pt-6 pb-6 group-open:pb-4 sm:px-8 sm:pt-8 md:cursor-default [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
				>
					<h2 className="font-bold text-gray-700 text-xl">{titre}</h2>
					<svg
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
						className="h-5 w-5 shrink-0 text-gray-700 transition-transform group-open:rotate-90 md:hidden"
					>
						<path
							fillRule="evenodd"
							d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
							clipRule="evenodd"
						/>
					</svg>
				</summary>
				<div className="flex w-full flex-col gap-4 px-6 pb-6 sm:px-8 sm:pb-8">{children}</div>
			</details>
		</section>
	)
}
