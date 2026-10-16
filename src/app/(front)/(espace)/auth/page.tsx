import { redirect } from 'next/navigation'
import { maquilleuseConnectee } from '@/lib/auth/session'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

/**
 * The bare address of the space (ticket 228, `espace-racine` of docs/migration/URLS.md): the server
 * sends on, in one hop, to the space when a session is open and to the sign-in page otherwise. The
 * current site showed an empty page that the browser then sent on.
 */
export default async function RacineDeLEspace() {
	redirect((await maquilleuseConnectee()) ? '/auth/profil' : '/auth/signin')
}
