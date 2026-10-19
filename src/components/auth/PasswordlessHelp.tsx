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
		<p data-testid="aide-sans-mot-de-passe" className="max-w-sm rounded-md bg-neutral-100 p-3 text-left text-sm">
			Tu t’étais inscrite avec Facebook ? Ce bouton n’existe plus : clique sur{' '}
			<Link className="font-medium underline" href="/auth/mot-de-passe-oublie">
				Mot de passe oublié
			</Link>{' '}
			pour recevoir un lien et choisir ton mot de passe. Ça marche aussi si tu t’es inscrite avec Google et que tu veux
			un mot de passe en plus.
		</p>
	)
}
