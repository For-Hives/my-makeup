import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BoutonGoogle } from '@/components/auth/GoogleButton'
import { FormulaireDInscription } from '@/components/auth/SignUpForm'
import { googleEstActif } from '@/lib/auth/google/config'
import { ESPACE_PAR_DEFAUT } from '@/lib/auth/return-to'
import { maquilleuseConnectee } from '@/lib/auth/session'
import { sInscrire } from './actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Inscription',
	description: 'Crée ton compte maquilleuse My Makeup.',
}

export default async function PageDInscription() {
	// Already signed in: the space, not a form (the same predicate as the sign-in page).
	if (await maquilleuseConnectee()) redirect(ESPACE_PAR_DEFAUT)

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="font-semibold text-3xl">S’inscrire</h1>
			{googleEstActif() ? <BoutonGoogle libelle="S’inscrire avec Google" /> : null}
			<FormulaireDInscription action={sInscrire} />
			<p>
				Déjà un compte ?{' '}
				<Link className="underline" href="/auth/signin">
					Connecte-toi
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
