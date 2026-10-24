'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { trackViewChange } from '@/lib/dashboard/analytics'
import { previewPath } from '@/lib/direct-edit/edit-mode'
import { EditSession } from './EditSession'

/** The session of the edit mode on her page: a save reads the page again (the data of the server, not a guess). */
export function OwnerEditSession({ children }: { children: ReactNode }) {
	const router = useRouter()
	return (
		<EditSession
			refresh={() => router.refresh()}
			navigate={href => {
				// She goes to see her page as a visitor does: one `profile_visibility`, counted once she has gone.
				if (href === previewPath()) trackViewChange(true)
				router.push(href)
			}}
		>
			{children}
		</EditSession>
	)
}
