import { type ArchBand, ArchImage } from '@/components/art/ArchImage'
import type { Tint } from '@/components/art/CapsuleImage'
import type { MakeupObjectName } from '@/components/art/drawings'
import { GlowBlob, MakeupObject } from '@/components/art/graphics'
import { SectionHead } from '@/components/art/SectionHead'

export interface BenefitItem {
	titre: string
	texte: string
}

/** The drawn objects, tints and bands a benefits list cycles through: one set for each of the two « Pourquoi… » pages. */
export interface BenefitsPalette {
	objects: readonly MakeupObjectName[]
	tints: readonly Tint[]
	bands: readonly ArchBand[]
}

export const CLIENT_PALETTE: BenefitsPalette = {
	objects: ['compact', 'mirror', 'lipstick', 'perfume', 'brush', 'mascara', 'nail-polish'],
	tints: ['lavender', 'blush', 'sand'],
	bands: ['band', 'rose', 'night'],
}

export const ARTIST_PALETTE: BenefitsPalette = {
	objects: ['brush', 'lipstick', 'mascara', 'compact', 'nail-polish', 'comb', 'mirror', 'brush'],
	tints: ['sand', 'rose', 'lavender'],
	bands: ['rose', 'band', 'night'],
}

/**
 * The advantages of the service, on the two « Pourquoi… » pages: layout B of the kit (tiered arch cards). Each benefit
 * is an arch that holds a drawn makeup object on a tint (decoration: the picture slot a future illustration can fill),
 * its number in italic Bodoni, its title and its text. On a wide screen the columns are tiered (every other one
 * lower); on a phone an arch sits left of its text, so seven cards do not make seven screens. One list for both pages.
 */
export function Benefits({
	eyebrow,
	items,
	palette,
}: {
	eyebrow: string
	items: readonly BenefitItem[]
	palette: BenefitsPalette
}) {
	return (
		<section data-benefits className="relative isolate overflow-hidden px-4 py-20 sm:px-6 md:py-28 lg:px-8">
			<GlowBlob size="lg" tone="blush" className="-bottom-60 -left-80" />
			<div className="relative mx-auto max-w-7xl">
				<SectionHead eyebrow={eyebrow} title="Nos Avantages">
					Pourquoi choisir My&nbsp;Makeup ? Voici quelques-uns de nos avantages.
				</SectionHead>
				<ul className="mt-16 grid list-none grid-cols-1 gap-x-8 gap-y-12 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-10 lg:[&>li:nth-child(4n+2)]:mt-16 lg:[&>li:nth-child(4n+3)]:mt-6 lg:[&>li:nth-child(4n+4)]:mt-20">
					{items.map((item, index) => (
						<li key={item.titre} data-benefit className="reveal grid grid-cols-[6rem_1fr] items-start gap-x-6 sm:block">
							<div className="w-24 pr-3 sm:w-full sm:pr-4">
								<ArchImage
									tint={palette.tints[index % palette.tints.length] ?? 'blush'}
									band={palette.bands[index % palette.bands.length] ?? 'band'}
									size="sm"
									mark={false}
								>
									<span aria-hidden="true" className="absolute inset-[16%_26%] text-indigo-900">
										<MakeupObject name={palette.objects[index % palette.objects.length] ?? 'brush'} />
									</span>
								</ArchImage>
							</div>
							<div className="sm:mt-6">
								<p aria-hidden="true" className="font-display text-indigo-700 text-xl italic">
									{String(index + 1).padStart(2, '0')}
								</p>
								<h3 className="mt-1 font-display font-medium text-2xl leading-[1.12] tracking-tight">{item.titre}</h3>
								<p className="mt-3 max-w-[40ch] text-base text-mute leading-7">{item.texte}</p>
							</div>
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}
