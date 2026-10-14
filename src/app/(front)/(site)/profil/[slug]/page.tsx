import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'
import { VueDuProfil } from '@/components/profil/VueDuProfil'
import { metadonnees } from '@/lib/seo/metadonnees'
import { cheminProfil } from '@/lib/slug'
import { type AdresseDeProfil, lireLAdresseDeProfil } from '@/services/public/profils'

// Read at each request: the build runs without a database. The refresh by tags of ticket 047 comes
// after this page.
export const dynamic = 'force-dynamic'

/** The segment as the visitor wrote it: Next gives it decoded or not, depending on the path. */
function segmentEcrit(segment: string): string {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

/** What the address leads to, read once for the metadata and the page of one request. */
const adresseDeProfil = cache(async (segment: string): Promise<AdresseDeProfil> => {
	return lireLAdresseDeProfil(await getPayload({ config }), segmentEcrit(segment))
})

/**
 * Indexed only when the profile can be published (E66): otherwise a noindex tag and no canonical
 * address. The title, the description and the structured data are ticket 105's. An unknown or hidden
 * profile has the 404 page, which Next marks noindex by itself.
 */
export async function generateMetadata({ params }: PageProps<'/profil/[slug]'>): Promise<Metadata> {
	const { slug } = await params
	const adresse = await adresseDeProfil(slug)
	if (adresse.type !== 'profil') return {}
	const { profil } = adresse
	return metadonnees({
		titre: profil.nom,
		description: profil.description,
		repli: `${profil.nom}, maquilleuse professionnelle sur My-Makeup.`,
		chemin: cheminProfil(profil.slug),
		indexable: profil.indexable,
	})
}

/**
 * The public page of a profile, rendered by the server (tickets 101 to 104): her name in the only h1,
 * her speciality, her zone, her availability, her main photo and her description are in the HTML
 * served, with no JavaScript. What the address leads to is src/lib/profil/adresse.ts:
 * - a profile that is not hidden answers 200; when it cannot be published yet it carries a noindex tag
 *   and no canonical address, as on the site today;
 * - the old address by username, or a variant of the slug, answers one 308 to the slug;
 * - an unknown slug, a hidden profile and the profiles of the spam, which the import does not take,
 *   answer the 404 page in French.
 * The profile is read by the public reading only (src/services/public/profils.ts), which never gives a
 * contact detail she did not publish.
 */
export default async function PageDuProfil({ params }: PageProps<'/profil/[slug]'>) {
	const { slug } = await params
	const adresse = await adresseDeProfil(slug)
	if (adresse.type === 'redirection') permanentRedirect(cheminProfil(adresse.slug))
	if (adresse.type === 'inconnue') notFound()
	return <VueDuProfil profil={adresse.profil} />
}
