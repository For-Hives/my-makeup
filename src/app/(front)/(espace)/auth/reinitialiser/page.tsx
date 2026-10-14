import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import { FormulaireDeReinitialisation } from '@/components/auth/FormulaireDeReinitialisation'
import { COOKIE_DE_REINITIALISATION, MESSAGES_MOT_DE_PASSE, PAGE_DE_LA_DEMANDE } from '@/lib/auth/mot-de-passe-oublie'
import { lienEncoreValable } from '@/lib/auth/reinitialisation-payload'
import { choisirLeMotDePasse } from './actions'

// Read per request: it depends on the cookie of the link, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Nouveau mot de passe',
	description: 'Choisis un nouveau mot de passe pour ton espace maquilleuse My Makeup.',
	// The link carries a secret until the proxy has moved it into a cookie: no Referer, ever.
	referrer: 'no-referrer',
}

/**
 * The second step of the forgotten password (ticket 085). The link of the mail is moved into a cookie
 * by the proxy and this page is reached without its code. A link that is past its hour, spent, or
 * from the old site says so here, before any form (ticket 086), and never ends in an error page.
 */
export default async function PageDeReinitialisation() {
	const jeton = (await cookies()).get(COOKIE_DE_REINITIALISATION)?.value
	const payload = await getPayload({ config })
	const etat = !jeton ? 'code-absent' : (await lienEncoreValable(payload, jeton)) ? 'valable' : 'code-invalide'

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="font-semibold text-3xl">Nouveau mot de passe</h1>
			{etat === 'valable' ? (
				<FormulaireDeReinitialisation action={choisirLeMotDePasse} />
			) : (
				<>
					<p role="alert" data-testid="lien-perime" className="max-w-sm rounded-md bg-red-50 p-3 text-red-800 text-sm">
						{MESSAGES_MOT_DE_PASSE[etat]}
					</p>
					<Link
						className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
						href={PAGE_DE_LA_DEMANDE}
					>
						Demander un nouveau lien
					</Link>
				</>
			)}
		</main>
	)
}
