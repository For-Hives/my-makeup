import type { CSSProperties } from 'react'
import { SPECIALTY_BULLETS } from '@/lib/specialty'
import { FilmStill } from './FilmStill'
import { FILM_SIZE, FILM_STILLS } from './film'
import { GuidedSearch } from './GuidedSearch'
import { ArchFilm, FilmButton, HeroStage } from './HeroFilm'
import { heroSerif } from './hero-font'

/** The three things the platform does for a client, word for word those of the hero of issue 1066. */
export const HERO_STEPS = [
	'Cherchez par événement et par lieu',
	'Consultez des profils vérifiés',
	'Écrivez en direct à la maquilleuse',
] as const

const NUMERALS = ['i.', 'ii.', 'iii.'] as const

/** The words of the ribbon: the specialties a makeup artist chooses on her page, which the search filters by. */
export const RIBBON_WORDS: readonly string[] = SPECIALTY_BULLETS.map(bullet => bullet.label)

/** The hidden copies that follow the list in the ribbon: enough to cover a very wide screen while it slides by one. */
const RIBBON_COPIES = ['copy-1', 'copy-2', 'copy-3'] as const

/** The film's title around the badge. */
const RING_TEXT = 'L’OMBRE NETTE · UN FILM MY MAKEUP · '

/** The poster says what the film shows: it is the picture of the hero, the film only brings it to life. */
const POSTER_ALT = 'Ombres chinoises : une maquilleuse pose le rouge sur les lèvres de sa cliente'

/**
 * The order of the load-in (docs/mouvement.md): the eyebrow and the heading first, the paragraph and the arch, then the
 * form and the steps. Index 2 at most: with the tokens, the whole sequence is 660 ms.
 */
function enterOrder(index: 1 | 2): CSSProperties {
	return { '--enter-i': index } as CSSProperties
}

/** A picture inside the heading: decoration, so it adds no word to the name of the heading. Its size is fixed in em. */
function Pill({ src, className }: { src: string; className: string }) {
	return (
		// biome-ignore lint/performance/noImgElement: a 228 × 114 file made for this size; the image optimizer would add a request for nothing
		<img src={src} alt="" aria-hidden="true" width={228} height={114} className={`home-hero-pill ${className}`} />
	)
}

function RibbonList({ hidden }: { hidden: boolean }) {
	return (
		<ul
			className="home-hero-ribbon-list"
			aria-hidden={hidden ? 'true' : undefined}
			aria-label={hidden ? undefined : 'Spécialités'}
		>
			{RIBBON_WORDS.map(word => (
				<li key={word}>{word}</li>
			))}
		</ul>
	)
}

/**
 * The hero of the home page, « en arche » (decision of 25/10/2026, docs/accueil.md): the headline in Bodoni with two
 * pictures in its lines, the guided search as one outlined pill, three short steps, and on the right the arch that holds
 * the film « L'Ombre nette », its badge and, under the hero, a ribbon of the specialties. Only the home page uses it:
 * the other pages keep the shared `Hero`.
 *
 * The text of the h1 is the one of the site online, to the character: its lines are spans with a space between them,
 * and its two pictures are decoration (`alt=""`, `aria-hidden`), so the heading's name does not change.
 */
export function HomeHero() {
	return (
		<HeroStage className={`home-hero ${heroSerif.variable}`}>
			<div className="home-hero-grid">
				<div className="home-hero-text">
					<p className="home-hero-eyebrow enter-mask">Maquilleuses professionnelles, partout en France</p>
					<h1 className="home-hero-title enter-mask">
						<span className="home-hero-line">Trouver la maquilleuse</span>{' '}
						{/* The space between the second and the third line is before the first picture: on a phone, where the lines
						flow, the picture can go to the next line without a space left in front of it. */}
						<span className="home-hero-line">
							<em>qui vous correspond</em>{' '}
							<Pill src="/assets/accueil/pilule-levres-v0.webp" className="home-hero-pill-after" />
						</span>
						<span className="home-hero-line">
							<Pill src="/assets/accueil/pilule-pinceau-v0.webp" className="home-hero-pill-before" />
							n&apos;a jamais été
						</span>{' '}
						<span className="home-hero-line">aussi simple</span>
					</h1>
					<p className="home-hero-lede enter" style={enterOrder(1)}>
						Mariage, soirée, photo&#8239;: trouvez une maquilleuse professionnelle près de chez vous, découvrez son
						travail et écrivez-lui directement.
					</p>
					<div className="home-hero-search enter-fade" style={enterOrder(2)}>
						<GuidedSearch />
					</div>
					<ol className="home-hero-steps enter-fade" style={enterOrder(2)}>
						{HERO_STEPS.map((step, index) => (
							<li key={step}>
								<span className="home-hero-step-number" aria-hidden="true">
									{NUMERALS[index]}
								</span>
								<span>{step}</span>
							</li>
						))}
					</ol>
				</div>
				<div className="home-hero-arch-wrap enter-arch" style={enterOrder(1)}>
					<div className="home-hero-arch" style={{ aspectRatio: `${FILM_SIZE.width} / ${FILM_SIZE.height}` }}>
						<FilmStill
							still={FILM_STILLS.start}
							reduced={FILM_STILLS.end}
							alt={POSTER_ALT}
							className="absolute inset-0 h-full w-full object-cover"
						/>
						<ArchFilm />
					</div>
					<div className="home-hero-badge">
						<svg className="home-hero-ring" viewBox="0 0 112 112" aria-hidden="true">
							<defs>
								<path id="home-hero-ring-path" d="M56 56 m-42 0 a42 42 0 1 1 84 0 a42 42 0 1 1 -84 0" />
							</defs>
							<text>
								<textPath href="#home-hero-ring-path" textLength="262" lengthAdjust="spacing">
									{RING_TEXT}
								</textPath>
							</text>
						</svg>
						<FilmButton />
					</div>
				</div>
			</div>
			<div className="home-hero-ribbon">
				<div className="home-hero-ribbon-track">
					<RibbonList hidden={false} />
					{RIBBON_COPIES.map(copy => (
						<RibbonList key={copy} hidden />
					))}
				</div>
			</div>
		</HeroStage>
	)
}
