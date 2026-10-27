import Link from 'next/link'

/**
 * The help line of the sign-in page for the accounts that have no password of their own (ticket 093):
 * the ones that came from Facebook, which the site no longer offers, and the ones made with Google
 * that want a password too. Shown to everyone, whether Google is on or not, and whoever the visitor
 * is: it says nothing about any address. The way out is the forgotten password, which sends a link
 * to the address of the account and lets her choose one (src/lib/auth/password-reset-payload.ts).
 */
export function PasswordlessHelp() {
	return (
		<p data-testid="aide-sans-mot-de-passe" className="reveal max-w-sm text-left text-mute text-sm leading-6">
			Inscrite avec Facebook ou Google, sans mot de passe ? Clique sur{' '}
			<Link
				className="font-medium text-indigo-800 underline underline-offset-4 hover:text-indigo-950"
				href="/auth/mot-de-passe-oublie"
			>
				Mot de passe oublié
			</Link>{' '}
			pour en choisir un.
		</p>
	)
}
