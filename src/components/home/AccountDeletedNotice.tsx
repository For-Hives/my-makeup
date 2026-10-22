'use client'

import { useEffect, useState } from 'react'
import { takeAccountDeleted } from '@/lib/account-deleted'

/**
 * « Ton compte est supprimé » at the top of the home page, for the person who has just deleted her account
 * (ticket 305). The zone `role="status"` is always there, empty, so that the message is announced when it
 * arrives; the page stays the same cached page for everyone, the tab says who just left
 * (src/lib/account-deleted.ts).
 */
export function AccountDeletedNotice() {
	const [deleted, setDeleted] = useState(false)
	useEffect(() => {
		setDeleted(takeAccountDeleted())
	}, [])
	return (
		<div role="status" data-testid="compte-supprime">
			{deleted && (
				<p className="mx-auto max-w-2xl px-4 py-4 text-center font-semibold text-green-900 text-sm md:px-0">
					<span className="block rounded-md bg-green-50 p-4">
						Ton compte est supprimé. Ta page publique et tes photos ne sont plus en ligne.
					</span>
				</p>
			)}
		</div>
	)
}
