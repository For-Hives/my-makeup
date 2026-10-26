import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ART_LINK } from '@/components/art/form-classes'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { AuthShell } from '@/components/auth/AuthShell'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { SignUpForm } from '@/components/auth/SignUpForm'
import { isGoogleActive } from '@/lib/auth/google/config'
import { DEFAULT_DASHBOARD } from '@/lib/auth/return-to'
import { signedInArtist } from '@/lib/auth/session'
import { signUp } from './actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Inscription',
	description: 'Crée ton compte maquilleuse My Makeup.',
}

export default async function SignUpPage() {
	// Already signed in: the space, not a form (the same predicate as the sign-in page).
	if (await signedInArtist()) redirect(DEFAULT_DASHBOARD)

	return (
		<AuthShell
			title={
				<>
					S’
					<TitleAccent tone="berry" italic>
						inscrire
					</TitleAccent>
				</>
			}
			layout="split"
			footer={
				<>
					<p className="reveal">
						Déjà un compte ?{' '}
						<Link className={ART_LINK} href="/auth/signin">
							Connecte-toi
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
			{isGoogleActive() ? <GoogleButton libelle="S’inscrire avec Google" /> : null}
			<SignUpForm action={signUp} />
		</AuthShell>
	)
}
