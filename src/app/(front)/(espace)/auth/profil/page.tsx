import type { Metadata } from 'next'
import { BoutonsDeDeconnexion } from '@/components/auth/BoutonsDeDeconnexion'
import { exigerMaquilleuse } from '@/lib/auth/session'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon espace' }

// The space of the makeup artist, reduced to what the tickets so far need: she is in, and she can leave (ticket 078). The profile editor comes later.
export default async function PageProfil() {
	const maquilleuse = await exigerMaquilleuse('/auth/profil')
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-3xl">Mon espace</h1>
			<p>Bonjour {maquilleuse.nom || 'toi'}, tu es connectée.</p>
			<BoutonsDeDeconnexion />
		</main>
	)
}
