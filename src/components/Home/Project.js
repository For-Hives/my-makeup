import Image from 'next/image'

const tabs = [
	{
		title: 'Contactez directement la maquilleuse',
		content:
			'Chaque profil présente le portfolio, les spécialités, les tarifs indicatifs et les moyens de contact choisis par la maquilleuse. Vous échangez directement avec elle, sans intermédiaire.',
	},
	{
		title: 'Comparez avant de choisir',
		content:
			'Portfolio, expériences, formations et zone de déplacement : tout est réuni sur une seule page pour comparer les profils sereinement.',
	},
	{
		title: 'Gratuit',
		content:
			'La recherche est gratuite pour les particuliers et la page professionnelle est gratuite pour les maquilleuses : profil, portfolio, tarifs et coordonnées.',
	},
	{
		title: 'Pensée pour les maquilleuses indépendantes',
		content:
			'Chaque maquilleuse crée et complète elle-même sa page professionnelle pour présenter son travail aux particuliers qui cherchent une maquilleuse.',
	},
]

function Project() {
	return (
		<section className={'relative px-4 py-20 md:px-8 2xl:px-0'}>
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto mb-10">
					<h2 className="text-start text-4xl font-bold tracking-tight text-gray-900 sm:text-4xl">
						Gardez votre projet beauté en tête, on vous aide à trouver la bonne maquilleuse
					</h2>
					<p className="mt-6 text-start text-lg text-gray-700 md:w-1/2">
						Trouvez une maquilleuse près de chez vous, comparez les profils et contactez-la directement, gratuitement.
					</p>
				</div>

				<section className={'mx-auto flex max-w-7xl flex-col-reverse gap-16 md:flex-row md:gap-32'}>
					<div className={'w-full md:w-1/2'}>
						<div className={'flex flex-col gap-2'}>
							{tabs.map(tab => (
								<div key={tab.title}>
									<div
										className={
											'rounded-2xl border border-gray-200 bg-gray-50 p-10 shadow-lg transition-all duration-300 ease-in-out hover:bg-gray-50 hover:shadow-lg md:border-none md:bg-none md:shadow-none'
										}
									>
										<h3 className={'mb-4 text-xl font-bold text-gray-700'}>{tab.title}</h3>
										<p className={'text-sm text-gray-500'}>{tab.content}</p>
									</div>
								</div>
							))}
						</div>
					</div>
					<div className={'flex items-center justify-center md:w-1/2'}>
						<Image
							className={'h-[250px] w-full rounded-2xl object-cover object-top md:h-[500px]'}
							src={'/assets/maquilleuse_project.webp'}
							alt={'illustration'}
							width={'500'}
							height={'350'}
						/>
					</div>
				</section>
			</div>
		</section>
	)
}

export default Project
