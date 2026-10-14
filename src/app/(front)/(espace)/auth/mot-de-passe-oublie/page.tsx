import type { Metadata } from 'next'
import Link from 'next/link'
import { FormulaireMotDePasseOublie } from '@/components/auth/FormulaireMotDePasseOublie'
import { demanderLeLien } from './actions'

export const metadata: Metadata = {
	title: 'Mot de passe oublié',
	description: 'Reçois par email un lien pour choisir un nouveau mot de passe My Makeup.',
}

// The first step of the forgotten password (ticket 085).
export default function PageMotDePasseOublie() {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="font-semibold text-3xl">Mot de passe oublié</h1>
			<FormulaireMotDePasseOublie action={demanderLeLien} />
			<p>
				<Link className="underline" href="/auth/signin">
					Revenir à la connexion
				</Link>
			</p>
		</main>
	)
}
