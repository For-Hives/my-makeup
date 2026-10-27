import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'
import { Pill } from '@/components/art/Pill'
import { Cta } from '@/components/blocks/Cta'
import { MarkdownContent } from '@/components/content/MarkdownContent'
import { ArtPage, ArtSignature } from '@/components/static-pages/ArtPage'
import { PageHead, pickIllustration } from '@/components/static-pages/PageHead'
import { ProfileGrid } from '@/components/static-pages/ProfileGrid'
import { markdownToHtml } from '@/lib/markdown'
import { breadcrumbStructuredData, SITE_NAME, serializeJsonLd } from '@/lib/seo/json-ld'
import { editorialMetadata } from '@/lib/seo/metadata'
import { canonicalUrl } from '@/lib/seo/url'
import { cachedProfileBlock, cachedTalent } from '@/services/public/cached'
import { TALENT_BLOCK_SIZE, talentBlockTitle } from '@/services/public/profile-block'

// The HTML is kept in the cache of Next (ticket 269). Nothing is rendered at build, which runs without a
// database: no address is generated ahead (`generateStaticParams`), the page is rendered at its first visit,
// then served from the cache. A save of the document refreshes it by its path and by its tag `talent:<slug>`
// (src/lib/revalidate.ts); the hour is the backstop of the reads of the data (src/services/public/cached.ts).
// Nothing in this page or in the layout of the site reads a cookie or a header: that is what keeps it cacheable.
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { slug: string }[] {
	return []
}

/** The page and its metadata read the same talent: once per request. */
const readTalentOnce = cache(async (slug: string) => cachedTalent(await getPayload({ config }), slug))

export async function generateMetadata({ params }: PageProps<'/talent/[slug]'>): Promise<Metadata> {
	const { slug } = await params
	const talent = await readTalentOnce(slug)
	// The page answers 404 below; its own metadata are those of the 404 page.
	if (!talent) return {}
	return editorialMetadata({
		// The title the newsroom wrote for the tab (50 to 60 characters); the short title of the talent until then.
		titre: talent.titreDeLaPage || talent.titre,
		descriptionRedigee: talent.descriptionSeo,
		autres: [talent.presentation],
		repli: `${talent.titre} : découvrez les maquilleuses professionnelles de cette spécialité sur ${SITE_NAME}.`,
		chemin: `/talent/${talent.slug}`,
	})
}

/** The makeup artists of the speciality. A failed read leaves the page without its block, never a 500. */
async function readBlock(title: string) {
	try {
		return await cachedProfileBlock(title, TALENT_BLOCK_SIZE)
	} catch {
		return []
	}
}

/**
 * The page of a speciality, rendered by the server (ticket 108): its title is the only h1, then its
 * presentation, its content (markdown turned into sanitized HTML, src/lib/markdown.ts), a link to the
 * search and, when the speciality has some, six makeup artists (ticket 305). An unknown slug and a draft answer 404 in French (E59). The structured data is the breadcrumb (E65).
 */
export default async function TalentPage({ params }: PageProps<'/talent/[slug]'>) {
	const { slug } = await params
	const talent = await readTalentOnce(slug)
	if (!talent) notFound()
	const html = await markdownToHtml(talent.contenu)
	const cards = await readBlock(talent.titre)
	const breadcrumb = breadcrumbStructuredData([
		{ nom: 'Accueil', url: canonicalUrl('/') },
		{ nom: talent.titre, url: canonicalUrl(`/talent/${talent.slug}`) },
	])
	const art = pickIllustration(talent.slug)
	return (
		<ArtPage>
			<script
				type="application/ld+json"
				// serializeJsonLd escapes <, > and &, so the data cannot close the tag.
				dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
			/>
			<PageHead
				image={art.image}
				tint={art.tint}
				band={art.band}
				mark="ring"
				title={talent.titreAffiche}
				description={talent.presentation}
			/>
			<div className="page-frame pb-20 md:pb-28">
				<div className="mx-auto max-w-4xl rounded-art-frame border border-nude-200 bg-white px-6 py-12 md:px-16 md:py-16">
					<article className="reveal content-prose">
						<MarkdownContent html={html} />
						<Pill href="/search" variant="filled" arrow data-cta="talent_recherche">
							Trouver une maquilleuse
						</Pill>
						<ArtSignature />
					</article>
				</div>
				<div className="mt-20 md:mt-28">
					<ProfileGrid
						titre={talentBlockTitle(talent.titre)}
						cartes={cards}
						specialite={talent.titre}
						origin="talent"
					/>
				</div>
			</div>
			<Cta />
		</ArtPage>
	)
}
