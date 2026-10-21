import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { Collaboration } from '@/components/home/Collaboration'
import { Presentation } from '@/components/home/Presentation'
import { Project } from '@/components/home/Project'
import { Talents } from '@/components/home/Talents'
import { NETWORKS } from '@/components/layout/links'
import { homeStructuredData, serializeJsonLd } from '@/lib/seo/json-ld'
import { pageMetadata } from '@/lib/seo/metadata'
import { HOME_PAGE_KEY } from '@/lib/urls/home-page'
import { cachedTalents } from '@/services/public/cached'
import type { TalentPublic } from '@/services/public/talents'

// The home page is served at `/` from the cache of Next (ticket 269). A page at the root cannot be left out of
// the build, which runs without a database: it would be rendered there, with no talents, and kept. So the page
// lives under a dynamic segment that generates nothing ahead, and `next.config.ts` rewrites `/` to it
// (HOME_PAGE_PATH): it is rendered at its first visit, then served from the cache. The talents are read through
// the cache of Next, tagged `talents`: a save of a talent refreshes the page (tickets 047 and 117). The address
// itself is not a page of the site: the proxy answers 404 to it (src/proxy.ts).
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { key: string }[] {
	return []
}

const TITLE = 'Maquilleuse professionnelle près de chez vous'
const DESCRIPTION =
	'Trouvez une maquilleuse professionnelle à domicile près de chez vous, pour un mariage, une soirée ou un shooting. Comparez les profils et les tarifs.'

// The preview of a shared link comes with the other tags: the picture of the site (ticket 116).
export const metadata: Metadata = pageMetadata({
	titre: TITLE,
	description: DESCRIPTION,
	repli:
		'Annuaire de maquilleuses professionnelles indépendantes : trouvez celle qui vous correspond, près de chez vous.',
	chemin: '/',
})

const PUBLIC_NETWORKS = NETWORKS.filter(({ href }) => href.startsWith('https://')).map(({ href }) => href)

/** The talents, or none when the database does not answer: the home page stays a page, never a 500. */
async function readTalents(): Promise<readonly TalentPublic[]> {
	try {
		return await cachedTalents()
	} catch (error) {
		console.error('[accueil] les talents ne se lisent pas :', error instanceof Error ? error.message : error)
		return []
	}
}

export default async function HomePage({ params }: PageProps<'/home-cached/[key]'>) {
	if ((await params).key !== HOME_PAGE_KEY) notFound()
	const talents = await readTalents()
	return (
		<main className="relative">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes <, > and &, so the data cannot close the tag.
				dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeStructuredData(PUBLIC_NETWORKS)) }}
			/>
			<Hero
				titre={<>Trouver la maquilleuse qui vous correspond n&apos;a jamais été aussi simple</>}
				description={
					<>
						Trouvez la maquilleuse spécialisée dans le domaine que vous recherchez, maquillage pour les mariées,
						maquillage de soirée, maquillage professionnel...
					</>
				}
			/>
			<Presentation />
			{talents.length > 0 && <Talents talents={talents} />}
			<Collaboration />
			<Project />
			<Cta />
		</main>
	)
}
