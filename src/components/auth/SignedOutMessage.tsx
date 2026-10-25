import Link from 'next/link'

/**
 * The word of explanation shown once on the sign-in page, after the old cookies were expired
 * (ticket 081). It replaces the announcement emails: it says what happened, what to do, and how to
 * get back in: with Google when the site has the button, or with a new password.
 */
export function SignedOutMessage({ google }: { google: boolean }) {
	return (
		<section
			role="status"
			data-testid="message-reconnexion"
			className="w-full max-w-sm rounded-art-field bg-white px-5 py-4 text-left text-sm ring-1 ring-art-line ring-inset"
		>
			<h2 className="font-display font-medium text-xl">Reconnecte-toi une fois</h2>
			<p className="mt-2">
				Le site a changé : ton ancienne connexion ne fonctionne plus.{' '}
				{google
					? 'Utilise le bouton « Se connecter avec Google », ou saisis ton email et ton mot de passe habituels, et c’est reparti.'
					: 'Saisis ton email et ton mot de passe habituels, et c’est reparti.'}
			</p>
			<p className="mt-2">
				Tu as oublié ton mot de passe ? Passe par{' '}
				<Link
					className="font-medium text-indigo-800 underline underline-offset-4 hover:text-indigo-950"
					href="/auth/mot-de-passe-oublie"
				>
					Mot de passe oublié
				</Link>{' '}
				pour en choisir un nouveau.
			</p>
		</section>
	)
}
