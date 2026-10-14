import config from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { VueDuProfil } from '@/components/profil/VueDuProfil'
import { lireLeProfilPublic } from '@/services/public/profils'

// Read at each request: the build runs without a database. The refresh by tags of ticket 047 comes
// after this page.
export const dynamic = 'force-dynamic'

/**
 * The public page of a profile, rendered by the server (tickets 101 to 103): her name in the only h1,
 * her speciality, her zone, her availability, her main photo and her description are in the HTML
 * served, with no JavaScript. An unknown slug answers 404. So does a profile that is not published,
 * for now: ticket 104 gives the page of a profile that is visible but cannot be published a 200 in
 * noindex, as on the site today. The profile is read by the public reading only
 * (src/services/public/profils.ts), which never gives a contact detail she did not publish.
 */
export default async function PageDuProfil({ params }: PageProps<'/profil/[slug]'>) {
	const { slug } = await params
	const profil = await lireLeProfilPublic(await getPayload({ config }), slug)
	if (!profil) notFound()
	return <VueDuProfil profil={profil} />
}
