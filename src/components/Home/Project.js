import React from 'react'
import Image from 'next/image'

const tabs = [
	{
		title: 'Soyez incroyablement rapide & efficace',
		content:
			'Communiquez en temps réel, démarrez de nouvelles prestations en quelques jours, et recevez vos demandes rapidement.',
	},
	{
		title: 'Évoluez dans un espace sûr & un service sécurisé',
		content:
			'Concentrez-vous sur la collaboration grâce aux commentaires, évaluations, et aux profils des maquilleuses vérifiés.',
	},
	{
		title: 'Gagnez beaucoup de temps',
		content:
			'Consacrez 10 fois moins de temps à vos tâches de recherche, et de planification. Grâce à notre plateforme, vous pouvez trouver les meilleures maquilleuses, et planifier vos projets, le tout dans une solution unifiée.',
	},
	{
		title: 'Rejoignez une communauté de talents',
		content:
			'Créé pour et par des professionnels de la beauté, notre plateforme attire les meilleures maquilleuses. Nos managers dédiés à la réussite des maquilleuses soutiennent leurs carrières et le développement de leurs compétences.',
	},
]

function Project() {
	return (
		<section className={'relative py-20'}>
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto mb-10">
					<h2 className="text-start text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl">
						Gardez votre projet beauté en tête, on s&apos;occupe du reste
					</h2>
					<p className="mt-6 w-1/2 text-start text-lg text-slate-700">
						Trouvez les meilleures maquilleuses, planifiez votre projet, payez
						et recevez des paiements, le tout dans une solution unifiée. Oui,
						vous avez bien lu.
					</p>
				</div>

				<section className={'mx-auto flex max-w-7xl gap-32'}>
					<div className={'w-1/2'}>
						<div className={'flex flex-col gap-2'}>
							{tabs.map(tab => (
								<div key={tab.title}>
									<div
										className={
											'p-10 transition-all duration-300 ease-in-out hover:rounded-2xl hover:bg-slate-50 hover:shadow-lg'
										}
									>
										<h3 className={'mb-4 text-xl font-bold text-slate-700'}>
											{tab.title}
										</h3>
										<p className={'text-sm text-slate-500'}>{tab.content}</p>
									</div>
								</div>
							))}
						</div>
					</div>
					<div className={'flex w-1/2 items-center justify-center'}>
						<Image
							className={'h-[500px] w-full rounded-2xl object-cover object-top'}
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
