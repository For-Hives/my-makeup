import Image from 'next/image'
import Link from 'next/link'

function Collaboration() {
	return (
		<section className={'relative flex flex-col gap-10 px-4 py-20 md:px-8 2xl:px-0'}>
			<div className="mx-auto max-w-7xl">
				<div className="mx-auto">
					<h2 className="text-center text-4xl font-bold tracking-tight text-gray-900 sm:text-4xl">
						Vous allez adorer cette nouvelle façon de collaborer
					</h2>
				</div>
			</div>
			<div className="mx-auto mt-20 max-w-7xl">
				<div className="mx-auto flex w-full flex-col gap-16 md:flex-row">
					<div className={'relative flex w-full flex-col items-start justify-center gap-8 md:w-2/5'}>
						<h3 className="text-left text-4xl font-bold tracking-tight text-gray-900 sm:text-3xl">
							Boostez votre activité
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Vous cherchez à vous épanouir dans votre carrière de maquilleuse professionnelle ? Ne cherchez plus,
								My-Makeup est la solution idéale pour vous !
							</p>
							<p>
								Avec My-Makeup, vous créez gratuitement votre page professionnelle : portfolio, spécialités, tarifs et
								coordonnées. Les particuliers qui cherchent une maquilleuse vous contactent directement.
							</p>
						</div>
						<div className={'flex'}>
							<Link href="/auth/signup" className={'btn-primary'}>
								Rejoindre la communauté
							</Link>
						</div>
					</div>
					<div className={'flex h-[250px] w-full items-center justify-center md:h-auto md:w-3/5'}>
						<div className={'relative flex h-full w-full items-center justify-center md:ml-32'}>
							<Image
								className={'rounded-xl object-cover'}
								src={'/assets/maquilleuse_mariage.webp'}
								fill
								alt={'Maquilleuse pour un mariage'}
							/>
						</div>
					</div>
				</div>
			</div>
			<div className="mx-auto mt-20 max-w-7xl">
				<div className="mx-auto flex w-full flex-col-reverse gap-16 md:flex-row md:gap-0">
					<div className={'flex h-[250px] w-full items-center justify-center md:h-auto md:w-3/5'}>
						<div className={'relative flex h-full w-full items-center justify-center md:mr-32'}>
							<Image
								className={'-scale-x-100 transform rounded-xl object-cover'}
								src={'/assets/maquilleuse_soiree.webp'}
								fill
								alt={'Maquilleuse soirées'}
							/>
						</div>
					</div>
					<div className={'relative flex h-auto flex-col items-start justify-center gap-8 md:w-2/5'}>
						<h3 className="text-left text-4xl font-bold tracking-tight text-gray-900 sm:text-3xl">
							Pour toutes & tous !
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Vous êtes spécialisée en maquillage pour les mariées ou en maquillage artistique ? Vous cherchez à
								travailler à Lyon, Nantes, Toulouse, Rennes, Lille, Cannes ou Paris ? Pas de problème ! Avec My-Makeup,
								les gens qui en ont besoin peuvent vous trouver facilement.
							</p>
							<p>
								N&apos;attendez plus pour rejoindre la communauté de maquilleuses professionnelles de My-Makeup. Avec
								notre plateforme, vous présentez votre travail à de nouvelles clientes et développez votre activité à
								votre rythme. Inscrivez-vous dès maintenant et commencez à construire votre avenir professionnel dès
								aujourd&apos;hui !
							</p>
						</div>
						<div className={'flex'}>
							<Link href="/auth/signup" className={'btn-primary'}>
								J&apos;améliore ma visibilité
							</Link>
						</div>
					</div>
				</div>
			</div>
			<div className="mx-auto mt-20 max-w-7xl">
				<div className="mx-auto flex w-full flex-col gap-16 md:flex-row">
					<div className={'relative flex w-full flex-col items-start justify-center gap-8 md:w-2/5'}>
						<h3 className="text-left text-4xl font-bold tracking-tight text-gray-900 sm:text-3xl">
							Trouvez le profil idéal en seulement deux clics
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Avec de nombreuses maquilleuses freelances talentueuses disponibles sur notre plateforme, trouvez
								rapidement la maquilleuse professionnelle qui répond à tous vos besoins. Recherchez parmi les meilleurs
								profils disponibles pour votre projet, consultez leurs expériences et leurs réalisations, et
								contactez-les directement.
							</p>
							<p>
								Trouvez votre experte en maquillage pour les mariées, une maquilleuse artistique, professionnelle ou
								spécialisée en maquillage yeux ou en maquillage de soirée. Besoin d&apos;une maquilleuse fx pour un
								projet cinéma ou d&apos;une maquilleuse événementielle pour une soirée spéciale ? Nous avons ce
								qu&apos;il vous faut !
							</p>
							<p>
								Nous sommes là pour faciliter votre recherche de maquilleuse freelance. Une fois que vous avez trouvé la
								bonne personne, il ne vous reste plus qu&apos;à la contacter. Alors n&apos;attendez plus, lancez votre
								recherche dès maintenant et trouvez votre maquilleuse de rêve en quelques clics !
							</p>
						</div>
						<div className={'flex'}>
							<Link href="/search" className={'btn-primary'}>
								Trouver la maquilleuse parfaite
							</Link>
						</div>
					</div>
					<div className={'flex h-[250px] items-center justify-center md:h-auto md:w-3/5'}>
						<div className={'relative flex h-full w-full items-center justify-center md:ml-32'}>
							<Image
								className={'rounded-xl object-cover'}
								src={'/assets/maquilleuse_evenementiel.webp'}
								fill
								alt={'Maquilleuse evenementiel'}
							/>
						</div>
					</div>
				</div>
			</div>
			<div className="mx-auto mt-20 max-w-7xl">
				<div className="mx-auto flex w-full flex-col-reverse gap-16 md:flex-row md:gap-0">
					<div className={'flex h-[250px] w-full items-center justify-center md:h-auto md:w-3/5'}>
						<div className={'relative flex h-full w-full items-center justify-center md:mr-32'}>
							<Image
								className={'transform rounded-xl object-cover'}
								src={'/assets/maquilleuse_fx.webp'}
								fill
								alt={'Maquilleuse fx'}
							/>
						</div>
					</div>
					<div className={'relative flex h-auto w-full flex-col items-start justify-center gap-8 md:w-2/5'}>
						<h3 className="text-left text-4xl font-bold tracking-tight text-gray-900 sm:text-3xl">
							Centralisez vos recherches dans une seule plateforme
						</h3>
						<div className={'flex flex-col gap-4'}>
							<p>
								Que vous cherchiez une maquilleuse pour les mariées, une maquilleuse artistique ou une maquilleuse
								spécialisée en maquillage yeux, nous avons tout ce qu&apos;il vous faut. Trouvez facilement des
								maquilleuses expérimentées disponibles à Lyon, Nantes, Toulouse, Rennes, Lille, Cannes ou Paris, pour un
								maquillage professionnel ou un maquillage de soirée.
							</p>
							<p>
								Avec My-Makeup, vous pouvez également trouver des maquilleuses fx pour vos projets cinéma ou des
								maquilleuses événementielles pour vos soirées spéciales. Besoin d&apos;une maquilleuse à domicile ou
								pour un anniversaire ? Nous avons également des profils adaptés à vos besoins.
							</p>
							<p>
								Profils, portfolios et tarifs indicatifs sont réunis au même endroit : comparez les maquilleuses, puis
								contactez directement celle qui vous plaît. La recherche est gratuite et ne demande aucune inscription.
							</p>
						</div>
						<div className={'flex'}>
							<Link href="/search" className={'btn-primary'}>
								Découvrir notre solution
							</Link>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}

export default Collaboration
