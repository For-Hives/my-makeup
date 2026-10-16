import type { Metadata } from 'next'
import Link from 'next/link'
import { erreurDeLUrl } from '@/lib/auth/erreurs'

// Read per request: the sentence depends on the address.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Connexion impossible' }

/** What the page says for a code nobody knows, or for no code (the words of the current site). */
const MESSAGE_PAR_DEFAUT = 'Une erreur est survenue, réessaie dans quelques minutes.'

/**
 * The error page of the sign-in (ticket 228, `espace-erreur` of docs/migration/URLS.md): it answers 200
 * with or without a code, where the current site sent a code-less visit on to itself with a code. The
 * sentence comes from the closed list of `erreurDeLUrl`: the value of the address is never shown.
 */
export default async function PageDErreurDeConnexion({
	searchParams,
}: {
	searchParams: Promise<{ error?: string | string[] }>
}) {
	const { error } = await searchParams
	const message = erreurDeLUrl(error)?.message ?? MESSAGE_PAR_DEFAUT
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="font-semibold text-3xl">Connexion impossible</h1>
			<p
				role="alert"
				data-testid="auth-error-message"
				className="max-w-sm rounded-md bg-red-50 p-3 text-red-800 text-sm"
			>
				{message}
			</p>
			<Link className="underline" href="/auth/signin">
				Revenir à la connexion
			</Link>
		</main>
	)
}
