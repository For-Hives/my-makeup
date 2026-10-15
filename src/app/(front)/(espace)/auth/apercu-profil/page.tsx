import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BandeauDApercu } from '@/components/espace/BandeauDApercu'
import { VueDuProfil } from '@/components/profil/VueDuProfil'
import { exigerMaquilleuse } from '@/lib/auth/session'
import { CHEMIN_DE_L_APERCU, CHEMIN_DE_L_ESPACE, etatDeLApercu } from '@/lib/espace/apercu'
import { identifiantDuProfil } from '@/lib/espace/mon-profil'
import { utilisatriceDeLaRequete } from '@/lib/espace/requete'
import { lireLApercuDuProfil } from '@/services/public/profils'

// Read per request: it depends on the session, and the build has no database. Private and never
// indexed: the headers of `/auth/*` (`private, no-store`, `noindex`) and the tag below.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Aperçu de mon profil', robots: { index: false, follow: false } }

/**
 * Her own public page, seen as a visitor sees it (ticket 139): the same content as
 * `/profil/<slug>`, drawn by the same component from the same public reading, even when the profile
 * is not listed yet or is hidden, with a banner that says where it stands. Only her profile can come
 * out of it: it is found by her session, no identifier or slug comes from the request. No structured
 * data and no canonical address: the page is not for a search engine.
 */
export default async function PageDApercu() {
	await exigerMaquilleuse(CHEMIN_DE_L_APERCU)
	const contexte = await utilisatriceDeLaRequete()
	const id = contexte === null ? null : await identifiantDuProfil(contexte.payload, contexte.utilisateur)
	const apercu = contexte === null || id === null ? null : await lireLApercuDuProfil(contexte.payload, id)
	// No profile yet: her space says so, with the way to ask for one.
	if (apercu === null) redirect(CHEMIN_DE_L_ESPACE)
	return (
		<>
			<BandeauDApercu etat={etatDeLApercu(apercu.etat)} />
			<VueDuProfil profil={apercu.profil} mesure={false} />
		</>
	)
}
