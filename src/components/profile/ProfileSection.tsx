import type { ReactNode } from 'react'

/**
 * A card of the page of a profile: a title (h2) and what it holds. The caller leaves a card out when it
 * has nothing to show, so a title is never alone.
 */
export function ProfileSection({ titre, children }: { titre: string; children: ReactNode }) {
	return (
		<section className="reveal w-full min-w-0 rounded border border-gray-300 bg-white p-6 sm:p-8">
			<div className="flex w-full flex-col gap-4">
				<h2 className="font-bold text-gray-700 text-xl">{titre}</h2>
				{children}
			</div>
		</section>
	)
}
