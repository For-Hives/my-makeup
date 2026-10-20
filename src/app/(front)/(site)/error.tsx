'use client'

import { MesureDErreur } from '@/components/analytics/MesureDePage'
import { ErrorPage } from '@/components/layout/ErrorPage'

// The message and the trace of the error stay on the server, in its log: the visitor reads a sentence.
// Next 16 gives the retry as `unstable_retry`; the event keeps only a scope and a code (ticket 145).
export default function PageError({
	error,
	unstable_retry,
}: {
	error: Error & { digest?: string }
	unstable_retry: () => void
}) {
	return (
		<>
			<MesureDErreur scope="site" erreur={error} />
			<ErrorPage reessayer={unstable_retry} />
		</>
	)
}
