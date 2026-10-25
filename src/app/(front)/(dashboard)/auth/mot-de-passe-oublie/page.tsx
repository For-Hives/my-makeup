import type { Metadata } from 'next'
import Link from 'next/link'
import { ART_LINK } from '@/components/art/form-classes'
import { AuthShell } from '@/components/auth/AuthShell'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { forgotPassword } from './actions'

export const metadata: Metadata = {
	title: 'Mot de passe oublié',
	description: 'Reçois par email un lien pour choisir un nouveau mot de passe My Makeup.',
}

// The first step of the forgotten password (ticket 085).
export default function ForgotPasswordPage() {
	return (
		<AuthShell title="Mot de passe oublié">
			<ForgotPasswordForm action={forgotPassword} />
			<p>
				<Link className={ART_LINK} href="/auth/signin">
					Revenir à la connexion
				</Link>
			</p>
		</AuthShell>
	)
}
