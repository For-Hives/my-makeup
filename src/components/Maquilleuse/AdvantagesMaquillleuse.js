import { CheckCircleIcon } from '@heroicons/react/24/outline'

function AdvantagesMaquillleuse(_props) {
	const advantages = [
		{
			title: 'Développez votre activité',
			description:
				'Présentez votre travail aux particuliers qui cherchent une maquilleuse et gagnez en visibilité avec My-Makeup.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Mettez en avant vos compétences et votre parcours',
			description:
				'Spécialités, expériences, formations, langues et portfolio : votre page professionnelle met en lumière votre parcours. Les particuliers vous trouvent par mot-clé et par ville.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Définissez vos tarifs',
			description:
				'Chez My-Makeup, vous avez le contrôle total sur vos tarifs. Fixez le prix que vous estimez juste pour vos prestations. Nous respectons le travail et la créativité de nos maquilleuses et nous croyons en une rémunération équitable.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: "Profitez d'un service totalement gratuit",
			description:
				'My-Makeup est gratuit pour les maquilleuses : page professionnelle, portfolio, tarifs et coordonnées, sans frais. Notre objectif est de vous aider à développer votre activité.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: "Facilité d'utilisation",
			description:
				'Notre plateforme est conçue pour être intuitive et facile à utiliser, ce qui vous permet de vous concentrer sur ce que vous faites le mieux : le maquillage.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Une communauté variée',
			description:
				'Rejoignez des maquilleuses professionnelles de toutes les spécialités : mariage, soirée, artistique, cinéma, événementiel...',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Visibilité gratuite',
			description:
				'Votre page professionnelle est publique et gratuite : partagez-la sur vos réseaux sociaux ou dans votre bio Instagram.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
		{
			title: 'Vous restez libre',
			description:
				'Vous choisissez vos prestations, vos prix, votre zone de déplacement et indiquez si vous êtes disponible.',
			icon: <CheckCircleIcon className="h-6 w-6 text-green-500" />,
		},
	]

	return (
		<section className="bg-neutral-50 py-24">
			<div className="overflow-hidden bg-neutral-50 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
				<div className="relative mx-auto max-w-screen-2xl">
					<div className="text-center">
						<h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Nos Avantages</h2>
						<p className="mt-4 text-lg leading-6 text-gray-500">
							Pourquoi choisir My&nbsp;Makeup ? Voici quelques-uns de nos avantages.
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
													<span className="inline-block rounded-md pr-3 ">{advantage.icon}</span>
												</div>

												<h3 className="text-lg font-medium tracking-tight text-gray-900">{advantage.title}</h3>
											</div>
											<p className="text-base text-gray-500">{advantage.description}</p>
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

export default AdvantagesMaquillleuse
