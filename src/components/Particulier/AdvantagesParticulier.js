import React from 'react'
import { CheckCircleIcon } from '@heroicons/react/24/outline'

function AdvantagesParticulier(props) {
	const advantages = [
		{
			title: 'Des maquilleuses professionnelles en un seul endroit',
			description:
				'Grâce à My-Makeup, vous trouvez des maquilleuses professionnelles réunies en un seul endroit, avec leur portfolio et leurs spécialités.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Recherche facile et rapide',
			description:
				'Recherchez par mot-clé (mariage, soirée, artistique...) et par ville pour trouver rapidement les maquilleuses qui vous correspondent.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Des informations claires',
			description:
				'Chaque profil présente les tarifs indicatifs, les expériences, les formations et les photos des réalisations de la maquilleuse.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Inspiration',
			description:
				'Nos articles et nos pages par spécialité vous donnent des idées et des repères pour préparer votre projet beauté.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Gain de temps',
			description:
				'Au lieu de chercher sur plusieurs sites et réseaux, vous comparez les profils, les prix indicatifs et les portfolios au même endroit.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Une équipe à votre écoute',
			description:
				'Une question ou un problème ? Écrivez-nous depuis la page Contact.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Contact direct',
			description:
				'Vous contactez directement la maquilleuse, sans intermédiaire ni frais de mise en relation.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
	]

	return (
		<section className="bg-neutral-50 py-24">
			<div className="overflow-hidden bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
				<div className="relative mx-auto max-w-screen-2xl">
					<div className="text-center">
						<h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
							Nos Avantages
						</h2>
						<p className="mt-4 text-lg leading-6 text-gray-500">
							Pourquoi choisir My&nbsp;Makeup ? Voici quelques-uns de nos
							avantages.
						</p>
					</div>
					<div className="mt-12">
						<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 ">
							{advantages.map(advantage => (
								<div key={advantage.title} className="pt-6">
									<div className="flow-root rounded-lg px-6 pb-8">
										<div className="flex flex-col gap-4">
											<div className={'flex items-center align-middle'}>
												<div className={'flex h-full items-center'}>
													<span className="inline-block rounded-md pr-3 ">
														{advantage.icon}
													</span>
												</div>

												<h3 className="text-lg font-medium tracking-tight text-gray-900">
													{advantage.title}
												</h3>
											</div>
											<p className="text-base text-gray-500">
												{advantage.description}
											</p>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}

export default AdvantagesParticulier
