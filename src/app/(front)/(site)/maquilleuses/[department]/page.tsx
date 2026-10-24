import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ProfileBlock } from '@/components/blocks/ProfileBlock'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import { zoneLabel, zonePageMetadata, zoneStructuredData, zoneTitle } from '@/lib/seo/zone-page'
import { departmentFromSlug, zoneMembers, zoneStatus } from '@/lib/seo/zones'
import { cachedDirectory } from '@/services/public/cached'

// The HTML is kept in the cache of Next, as for a talent (ticket 269): nothing is rendered at build, which runs
// without a database, the page is rendered at its first visit then served from the cache. The directory it reads
// carries the tag `profils`, so the save of a profile refreshes the page; the hour is the backstop.
// Nothing in this page or in the layout of the site reads a cookie or a header: that is what keeps it cacheable.
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { department: string }[] {
	return []
}

/**
 * The zone of an address segment: its code and the profiles it counts and shows, or `null` for an unknown
 * département or a zone with no profile (404). The rule is the one of the sitemap (src/lib/seo/zones.ts), applied
 * to the listed profiles of the directory, so the page never shows fewer profiles than it counts.
 */
const readZoneOnce = cache(async (segment: string) => {
	const code = departmentFromSlug(segment)
	if (code === null) return null
	const directory = await cachedDirectory()
	const members = zoneMembers(
		directory.map(profile => ({
			departement: profile.departement,
			publishable: profile.indexable,
			listed: true,
			slug: profile.carte.slug,
			card: profile.carte,
		})),
		code
	)
	return zoneStatus(members.length) === 'absent' ? null : { code, cards: members.map(({ card }) => card) }
})

export async function generateMetadata({ params }: PageProps<'/maquilleuses/[department]'>): Promise<Metadata> {
	const zone = await readZoneOnce((await params).department)
	// The page answers 404 below; its own metadata are those of the 404 page.
	if (!zone) return {}
	return zonePageMetadata({ code: zone.code, count: zone.cards.length })
}

const countText = (count: number): string =>
	count === 1 ? '1 maquilleuse professionnelle indépendante' : `${count} maquilleuses professionnelles indépendantes`

/**
 * The page of a département (ticket 1015): a single h1, the number of profiles, their cards, a way to refine in the
 * search. From one profile it is indexable (the threshold is in src/lib/seo/zones.ts); with
 * none, or for an unknown département, it answers 404. The text says what the data says and nothing more: no rating,
 * no local text nobody wrote. The structured data is the breadcrumb and the list of the profile addresses.
 */
export default async function ZonePage({ params }: PageProps<'/maquilleuses/[department]'>) {
	const zone = await readZoneOnce((await params).department)
	if (!zone) notFound()
	const { code, cards } = zone
	return (
		<main className="relative">
			{zoneStructuredData({ code, slugs: cards.map(({ slug }) => slug) }).map(data => (
				<script
					key={data['@type']}
					type="application/ld+json"
					// serializeJsonLd escapes <, > and &, so the data cannot close the tag.
					dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
				/>
			))}
			<Hero
				image="/assets/back/maquilleuse_europeenne_white.webp"
				titre={zoneTitle(code)}
				description={`${countText(cards.length)} du département ${zoneLabel(code)} présentent leur travail et leurs tarifs. Contactez directement celle qui vous correspond.`}
				recherche={false}
			/>
			<div className="relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0">
				<div className="reveal mx-auto max-w-2xl">
					<p className="text-base text-gray-700" data-testid="zone-count">
						{countText(cards.length)} dans ce département. Elles sont classées de la fiche la plus complète à la plus
						récemment mise à jour.
					</p>
					<Link href="/search" className="btn-primary mt-6 inline-flex">
						Chercher une prestation ou une autre ville
					</Link>
				</div>
				<ProfileBlock titre={`Les maquilleuses du département ${zoneLabel(code)}`} cartes={cards} />
			</div>
			<Cta />
		</main>
	)
}
