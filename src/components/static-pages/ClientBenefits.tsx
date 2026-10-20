/** The check mark in front of each advantage (heroicons 24, MIT), drawn inline. */
function CheckIcon() {
	return (
		<svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
			/>
		</svg>
	)
}

/** The advantages of the service for the people looking for a makeup artist (CONF-01: no promise the service does not keep). */
export const CLIENT_BENEFITS: readonly { titre: string; description: string }[] = [
	{
		titre: 'Des maquilleuses professionnelles en un seul endroit',
		description:
			'Grâce à My-Makeup, vous trouvez des maquilleuses professionnelles réunies en un seul endroit, avec leur portfolio et leurs spécialités.',
	},
	{
		titre: 'Recherche facile et rapide',
		description:
			'Recherchez par mot-clé (mariage, soirée, artistique...) et par ville pour trouver rapidement les maquilleuses qui vous correspondent.',
	},
	{
		titre: 'Des informations claires',
		description:
			'Chaque profil présente les tarifs indicatifs, les expériences, les formations et les photos des réalisations de la maquilleuse.',
	},
	{
		titre: 'Inspiration',
		description:
			'Nos articles et nos pages par spécialité vous donnent des idées et des repères pour préparer votre projet beauté.',
	},
	{
		titre: 'Gain de temps',
		description:
			'Au lieu de chercher sur plusieurs sites et réseaux, vous comparez les profils, les prix indicatifs et les portfolios au même endroit.',
	},
	{
		titre: 'Une équipe à votre écoute',
		description: 'Une question ou un problème ? Écrivez-nous depuis la page Contact.',
	},
	{
		titre: 'Contact direct',
		description: 'Vous contactez directement la maquilleuse, sans intermédiaire ni frais de mise en relation.',
	},
]

export function ClientBenefits() {
	return (
		<section className="bg-neutral-50 py-24">
			<div className="overflow-hidden bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
				<div className="relative mx-auto max-w-screen-2xl">
					<div className="text-center">
						<h2 className="font-extrabold text-3xl text-gray-900 tracking-tight sm:text-4xl">Nos Avantages</h2>
						<p className="mt-4 text-gray-600 text-lg leading-6">
							Pourquoi choisir My&nbsp;Makeup ? Voici quelques-uns de nos avantages.
						</p>
					</div>
					<div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
						{CLIENT_BENEFITS.map(avantage => (
							<div key={avantage.titre} className="pt-6">
								<div className="flow-root rounded-lg px-6 pb-8">
									<div className="flex flex-col gap-4">
										<div className="flex items-center">
											<span className="inline-block pr-3 text-green-600">
												<CheckIcon />
											</span>
											<h3 className="font-medium text-gray-900 text-lg tracking-tight">{avantage.titre}</h3>
										</div>
										<p className="text-base text-gray-600">{avantage.description}</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	)
}
