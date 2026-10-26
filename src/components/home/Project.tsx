import Image from 'next/image'
import { SectionHead } from './SectionHead'

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
		<section className="home-section relative border-indigo-900/10 border-t bg-indigo-50/50 py-16 md:py-28">
			<div className="page-frame">
				<SectionHead titre="Gardez votre projet beauté en tête, on vous aide à trouver la bonne maquilleuse">
					Trouvez une maquilleuse près de chez vous, comparez les profils et contactez-la directement, gratuitement.
				</SectionHead>

				<div className="mt-12 flex flex-col-reverse gap-12 md:mt-20 md:flex-row md:gap-32">
					<div className="w-full md:w-1/2">
						<div className="flex flex-col gap-2">
							{TABS.map(onglet => (
								<div key={onglet.titre} className="reveal">
									<div className="rounded-2xl border border-gray-200 bg-gray-50 p-10 shadow-lg md:border-none md:bg-none md:shadow-none">
										<h3 className="mb-4 font-bold text-gray-700 text-xl">{onglet.titre}</h3>
										<p className="text-gray-600 text-sm">{onglet.contenu}</p>
									</div>
								</div>
							))}
						</div>
					</div>
					<div className="reveal flex items-center justify-center md:w-1/2">
						<Image
							className="h-[250px] w-full rounded-2xl object-cover object-top md:h-[500px]"
							src="/assets/maquilleuse_project.webp"
							alt="illustration"
							width={500}
							quality={90}
							height={350}
						/>
					</div>
				</div>
			</div>
		</section>
	)
}
