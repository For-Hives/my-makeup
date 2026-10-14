import type { Metadata } from 'next'
import { exigerMaquilleuse } from '@/lib/auth/session'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon espace' }

// The space of the makeup artist, reduced to what ticket 074 needs: she is in. The profile editor comes later.
export default async function PageProfil() {
	const maquilleuse = await exigerMaquilleuse('/auth/profil')
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
			<h1 className="font-semibold text-3xl">Mon espace</h1>
			<p>Bonjour {maquilleuse.nom || 'toi'}, tu es connectée.</p>
		</main>
	)
}
