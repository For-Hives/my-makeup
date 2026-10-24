import Image from 'next/image'
import Link from 'next/link'
import { SectionHead } from './SectionHead'

interface Block {
	titre: string
	paragraphes: readonly string[]
	bouton: { href: string; libelle: string }
	image: { src: string; alt: string; classe: string }
	/** The picture on the left on a large screen. */
	imageAGauche: boolean
}

// The texts are those of the home page online, word for word.
const BLOCKS: readonly Block[] = [
	{
		titre: 'Boostez votre activité',
		paragraphes: [
			'Vous cherchez à vous épanouir dans votre carrière de maquilleuse professionnelle ? Ne cherchez plus, My-Makeup est la solution idéale pour vous !',
			'Avec My-Makeup, vous créez gratuitement votre page professionnelle : portfolio, spécialités, tarifs et coordonnées. Les particuliers qui cherchent une maquilleuse vous contactent directement.',
		],
		bouton: { href: '/auth/signup', libelle: 'Rejoindre la communauté' },
		image: {
			src: '/assets/maquilleuse_mariage.webp',
			alt: 'Maquilleuse pour un mariage',
			classe: 'rounded-xl object-cover',
		},
		imageAGauche: false,
	},
	{
		titre: 'Pour toutes & tous !',
		paragraphes: [
			'Vous êtes spécialisée en maquillage pour les mariées ou en maquillage artistique ? Vous cherchez à travailler à Lyon, Nantes, Toulouse, Rennes, Lille, Cannes ou Paris ? Pas de problème ! Avec My-Makeup, les gens qui en ont besoin peuvent vous trouver facilement.',
			"N'attendez plus pour rejoindre la communauté de maquilleuses professionnelles de My-Makeup. Avec notre plateforme, vous présentez votre travail à de nouvelles clientes et développez votre activité à votre rythme. Inscrivez-vous dès maintenant et commencez à construire votre avenir professionnel dès aujourd'hui !",
		],
		bouton: { href: '/auth/signup', libelle: "J'améliore ma visibilité" },
		image: {
			src: '/assets/maquilleuse_soiree.webp',
			alt: 'Maquilleuse soirées',
			classe: '-scale-x-100 transform rounded-xl object-cover',
		},
		imageAGauche: true,
	},
	{
		titre: 'Trouvez le profil idéal en seulement deux clics',
		paragraphes: [
			'Avec de nombreuses maquilleuses freelances talentueuses disponibles sur notre plateforme, trouvez rapidement la maquilleuse professionnelle qui répond à tous vos besoins. Recherchez parmi les meilleurs profils disponibles pour votre projet, consultez leurs expériences et leurs réalisations, et contactez-les directement.',
			"Trouvez votre experte en maquillage pour les mariées, une maquilleuse artistique, professionnelle ou spécialisée en maquillage yeux ou en maquillage de soirée. Besoin d'une maquilleuse fx pour un projet cinéma ou d'une maquilleuse événementielle pour une soirée spéciale ? Nous avons ce qu'il vous faut !",
			"Nous sommes là pour faciliter votre recherche de maquilleuse freelance. Une fois que vous avez trouvé la bonne personne, il ne vous reste plus qu'à la contacter. Alors n'attendez plus, lancez votre recherche dès maintenant et trouvez votre maquilleuse de rêve en quelques clics !",
		],
		bouton: { href: '/search', libelle: 'Trouver la maquilleuse parfaite' },
		image: {
			src: '/assets/maquilleuse_evenementiel.webp',
			alt: 'Maquilleuse evenementiel',
			classe: 'rounded-xl object-cover',
		},
		imageAGauche: false,
	},
	{
		titre: 'Centralisez vos recherches dans une seule plateforme',
		paragraphes: [
			"Que vous cherchiez une maquilleuse pour les mariées, une maquilleuse artistique ou une maquilleuse spécialisée en maquillage yeux, nous avons tout ce qu'il vous faut. Trouvez facilement des maquilleuses expérimentées disponibles à Lyon, Nantes, Toulouse, Rennes, Lille, Cannes ou Paris, pour un maquillage professionnel ou un maquillage de soirée.",
			"Avec My-Makeup, vous pouvez également trouver des maquilleuses fx pour vos projets cinéma ou des maquilleuses événementielles pour vos soirées spéciales. Besoin d'une maquilleuse à domicile ou pour un anniversaire ? Nous avons également des profils adaptés à vos besoins.",
			'Profils, portfolios et tarifs indicatifs sont réunis au même endroit : comparez les maquilleuses, puis contactez directement celle qui vous plaît. La recherche est gratuite et ne demande aucune inscription.',
		],
		bouton: { href: '/search', libelle: 'Découvrir notre solution' },
		image: { src: '/assets/maquilleuse_fx.webp', alt: 'Maquilleuse fx', classe: 'transform rounded-xl object-cover' },
		imageAGauche: true,
	},
]

function BlockImage({ image, cote }: { image: Block['image']; cote: 'gauche' | 'droite' }) {
	return (
		<div className="reveal flex h-[250px] w-full items-center justify-center md:h-auto md:w-3/5">
			<div
				className={`relative flex h-full w-full items-center justify-center ${cote === 'droite' ? 'md:ml-32' : 'md:mr-32'}`}
			>
				<Image className={image.classe} src={image.src} fill sizes="(min-width: 768px) 50vw, 100vw" alt={image.alt} />
			</div>
		</div>
	)
}

export function Collaboration() {
	return (
		<section className="home-section relative border-indigo-900/10 border-t px-4 py-16 md:px-8 md:py-28 2xl:px-0">
			<div className="mx-auto max-w-7xl">
				<SectionHead align="center" titre="Vous allez adorer cette nouvelle façon de collaborer" />
			</div>
			<div className="mx-auto mt-12 max-w-7xl divide-y divide-indigo-900/10 md:mt-16">
				{BLOCKS.map(bloc => (
					<div key={bloc.titre} className="py-12 md:py-20">
						<div
							className={`mx-auto flex w-full gap-16 ${bloc.imageAGauche ? 'flex-col-reverse md:flex-row md:gap-0' : 'flex-col md:flex-row'}`}
						>
							{bloc.imageAGauche && <BlockImage image={bloc.image} cote="gauche" />}
							<div className="relative flex h-auto w-full flex-col items-start justify-center gap-8 md:w-2/5">
								<h3 className="reveal text-left font-bold text-4xl text-gray-900 tracking-tight sm:text-3xl">
									{bloc.titre}
								</h3>
								<div className="reveal flex flex-col gap-4">
									{bloc.paragraphes.map(paragraphe => (
										<p key={paragraphe}>{paragraphe}</p>
									))}
								</div>
								<div className="reveal flex">
									<Link href={bloc.bouton.href} className="btn-primary">
										{bloc.bouton.libelle}
									</Link>
								</div>
							</div>
							{!bloc.imageAGauche && <BlockImage image={bloc.image} cote="droite" />}
						</div>
					</div>
				))}
			</div>
		</section>
	)
}
