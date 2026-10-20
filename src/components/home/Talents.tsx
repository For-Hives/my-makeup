import Image from 'next/image'
import Link from 'next/link'
import type { TalentPublic } from '@/services/public/talents'
import { CarteDeDemonstration } from './CarteDeDemonstration'

/** The talents that have an icon under `public/assets/talents/`: a talent created later is shown without one. */
export const TALENTS_AVEC_ICONE: ReadonlySet<string> = new Set([
	'maquillage-artistique',
	'maquillage-beaute',
	'maquillage-cinema',
	'maquillage-enfant',
	'maquillage-femme',
	'maquillage-fete',
	'maquillage-film',
	'maquillage-fx',
	'maquillage-homme',
	'maquillage-mariee',
	'maquillage-professionnel',
	'maquillage-soiree',
	'maquillage-specialise',
	'maquillage-theatre',
])

/**
 * « Vos projets, nos meilleurs talents. »: the published talents, each one a link to its page. The
 * title is the name of the link; the words shown on hover are only a hint.
 */
export function Talents({ talents }: { talents: readonly TalentPublic[] }) {
	return (
		<section className="relative px-4 py-20 md:px-8 2xl:px-0">
			<div className="mx-auto max-w-7xl py-10">
				<div className="mx-auto">
					<h2 className="text-right font-bold text-4xl text-gray-900 tracking-tight sm:text-4xl">
						Vos projets, nos meilleurs talents.
					</h2>
				</div>
			</div>
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto flex w-full flex-col md:flex-row md:gap-24">
					<div className="relative flex h-auto items-center justify-center gap-2 pb-10 md:w-1/5 md:gap-0 md:p-0">
						<div className="md:-translate-x-[40%] md:-translate-y-[40%] md:absolute md:top-1/2 md:left-1/2 md:z-20">
							<CarteDeDemonstration src="/assets/Maquilleuse_Professionnelle.webp" coeur />
						</div>
						<div className="md:-translate-x-[90%] md:-translate-y-[90%] md:absolute md:top-1/2 md:left-1/2 md:z-10">
							<CarteDeDemonstration src="/assets/Maquilleuse_cinema.webp" coeur={false} />
						</div>
					</div>
					<ul className="xs:grid-cols-3 grid w-full grid-cols-2 gap-4 md:w-4/5 md:grid-cols-4 md:gap-8">
						{talents.map(talent => (
							<li key={talent.slug} className="flex">
								<Link
									href={`/talent/${talent.slug}`}
									className="group relative flex w-full focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
								>
									<span className="flex h-full min-h-[120px] w-full items-center justify-center rounded-xl border border-indigo-900/10 px-4 py-8 text-center font-semibold text-gray-900/70 transition duration-100 ease-in group-hover:opacity-0 group-focus-visible:opacity-0">
										{talent.titre}
									</span>
									{TALENTS_AVEC_ICONE.has(talent.slug) && (
										<span className="absolute top-0 left-0 flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
											<Image
												src={`/assets/talents/${talent.slug}.svg`}
												width={50}
												height={50}
												className="-bottom-3 -right-2 -rotate-6 absolute scale-75 transform opacity-50"
												alt=""
											/>
										</span>
									)}
									<span
										aria-hidden="true"
										className="-z-10 absolute top-0 left-0 flex h-full w-full items-center justify-center rounded-xl border border-indigo-900 bg-indigo-900 px-4 py-8 text-center font-semibold text-gray-50 opacity-0 transition duration-100 ease-in group-hover:z-10 group-hover:opacity-100 group-focus-visible:z-10 group-focus-visible:opacity-100"
									>
										Voir cette spécialité
									</span>
								</Link>
							</li>
						))}
					</ul>
				</div>
			</div>
		</section>
	)
}
