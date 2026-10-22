'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { EditSession } from './EditSession'

/** The session of the edit mode on her page: a save reads the page again (the data of the server, not a guess). */
export function OwnerEditSession({ children }: { children: ReactNode }) {
	const router = useRouter()
	return <EditSession refresh={() => router.refresh()}>{children}</EditSession>
}
