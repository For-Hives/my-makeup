import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { ProfileCard as ArtProfileCard } from '@/components/art/ProfileCard'
import { SectionHead } from '@/components/home/SectionHead'
import { FEATURED_LIST_CLASS, FEATURED_MAX, featuredDrawScript } from '@/lib/profile/featured'
import type { ProfileCard } from '@/services/public/profiles'

/** The photo of a card sits on a tint; they follow each other so a row is not one colour. */
const TINTS = ['blush', 'lavender', 'sand'] as const

/**
 * « Mise en avant » (issue 1066): verified makeup artists, drawn at random at each load of the page, six at
 * most. The HTML of the home page is cached and the same for everyone, so the server cannot draw: it carries the
 * candidates (`cartes`, the verified profiles, in the order of the directory), the stylesheet shows the first six
 * (without JavaScript the block is complete and stable), and an inline script, placed before the list, swaps that
 * rule for a random six (src/lib/profile/featured.ts). It touches no node, loads no module and ships no client
 * component: the bundles do not grow, the block always holds six cards (CLS 0), and a hidden card loads no picture
 * (none is `priority`). The cards are those of the kit (`ProfileCard`, the data of the search card); their click
 * is a `card_click` (origin `mise_en_avant`; the delegated listener counts the cards in view, so the drawn six are ranked 1 to 6),
 * never a `search_result_click`, so the series of the search stays the search. Without a card there is no block, no
 * title and no empty space. The kit banner that opened the section (25/10/2026) is gone: under the hero « en arche »
 * it made a second band below the ribbon of the specialties, and Andy asked for one (26/10/2026, docs/accueil.md).
 */
export function FeaturedProfiles({ cartes }: { cartes: readonly ProfileCard[] }) {
	if (cartes.length === 0) return null
	return (
		<section
			aria-labelledby="accueil-mise-en-avant"
			data-testid="maquilleuses-mises-en-avant"
			className="home-section relative overflow-hidden bg-art-paper py-16 md:py-28"
		>
			<GlowBlob size="md" tone="rose" className="-top-48 -right-56" />
			<div className="page-frame relative">
				<PrintMark kind="plus" className="absolute top-2 right-10 hidden h-6 w-6 text-art-berry md:block lg:right-20" />
				<SectionHead id="accueil-mise-en-avant" titre="Mise en avant" display />
				{cartes.length > FEATURED_MAX && (
					// biome-ignore lint/security/noDangerouslySetInnerHtml: the script is built from three integers, no data of a profile.
					<script
						dangerouslySetInnerHTML={{
							__html: featuredDrawScript(
								cartes.length,
								FEATURED_MAX,
								cartes.filter(carte => carte.superMaquilleuse).length
							),
						}}
					/>
				)}
				<ul
					className={`${FEATURED_LIST_CLASS} mt-12 grid grid-cols-1 gap-x-8 gap-y-14 md:mt-16 md:grid-cols-3 md:gap-y-16 lg:gap-x-14`}
				>
					{cartes.map((carte, index) => (
						<li key={carte.slug} className="reveal">
							<ArtProfileCard profile={carte} tint={TINTS[index % TINTS.length]} origin="mise_en_avant" />
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}
