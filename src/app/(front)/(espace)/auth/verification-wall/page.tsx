import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
	title: 'Vérifie ton adresse email',
	description: 'Regarde ta boîte mail pour valider ton inscription sur My Makeup.',
}

// The wall of verification (ticket 082): where a new account lands, signed out, until she has
// followed the link of her mail. It shows nothing of the account.
export default function MurDeVerification() {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="font-semibold text-3xl">Vérifie ton adresse email My Makeup</h1>
			<p className="max-w-sm text-neutral-700">
				Regarde ta boîte mail pour valider ton inscription. Tu n’as pas reçu d’email ? Regarde dans tes spams !
			</p>
			<p>
				<Link className="underline" href="/auth/signin">
					Retourner sur la page de connexion
				</Link>
			</p>
		</main>
	)
}
