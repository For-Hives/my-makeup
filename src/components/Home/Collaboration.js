import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

function Collaboration() {
	return (
		<section className={'relative py-20 flex flex-col gap-10'}>
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto">
					<h2 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl text-center">
						Vous allez adorer cette nouvelle façon de collaborer
					</h2>
				</div>
			</div>
			<div className="mx-auto max-w-7xl mt-20">
				<div className="mx-auto flex w-full gap-16">
					<div
						className={
							'w-2/5 flex flex-col justify-center items-start relative gap-8'
						}
					>
						<h3 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-3xl text-left">
							Boostez votre activité
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Vous cherchez à vous épanouir dans votre carrière de maquilleuse
								professionnelle ? Ne cherchez plus, My Makeup est la solution
								idéale pour vous !
							</p>
							<p>
								Avec My Makeup, vous pouvez recevoir des offres de missions
								parfaitement adaptées à vos compétences et communiquer
								directement avec des clients potentiels dans tous les secteurs.
							</p>
							<p>
								Cerise sur le gâteau, notre équipe dédiée aux maquilleuses vous
								accompagne avec des ressources spécialisées, des partenariats,
								et des événements pour vous aider à développer votre carrière de
								manière optimale.
							</p>
						</div>
						<div className={'flex'}>
							<Link
								href="/signup"
								className={
									'text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900'
								}
							>
								Rejoindre la communauté
							</Link>
						</div>
					</div>
					<div className={'w-3/5 flex justify-center items-center'}>
						<div
							className={
								'ml-32 flex justify-center items-center w-full relative h-full'
							}
						>
							<Image
								className={'object-cover rounded-xl'}
								src={'/assets/maquilleuse_mariage.webp'}
								fill
								alt={'Maquilleuse pour un mariage'}
							/>
						</div>
					</div>
				</div>
			</div>
			<div className="mx-auto max-w-7xl mt-20">
				<div className="mx-auto flex w-full">
					<div className={'w-3/5 flex justify-center items-center'}>
						<div
							className={
								'mr-32 flex justify-center items-center w-full relative h-full'
							}
						>
							<Image
								className={'object-cover rounded-xl transform -scale-x-100'}
								src={'/assets/maquilleuse_soiree.webp'}
								fill
								alt={'Maquilleuse soirées'}
							/>
						</div>
					</div>
					<div
						className={
							'w-2/5 flex flex-col justify-center items-start h-auto relative gap-8'
						}
					>
						<h3 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-3xl text-left">
							Pour toutes & tous !
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Vous êtes spécialisée en maquillage pour les mariées ou en
								maquillage artistique ? Vous cherchez à travailler à Lyon,
								Nantes, Toulouse, Rennes, Lille, Cannes ou Paris ? Pas de
								problème ! Avec My Makeup, les gens qui en on besoin peuvent
								vous trouver facilement.
							</p>
							<p>
								N&apos;attendez plus pour rejoindre la communauté de
								maquilleuses professionnelles de My Makeup. Avec notre
								plateforme, vous pouvez trouver des missions passionnantes et
								des clients fidèles qui vous permettront de développer votre
								carrière à votre guise. Inscrivez-vous dès maintenant et
								commencez à construire votre avenir professionnel dès
								aujourd&apos;hui !
							</p>
						</div>
						<div className={'flex'}>
							<Link
								href="/signup"
								className={
									'text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900'
								}
							>
								J&apos;améliore ma visibilité
							</Link>
						</div>
					</div>
				</div>
			</div>
			<div className="mx-auto max-w-7xl mt-20">
				<div className="mx-auto flex w-full gap-16">
					<div
						className={
							'w-2/5 flex flex-col justify-center items-start relative gap-8'
						}
					>
						<h3 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-3xl text-left">
							Trouvez le profil idéal en seulement deux clics
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Avec de nombreuses maquilleuses freelances talentueuses
								disponibles sur notre plateforme, trouvez rapidement la
								maquilleuse professionnelle qui répond à tous vos besoins.
								Recherchez parmi les meilleurs profils disponibles pour votre
								projet, consultez leurs avis et expériences, et discutez
								directement avec eux pour les recruter en quelques clics.
							</p>
							<p>
								Trouvez votre experte en maquillage pour les mariées, une
								maquilleuse artistique, professionnelle ou spécialisée en
								maquillage yeux ou en maquillage de soirée. Besoin d&apos;une
								maquilleuse fx pour un projet cinéma ou d&apos;une maquilleuse
								événementielle pour une soirée spéciale ? Nous avons ce
								qu&apos;il vous faut !
							</p>
							<p>
								Nous sommes là pour faciliter votre recherche de maquilleuse
								freelance. Une fois que vous avez trouvé la bonne personne, nous
								nous occupons du reste. Alors n&apos;attendez plus, rejoignez My
								Makeup dès maintenant et trouvez votre maquilleuse de rêve en
								quelques clics !
							</p>
						</div>
						<div className={'flex'}>
							<a
								href="/recrutement"
								className={
									'text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900'
								}
							>
								Trouver la maquilleuse parfaite
							</a>
						</div>
					</div>
					<div className={'w-3/5 flex justify-center items-center'}>
						<div
							className={
								'ml-32 flex justify-center items-center w-full relative h-full'
							}
						>
							<Image
								className={'object-cover rounded-xl'}
								src={'/assets/maquilleuse_evenementiel.webp'}
								fill
								alt={'Maquilleuse evenementiel'}
							/>
						</div>
					</div>
				</div>
			</div>
			<div className="mx-auto max-w-7xl mt-20">
				<div className="mx-auto flex w-full">
					<div className={'w-3/5 flex justify-center items-center'}>
						<div
							className={
								'mr-32 flex justify-center items-center w-full relative h-full'
							}
						>
							<Image
								className={'object-cover rounded-xl transform'}
								src={'/assets/maquilleuse_fx.webp'}
								fill
								alt={'Maquilleuse fx'}
							/>
						</div>
					</div>
					<div
						className={
							'w-2/5 flex flex-col justify-center items-start h-auto relative gap-8'
						}
					>
						<h3 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-3xl text-left">
							Centralisez vos recherches dans une seule plateforme
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Que vous cherchiez une maquilleuse pour les mariées, une
								maquilleuse artistique ou une maquilleuse spécialisée en
								maquillage yeux, nous avons tout ce qu&apos;il vous faut.
								Trouvez facilement des maquilleuses expérimentées disponibles à
								Lyon, Nantes, Toulouse, Rennes, Lille, Cannes ou Paris, pour un
								maquillage professionnel ou un maquillage de soirée.
							</p>
							<p>
								Avec My Makeup, vous pouvez également trouver des maquilleuses
								fx pour vos projets cinéma ou des maquilleuses événementielles
								pour vos soirées spéciales. Besoin d&apos;une maquilleuse à
								domicile ou pour un anniversaire ? Nous avons également des
								profils adaptés à vos besoins.
							</p>
							<p>
								Notre solution de gestion est simple et intuitive, même pour les
								débutants. Avec My Makeup, vous pouvez centraliser toutes vos
								activités avec les maquilleuses professionnelles de votre choix,
								pour une gestion simplifiée.
							</p>
							<p>
								Alors n&apos;hésitez plus, inscrivez-vous dès maintenant sur My
								Makeup et simplifiez la gestion de vos activités avec vos
								maquilleuses professionnelles préférées !
							</p>
						</div>
						<div className={'flex'}>
							<a
								href="/recrutement"
								className={
									'text-sm font-bold leading-6 bg-indigo-900 text-white px-4 py-2 rounded-lg border-2 border-indigo-900'
								}
							>
								Découvrir notre solution
							</a>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export default Collaboration;
