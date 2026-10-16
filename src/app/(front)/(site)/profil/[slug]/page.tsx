import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'
import { VueDuProfil } from '@/components/profil/VueDuProfil'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import { donneesStructureesDuProfil, metadonneesDuProfil } from '@/lib/seo/profil'
import { cheminProfil } from '@/lib/slug'
import { segmentEcrit } from '@/lib/urls/page-inconnue'
import { lAdresseDeProfilEnCache } from '@/services/public/en-cache'
import type { AdresseDeProfil } from '@/services/public/profils'

// Rendered at each request: the build runs without a database. The profile is read through the cache of
// Next, under its tag `profil:<slug>` (ticket 117): a save refreshes it (ticket 047), and two visits of a
// page that did not change read nothing in the database.
export const dynamic = 'force-dynamic'

/** What the address leads to, read once for the metadata and the page of one request. */
const adresseDeProfil = cache(async (segment: string): Promise<AdresseDeProfil> => {
	return lAdresseDeProfilEnCache(await getPayload({ config }), segmentEcrit(segment))
})

/**
 * Title, description, canonical address and robots (ticket 105). Indexed only when the profile can be
 * published (E66): otherwise a noindex tag and no canonical address. An unknown or hidden profile has
 * the 404 page, which Next marks noindex by itself.
 */
export async function generateMetadata({ params }: PageProps<'/profil/[slug]'>): Promise<Metadata> {
	const { slug } = await params
	const adresse = await adresseDeProfil(slug)
	return adresse.type === 'profil' ? metadonneesDuProfil(adresse.profil) : {}
}

/**
 * The public page of a profile, rendered by the server (tickets 101 to 105): her name in the only h1,
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
	return (
		<>
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes <, > and &, so the data cannot close the tag.
				dangerouslySetInnerHTML={{ __html: serializeJsonLd(donneesStructureesDuProfil(adresse.profil)) }}
			/>
			<VueDuProfil profil={adresse.profil} />
		</>
	)
}
