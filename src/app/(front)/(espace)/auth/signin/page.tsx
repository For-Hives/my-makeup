import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PasswordlessHelp } from '@/components/auth/PasswordlessHelp'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { SignInPageEvents } from '@/components/auth/SignInPageEvents'
import { SignInForm } from '@/components/auth/SignInForm'
import { SignedOutMessage } from '@/components/auth/SignedOutMessage'
import { MESSAGE_HEADER } from '@/lib/auth/legacy-cookies'
import { urlError } from '@/lib/auth/errors'
import { isGoogleActive } from '@/lib/auth/google/config'
import { safeReturnTo } from '@/lib/auth/return-to'
import { signedInArtist } from '@/lib/auth/session'
import { signIn } from './actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Connexion',
	description: 'Connecte-toi à ton espace maquilleuse My Makeup.',
}

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>
}) {
	const { callbackUrl, error } = await searchParams
	const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost'
	const returnTo = safeReturnTo(callbackUrl, site)
	// A closed list: the code of the address is never copied to the screen.
	const urlFailure = urlError(error)
	const message = urlFailure?.message ?? null
	const google = isGoogleActive()
	// Already signed in: the space, not a form (same predicate as the guard of the private pages).
	if (await signedInArtist()) redirect(returnTo)

	// Set by the proxy alone, on the first visit after the old cookies were expired (ticket 081).
	const signedOut = (await headers()).get(MESSAGE_HEADER) === '1'

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<SignInPageEvents code={urlFailure?.code ?? null} />
			<h1 className="font-semibold text-3xl">Se connecter</h1>
			{message ? (
				<p
					role="status"
					data-testid={urlFailure?.code === 'session-expiree' ? 'session-expiree' : 'erreur-google'}
					className="max-w-sm rounded-md bg-amber-50 p-3 text-amber-900 text-sm"
				>
					{message}
				</p>
			) : null}
			{signedOut ? <SignedOutMessage google={google} /> : null}
			{google ? <GoogleButton libelle="Se connecter avec Google" retour={returnTo} /> : null}
			<SignInForm action={signIn} retour={returnTo} />
			<PasswordlessHelp />
			<p>
				Pas encore de compte ?{' '}
				<Link className="underline" href="/auth/signup">
					Inscris-toi
				</Link>
			</p>
			<p>
				<Link className="underline" href="/">
					Retour à l’accueil
				</Link>
			</p>
		</main>
	)
}
