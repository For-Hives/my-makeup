import type { Metadata } from 'next'
import Link from 'next/link'
import { ART_LINK, ART_NOTICE } from '@/components/art/form-classes'
import { AuthShell } from '@/components/auth/AuthShell'
import { urlError } from '@/lib/auth/errors'

// Read per request: the sentence depends on the address.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Connexion impossible' }

/** What the page says for a code nobody knows, or for no code (the words of the current site). */
const DEFAULT_MESSAGE = 'Une erreur est survenue, réessaie dans quelques minutes.'

/**
 * The error page of the sign-in (ticket 228, `espace-erreur` of docs/migration/URLS.md): it answers 200
 * with or without a code, where the current site sent a code-less visit on to itself with a code. The
 * sentence comes from the closed list of `urlError`: the value of the address is never shown.
 */
export default async function SignInErrorPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string | string[] }>
}) {
	const { error } = await searchParams
	const message = urlError(error)?.message ?? DEFAULT_MESSAGE
	return (
		<AuthShell title="Connexion impossible">
			<p role="alert" data-testid="auth-error-message" className={`max-w-sm ${ART_NOTICE.error}`}>
				{message}
			</p>
			<Link className={ART_LINK} href="/auth/signin">
				Revenir à la connexion
			</Link>
		</AuthShell>
	)
}
