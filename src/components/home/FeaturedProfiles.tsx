import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
import { ProfileCard as ArtProfileCard } from '@/components/art/ProfileCard'
import { SectionHead } from '@/components/home/SectionHead'
import { FEATURED_LIST_CLASS, FEATURED_MAX, featuredDrawScript } from '@/lib/profile/featured'
import type { ProfileCard } from '@/services/public/profiles'

/** The sentences of the banner above the first section: words the site already says, none is a new claim. */
const BANNER = [
	'Des maquilleuses indépendantes, partout en France',
	'Une recherche gratuite',
	'Contactez directement la maquilleuse',
] as const

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
 * reports nothing (no rank), so the series of the search stays the search. The banner above is the only thing of
 * the hero's neighbourhood that this section brings: it sits before the section, so the hero files are untouched.
 * Without a card there is no banner, no block, no title and no empty space.
 */
export function FeaturedProfiles({ cartes }: { cartes: readonly ProfileCard[] }) {
	if (cartes.length === 0) return null
	return (
		<>
			<MarqueeBanner items={BANNER} label="My-Makeup en quelques mots" />
			<section
				aria-labelledby="accueil-mise-en-avant"
				data-testid="maquilleuses-mises-en-avant"
				className="home-section relative overflow-hidden bg-art-paper px-4 py-16 md:px-8 md:py-28"
			>
				<GlowBlob size="md" tone="rose" className="-top-48 -right-56" />
				<div className="relative mx-auto max-w-7xl">
					<PrintMark kind="plus" className="absolute top-2 right-4 hidden h-6 w-6 text-art-berry md:block" />
					<SectionHead id="accueil-mise-en-avant" titre="Mise en avant" display />
					{cartes.length > FEATURED_MAX && (
						// biome-ignore lint/security/noDangerouslySetInnerHtml: the script is built from two integers, no data of a profile.
						<script dangerouslySetInnerHTML={{ __html: featuredDrawScript(cartes.length, FEATURED_MAX) }} />
					)}
					<ul
						className={`${FEATURED_LIST_CLASS} mt-12 grid grid-cols-1 gap-x-8 gap-y-14 md:mt-16 md:grid-cols-3 md:gap-y-16`}
					>
						{cartes.map((carte, index) => (
							<li key={carte.slug} className="reveal">
								<ArtProfileCard profile={carte} tint={TINTS[index % TINTS.length]} />
							</li>
						))}
					</ul>
				</div>
			</section>
		</>
	)
}
