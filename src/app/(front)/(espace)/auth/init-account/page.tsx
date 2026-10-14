import type { Metadata } from 'next'
import Link from 'next/link'
import { PAGE_D_ACCUEIL_DU_COMPTE } from '@/lib/auth/retour'
import { exigerMaquilleuse } from '@/lib/auth/session'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Bienvenue' }

// The onboarding of a new account, reduced to its arrival (ticket 082): the steps that fill the
// profile come with the tickets of the space. Her empty profile and its address already exist.
export default async function PageDAccueilDuCompte() {
	const maquilleuse = await exigerMaquilleuse(PAGE_D_ACCUEIL_DU_COMPTE)
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-3xl">Bienvenue sur My Makeup</h1>
			<p>
				{maquilleuse.nom || 'Bienvenue'}, ton compte est prêt. Il te reste à remplir ton profil pour apparaître dans
				l’annuaire.
			</p>
			<p>
				<Link className="underline" href="/auth/profil">
					Aller à mon espace
				</Link>
			</p>
		</main>
	)
}
