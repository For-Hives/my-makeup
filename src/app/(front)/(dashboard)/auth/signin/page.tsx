import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ART_LINK, ART_NOTICE } from '@/components/art/form-classes'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { AuthShell } from '@/components/auth/AuthShell'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { PasswordlessHelp } from '@/components/auth/PasswordlessHelp'
import { SignedOutMessage } from '@/components/auth/SignedOutMessage'
import { SignInForm } from '@/components/auth/SignInForm'
import { SignInPageEvents } from '@/components/auth/SignInPageEvents'
import { urlError } from '@/lib/auth/errors'
import { isGoogleActive } from '@/lib/auth/google/config'
import { MESSAGE_HEADER } from '@/lib/auth/legacy-cookies'
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
		<AuthShell
			title={
				<>
					Se{' '}
					<TitleAccent tone="berry" italic>
						connecter
					</TitleAccent>
				</>
			}
			layout="split"
			footer={
				<>
					<p className="reveal">
						Pas encore de compte ?{' '}
						<Link className={ART_LINK} href="/auth/signup">
							Inscris-toi
						</Link>
					</p>
					<p className="reveal">
						<Link className={ART_LINK} href="/" prefetch={false}>
							Retour à l’accueil
						</Link>
					</p>
				</>
			}
		>
			<SignInPageEvents code={urlFailure?.code ?? null} />
			{message ? (
				<p
					role="status"
					data-testid={urlFailure?.code === 'session-expiree' ? 'session-expiree' : 'erreur-google'}
					className={`max-w-sm ${ART_NOTICE.soft}`}
				>
					{message}
				</p>
			) : null}
			{signedOut ? <SignedOutMessage google={google} /> : null}
			{google ? <GoogleButton libelle="Se connecter avec Google" retour={returnTo} /> : null}
			<SignInForm action={signIn} retour={returnTo} />
			<PasswordlessHelp />
		</AuthShell>
	)
}
