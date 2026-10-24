import Image from 'next/image'

const TABS = [
	{
		titre: 'Contactez directement la maquilleuse',
		contenu:
			'Chaque profil présente le portfolio, les spécialités, les tarifs indicatifs et les moyens de contact choisis par la maquilleuse. Vous échangez directement avec elle, sans intermédiaire.',
	},
	{
		titre: 'Comparez avant de choisir',
		contenu:
			'Portfolio, expériences, formations et zone de déplacement : tout est réuni sur une seule page pour comparer les profils sereinement.',
	},
	{
		titre: 'Gratuit',
		contenu:
			'La recherche est gratuite pour les particuliers et la page professionnelle est gratuite pour les maquilleuses : profil, portfolio, tarifs et coordonnées.',
	},
	{
		titre: 'Pensée pour les maquilleuses indépendantes',
		contenu:
			'Chaque maquilleuse crée et complète elle-même sa page professionnelle pour présenter son travail aux particuliers qui cherchent une maquilleuse.',
	},
] as const

export function Project() {
	return (
		<section className="relative px-4 py-20 md:px-8 2xl:px-0">
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto mb-10">
					<h2 className="text-start font-bold text-4xl text-gray-900 tracking-tight sm:text-4xl">
						Gardez votre projet beauté en tête, on vous aide à trouver la bonne maquilleuse
					</h2>
					<p className="mt-6 text-start text-gray-700 text-lg md:w-1/2">
						Trouvez une maquilleuse près de chez vous, comparez les profils et contactez-la directement, gratuitement.
					</p>
				</div>

				<div className="mx-auto flex max-w-7xl flex-col-reverse gap-16 md:flex-row md:gap-32">
					<div className="w-full md:w-1/2">
						<div className="flex flex-col gap-2">
							{TABS.map(onglet => (
								<div key={onglet.titre}>
									<div className="rounded-2xl border border-gray-200 bg-gray-50 p-10 shadow-lg hover:bg-gray-50 hover:shadow-lg md:border-none md:bg-none md:shadow-none">
										<h3 className="mb-4 font-bold text-gray-700 text-xl">{onglet.titre}</h3>
										<p className="text-gray-500 text-sm">{onglet.contenu}</p>
									</div>
								</div>
							))}
						</div>
					</div>
					<div className="flex items-center justify-center md:w-1/2">
						<Image
							className="h-[250px] w-full rounded-2xl object-cover object-top md:h-[500px]"
							src="/assets/maquilleuse_project.webp"
							alt="illustration"
							width={500}
							height={350}
						/>
					</div>
				</div>
			</div>
		</section>
	)
}
