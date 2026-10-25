import type { Metadata } from 'next'
import Link from 'next/link'
import { ART_LINK } from '@/components/art/form-classes'
import { AuthShell } from '@/components/auth/AuthShell'
import { ResendForm } from '@/components/auth/ResendForm'
import { resendEmail } from './actions'

export const metadata: Metadata = {
	title: 'Vérifie ton adresse email',
	description: 'Regarde ta boîte mail pour valider ton inscription sur My Makeup.',
}

// The wall of verification (ticket 082): where a new account lands, signed out, until she has
// followed the link of her mail. It shows nothing of the account. It offers to send the mail again
// (ticket 083): the same answer whatever the address.
export default function VerificationWall() {
	return (
		<AuthShell title="Vérifie ton adresse email My Makeup">
			<p className="max-w-sm text-mute">
				Regarde ta boîte mail pour valider ton inscription. Tu n’as pas reçu d’email ? Regarde dans tes spams !
			</p>
			<section aria-labelledby="titre-renvoi" className="flex w-full max-w-sm flex-col items-center gap-3">
				<h2 id="titre-renvoi" className="font-display font-medium text-2xl">
					Le mail n’arrive pas ?
				</h2>
				<ResendForm action={resendEmail} />
			</section>
			<p>
				<Link className={ART_LINK} href="/auth/signin">
					Retourner sur la page de connexion
				</Link>
			</p>
		</AuthShell>
	)
}
