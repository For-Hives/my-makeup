'use client'

import { MESSAGE_VERIFICATION_IMPOSSIBLE } from '@/lib/auth/erreurs'

// The space cannot check the session for now (a passing outage): the cookie is untouched, nobody
// is signed out. The message and the trace of the error stay in the server log; she reads a sentence.
export default function ErreurDeLEspace({
	unstable_retry,
}: {
	error: Error & { digest?: string }
	unstable_retry: () => void
}) {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-3xl">Un souci passager</h1>
			<p role="alert" data-testid="verification-impossible">
				{MESSAGE_VERIFICATION_IMPOSSIBLE}
			</p>
			<button
				type="button"
				onClick={() => unstable_retry()}
				className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
			>
				Réessayer
			</button>
		</main>
	)
}
