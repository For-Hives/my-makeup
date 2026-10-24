import { Eyebrow } from './EditorialArticle'
import { CheckCircleIcon } from './icons'

export interface BenefitItem {
	titre: string
	texte: string
}

/**
 * The advantages of the service, on the two « Pourquoi… » pages: one list of cards for both (the two pages had two
 * copies of the same block). A card that would stand alone on the last row of the grid takes its full width.
 */
export function Benefits({ eyebrow, items }: { eyebrow: string; items: readonly BenefitItem[] }) {
	const alone = items.length % 3 === 1
	return (
		<section data-benefits className="border-gray-200 border-t bg-neutral-50 px-4 py-20 sm:px-6 md:py-28 lg:px-8">
			<div className="mx-auto max-w-6xl">
				<div className="reveal mx-auto max-w-2xl text-center">
					<Eyebrow>{eyebrow}</Eyebrow>
					<h2 className="mt-4 font-display font-medium text-3xl text-gray-900 tracking-tight sm:text-4xl">
						Nos Avantages
					</h2>
					<p className="mt-4 text-gray-700 text-lg leading-8">
						Pourquoi choisir My&nbsp;Makeup ? Voici quelques-uns de nos avantages.
					</p>
				</div>
				<ul className="mt-14 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
					{items.map((item, index) => (
						<li
							key={item.titre}
							data-benefit
							className={`reveal flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-8 ${alone && index === items.length - 1 ? 'lg:col-span-3 lg:flex-row lg:items-start lg:gap-6' : ''}`}
						>
							<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-900">
								<CheckCircleIcon className="h-6 w-6" />
							</span>
							<div>
								<h3 className="font-display font-medium text-gray-900 text-xl leading-snug tracking-tight">
									{item.titre}
								</h3>
								<p className="mt-3 max-w-[60ch] text-base text-gray-700 leading-7">{item.texte}</p>
							</div>
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}
