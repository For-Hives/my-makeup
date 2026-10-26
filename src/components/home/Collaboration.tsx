import { ArchImage } from '@/components/art/ArchImage'
import { archSizes } from '@/components/art/arch-sizes'
import type { Tint } from '@/components/art/CapsuleImage'
import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { Pill } from '@/components/art/Pill'
import { TitleAccent, type TitleSegment, TitleWithCapsules } from '@/components/art/TitleWithCapsules'
import { SOURCE_ASPECTS } from './photo-aspects'
import { SectionHead } from './SectionHead'

interface Block {
	/** The title as words (the text is the site's, word for word) and one capsule of decoration. */
	titre: readonly TitleSegment[]
	tint: Tint
	band: 'band' | 'rose'
	paragraphes: readonly string[]
	bouton: { href: string; libelle: string }
	image: { src: string; alt: string }
	/** The picture on the left on a large screen. */
	imageAGauche: boolean
}

// The texts are those of the home page online, word for word.
const BLOCKS: readonly Block[] = [
	{
		titre: [
			{ text: 'Boostez votre' },
			{ text: 'activité', tone: 'berry', italic: true },
			{ capsule: { object: 'lipstick', tint: 'blush' } },
		],
		tint: 'blush',
		band: 'band',
		paragraphes: [
			'Vous cherchez à vous épanouir dans votre carrière de maquilleuse professionnelle ? Ne cherchez plus, My-Makeup est la solution idéale pour vous !',
			'Avec My-Makeup, vous créez gratuitement votre page professionnelle : portfolio, spécialités, tarifs et coordonnées. Les particuliers qui cherchent une maquilleuse vous contactent directement.',
		],
		bouton: { href: '/auth/signup', libelle: 'Rejoindre la communauté' },
		image: {
			src: '/assets/maquilleuse_mariage.webp',
			alt: 'Maquilleuse pour un mariage',
		},
		imageAGauche: false,
	},
	{
		titre: [
			{ text: 'Pour' },
			{ text: 'toutes', tone: 'berry', italic: true },
			{ text: '& tous !' },
			{ capsule: { object: 'brush', tint: 'lavender', shape: 'round' } },
		],
		tint: 'lavender',
		band: 'rose',
		paragraphes: [
			'Vous êtes spécialisée en maquillage pour les mariées ou en maquillage artistique ? Vous cherchez à travailler à Lyon, Nantes, Toulouse, Rennes, Lille, Cannes ou Paris ? Pas de problème ! Avec My-Makeup, les gens qui en ont besoin peuvent vous trouver facilement.',
			"N'attendez plus pour rejoindre la communauté de maquilleuses professionnelles de My-Makeup. Avec notre plateforme, vous présentez votre travail à de nouvelles clientes et développez votre activité à votre rythme. Inscrivez-vous dès maintenant et commencez à construire votre avenir professionnel dès aujourd'hui !",
		],
		bouton: { href: '/auth/signup', libelle: "J'améliore ma visibilité" },
		image: {
			src: '/assets/maquilleuse_soiree.webp',
			alt: 'Maquilleuse soirées',
		},
		imageAGauche: true,
	},
	{
		titre: [
			{ text: 'Trouvez le' },
			{ text: 'profil', tone: 'berry', italic: true },
			{ text: 'idéal en seulement deux clics' },
		],
		tint: 'sand',
		band: 'band',
		paragraphes: [
			'Avec de nombreuses maquilleuses freelances talentueuses disponibles sur notre plateforme, trouvez rapidement la maquilleuse professionnelle qui répond à tous vos besoins. Recherchez parmi les meilleurs profils disponibles pour votre projet, consultez leurs expériences et leurs réalisations, et contactez-les directement.',
			"Trouvez votre experte en maquillage pour les mariées, une maquilleuse artistique, professionnelle ou spécialisée en maquillage yeux ou en maquillage de soirée. Besoin d'une maquilleuse fx pour un projet cinéma ou d'une maquilleuse événementielle pour une soirée spéciale ? Nous avons ce qu'il vous faut !",
			"Nous sommes là pour faciliter votre recherche de maquilleuse freelance. Une fois que vous avez trouvé la bonne personne, il ne vous reste plus qu'à la contacter. Alors n'attendez plus, lancez votre recherche dès maintenant et trouvez votre maquilleuse de rêve en quelques clics !",
		],
		bouton: { href: '/search', libelle: 'Trouver la maquilleuse parfaite' },
		image: {
			src: '/assets/maquilleuse_evenementiel.webp',
			alt: 'Maquilleuse evenementiel',
		},
		imageAGauche: false,
	},
	{
		titre: [
			{ text: 'Centralisez vos recherches dans une' },
			{ text: 'seule', tone: 'berry', italic: true },
			{ text: 'plateforme' },
		],
		tint: 'rose',
		band: 'rose',
		paragraphes: [
			"Que vous cherchiez une maquilleuse pour les mariées, une maquilleuse artistique ou une maquilleuse spécialisée en maquillage yeux, nous avons tout ce qu'il vous faut. Trouvez facilement des maquilleuses expérimentées disponibles à Lyon, Nantes, Toulouse, Rennes, Lille, Cannes ou Paris, pour un maquillage professionnel ou un maquillage de soirée.",
			"Avec My-Makeup, vous pouvez également trouver des maquilleuses fx pour vos projets cinéma ou des maquilleuses événementielles pour vos soirées spéciales. Besoin d'une maquilleuse à domicile ou pour un anniversaire ? Nous avons également des profils adaptés à vos besoins.",
			'Profils, portfolios et tarifs indicatifs sont réunis au même endroit : comparez les maquilleuses, puis contactez directement celle qui vous plaît. La recherche est gratuite et ne demande aucune inscription.',
		],
		bouton: { href: '/search', libelle: 'Découvrir notre solution' },
		image: { src: '/assets/maquilleuse_fx.webp', alt: 'Maquilleuse fx' },
		imageAGauche: true,
	},
]

/** The title of a block: its words keep the site's text, the capsule is decoration (hidden from a screen reader). */
function blockKey(bloc: Block): string {
	return bloc.titre.map(part => ('text' in part ? part.text : '')).join(' ')
}

export function Collaboration() {
	return (
		<section className="home-section relative overflow-hidden border-indigo-900/10 border-t bg-art-paper py-16 md:py-28">
			<GlowBlob size="md" tone="indigo" className="-top-56 -left-64 opacity-40" />
			<div className="page-frame relative">
				<SectionHead
					display
					align="center"
					titre={
						<>
							Vous allez adorer cette nouvelle façon de{' '}
							<TitleAccent tone="berry" italic>
								collaborer
							</TitleAccent>
						</>
					}
				/>
			</div>
			<div className="page-frame relative mt-12 divide-y divide-indigo-900/10 md:mt-16">
				{BLOCKS.map(bloc => (
					<div key={blockKey(bloc)} className="py-14 md:py-24">
						<div className="mx-auto grid items-center gap-14 md:grid-cols-2 md:gap-24">
							<div className="flex flex-col items-start gap-7">
								<TitleWithCapsules segments={bloc.titre} as="h3" size="card" className="reveal" />
								<div className="reveal flex flex-col gap-4 text-mute">
									{bloc.paragraphes.map(paragraphe => (
										<p key={paragraphe}>{paragraphe}</p>
									))}
								</div>
								<div className="reveal flex">
									<Pill href={bloc.bouton.href} variant="filled" arrow>
										{bloc.bouton.libelle}
									</Pill>
								</div>
							</div>
							<div
								className={`reveal mx-auto w-full max-w-[20rem] md:max-w-[24rem] ${bloc.imageAGauche ? 'md:order-first' : ''}`}
							>
								<ArchImage
									src={bloc.image.src}
									alt={bloc.image.alt}
									tint={bloc.tint}
									band={bloc.band}
									side={bloc.imageAGauche ? 'left' : 'right'}
									mark={bloc.imageAGauche ? 'ring' : 'plus'}
									quality={90}
									sizes={archSizes({ desktop: 24, mobile: 20, sourceAspect: SOURCE_ASPECTS[bloc.image.src] })}
								/>
							</div>
						</div>
					</div>
				))}
			</div>
			<PrintMark kind="ring" className="absolute right-[6%] bottom-12 hidden h-4 w-4 text-art-berry md:block" />
		</section>
	)
}
