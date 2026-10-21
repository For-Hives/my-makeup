import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { MarkdownContent } from '@/components/content/MarkdownContent'
import { markdownToHtml } from '@/lib/markdown'
import { breadcrumbStructuredData, SITE_NAME, serializeJsonLd } from '@/lib/seo/json-ld'
import { editorialMetadata } from '@/lib/seo/metadata'
import { canonicalUrl } from '@/lib/seo/url'
import { cachedTalent } from '@/services/public/cached'

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

/**
 * The page of a speciality, rendered by the server (ticket 108): its title is the only h1, then its
 * presentation, its content (markdown turned into sanitized HTML, src/lib/markdown.ts) and a link to the
 * search. An unknown slug and a draft answer 404 in French (E59). The structured data is the breadcrumb (E65).
 */
export default async function TalentPage({ params }: PageProps<'/talent/[slug]'>) {
	const { slug } = await params
	const talent = await readTalentOnce(slug)
	if (!talent) notFound()
	const html = await markdownToHtml(talent.contenu)
	const breadcrumb = breadcrumbStructuredData([
		{ nom: 'Accueil', url: canonicalUrl('/') },
		{ nom: talent.titre, url: canonicalUrl(`/talent/${talent.slug}`) },
	])
	return (
		<main className="relative">
			<script
				type="application/ld+json"
				// serializeJsonLd escapes <, > and &, so the data cannot close the tag.
				dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumb) }}
			/>
			<Hero
				image="/assets/back/maquilleuse_europeenne_white.webp"
				titre={talent.titreAffiche}
				description={talent.presentation}
				recherche={false}
			/>
			<div className="relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0">
				<div className="mx-auto max-w-2xl">
					<article>
						<MarkdownContent html={html} />
						<Link href="/search" className="btn-primary">
							Trouver une maquilleuse
						</Link>
						<p className="mt-12 flex items-center text-base text-gray-600">
							<span className="h-4 w-0.5 rounded-full bg-gray-200" />
							<span className="ml-3">L&apos;équipe My-Makeup</span>
						</p>
					</article>
				</div>
			</div>
			<Cta />
		</main>
	)
}
