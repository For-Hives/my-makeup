import Image from 'next/image'
import { ArchImage } from '@/components/art/ArchImage'
import { archSizes } from '@/components/art/arch-sizes'
import type { Tint } from '@/components/art/CapsuleImage'
import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { TitleAccent } from '@/components/art/TitleWithCapsules'
import { SOURCE_ASPECTS } from './photo-aspects'
import { SectionHead } from './SectionHead'

const PHOTO = '/assets/maquilleuse_blog.webp'

const COLUMNS: readonly { image: string; alt: string; titre: string; texte: string; tint: Tint }[] = [
	{
		image: '/assets/illustrations/community-clients.webp',
		alt: 'client à la recherche de maquilleuse',
		titre: 'Des particuliers',
		texte: "À la recherche d'une maquilleuse près de chez eux",
		tint: 'blush',
	},
	{
		image: '/assets/illustrations/community-artists.webp',
		alt: 'des maquilleuses passionnées aux multiples compétences',
		titre: 'Des maquilleuses professionnelles',
		texte: 'Aux multiples spécialités et personnalités',
		tint: 'lavender',
	},
	{
		image: '/assets/illustrations/community-solution.webp',
		alt: 'une solution dédiée pour collaborer entre particuliers et maquilleuses',
		titre: 'Une solution dédiée',
		texte: 'Pensée et conçue pour collaborer',
		tint: 'sand',
	},
]

/**
 * The community block, in the kit's look (the three texts and the title are those of the site online, word for word):
 * a split layout, the title and the line on the left with a photo cut as an arch, the three parts on the right as
 * rows on hairlines, each with its drawing in a round tinted frame. The photo is decoration (`alt=""`).
 */
export function Presentation() {
	return (
		<section className="home-section relative overflow-hidden border-indigo-900/10 border-t bg-art-blush-50 py-16 md:py-28">
			<GlowBlob size="md" tone="blush" className="-bottom-52 -left-56" />
			<div className="page-frame relative grid items-center gap-14 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-20">
				<div className="reveal mx-auto w-full max-w-[19rem] md:max-w-sm">
					<ArchImage
						src={PHOTO}
						tint="rose"
						band="night"
						side="left"
						mark="ring"
						quality={90}
						sizes={archSizes({ desktop: 24, mobile: 19, sourceAspect: SOURCE_ASPECTS[PHOTO] })}
					/>
				</div>
				<div>
					<SectionHead
						display
						titre={
							<>
								My-Makeup c&apos;est avant tout une{' '}
								<TitleAccent tone="berry" italic>
									communauté
								</TitleAccent>
							</>
						}
					>
						Où les maquilleuses et les particuliers se retrouvent pour collaborer en toute simplicité.
					</SectionHead>
					<ul className="mt-10 divide-y divide-indigo-900/10 border-indigo-900/10 border-y md:mt-12">
						{COLUMNS.map(colonne => (
							<li key={colonne.titre} className="reveal flex items-center gap-5 py-6 md:gap-7 md:py-7">
								<span
									data-tint={colonne.tint}
									className="relative size-24 flex-none overflow-hidden rounded-full bg-(--tint) ring-2 ring-white md:size-28"
								>
									<Image
										alt={colonne.alt}
										src={colonne.image}
										fill
										sizes="7rem"
										quality={90}
										className="object-contain p-2"
									/>
								</span>
								<div>
									<h3 className="font-display font-medium text-2xl text-ink leading-tight md:text-3xl">
										{colonne.titre}
									</h3>
									<p className="mt-1.5 text-mute text-base leading-7">{colonne.texte}</p>
								</div>
							</li>
						))}
					</ul>
				</div>
			</div>
			<PrintMark kind="dot" className="absolute right-[8%] bottom-14 hidden h-3 w-3 text-art-berry md:block" />
		</section>
	)
}
