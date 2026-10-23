import Image from 'next/image'

const COLUMNS = [
	{
		image: '/assets/illustrations/illustration.webp',
		alt: 'client à la recherche de maquilleuse',
		titre: 'Des particuliers',
		texte: "À la recherche d'une maquilleuse près de chez eux",
	},
	{
		image: '/assets/illustrations/illustration_2.webp',
		alt: 'des maquilleuses passionnées aux multiples compétences',
		titre: 'Des maquilleuses professionnelles',
		texte: 'Aux multiples spécialités et personnalités',
	},
	{
		image: '/assets/illustrations/illustration_3.webp',
		alt: 'une solution dédiée pour collaborer entre particuliers et maquilleuses',
		titre: 'Une solution dédiée',
		texte: 'Pensée et conçue pour collaborer',
	},
] as const

export function Presentation() {
	return (
		<section className="relative px-4 py-20 md:px-0">
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto">
					<h2 className="text-center font-bold text-4xl text-gray-900 tracking-tight sm:text-4xl">
						My-Makeup c&apos;est avant tout une communauté
					</h2>
					<p className="mt-6 text-center text-gray-700 text-lg leading-8">
						Où les maquilleuses et les particuliers se retrouvent pour collaborer en toute simplicité.
					</p>
				</div>
			</div>
			<div className="mx-auto mt-10 max-w-7xl">
				<div className="mx-auto flex flex-col items-center justify-center gap-16 md:flex-row lg:gap-32">
					{COLUMNS.map(colonne => (
						<div key={colonne.titre} className="flex flex-col items-center justify-center gap-2">
							<Image alt={colonne.alt} src={colonne.image} width={140} height={140} />
							<h3 className="text-center font-bold text-4xl text-gray-700 tracking-tight sm:text-xl">
								{colonne.titre}
							</h3>
							<p className="text-center text-gray-600 text-sm leading-8">{colonne.texte}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}
