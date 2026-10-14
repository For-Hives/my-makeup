'use client'

import { PageEnErreur } from '@/components/gabarit/PageEnErreur'

// The message and the trace of the error stay on the server, in its log: the visitor reads a sentence.
export default function ErreurDeLaPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
	return <PageEnErreur reessayer={retry} />
}
