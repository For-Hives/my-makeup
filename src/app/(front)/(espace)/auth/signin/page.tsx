import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FormulaireDeConnexion } from '@/components/auth/FormulaireDeConnexion'
import { messageDeLUrl } from '@/lib/auth/erreurs'
import { retourSur } from '@/lib/auth/retour'
import { maquilleuseConnectee } from '@/lib/auth/session'
import { seConnecter } from './actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Connexion',
	description: 'Connecte-toi à ton espace maquilleuse My Makeup.',
}

export default async function PageDeConnexion({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>
}) {
	const { callbackUrl, error } = await searchParams
	const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost'
	const retour = retourSur(callbackUrl, site)
	// A closed list: the code of the address is never copied to the screen.
	const message = messageDeLUrl(error)
	// Already signed in: the space, not a form (same predicate as the guard of the private pages).
	if (await maquilleuseConnectee()) redirect(retour)

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="font-semibold text-3xl">Se connecter</h1>
			{message ? (
				<p
					role="status"
					data-testid="session-expiree"
					className="max-w-sm rounded-md bg-amber-50 p-3 text-amber-900 text-sm"
				>
					{message}
				</p>
			) : null}
			<FormulaireDeConnexion action={seConnecter} retour={retour} />
			<p>
				<Link className="underline" href="/">
					Retour à l’accueil
				</Link>
			</p>
		</main>
	)
}
