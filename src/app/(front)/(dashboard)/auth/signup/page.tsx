import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
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
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="font-semibold text-3xl">S’inscrire</h1>
			{isGoogleActive() ? <GoogleButton libelle="S’inscrire avec Google" /> : null}
			<SignUpForm action={signUp} />
			<p>
				Déjà un compte ?{' '}
				<Link className="underline" href="/auth/signin">
					Connecte-toi
				</Link>
			</p>
			<p>
				<Link className="underline" href="/" prefetch={false}>
					Retour à l’accueil
				</Link>
			</p>
		</main>
	)
}
