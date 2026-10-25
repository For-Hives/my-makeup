import type { CSSProperties } from 'react'
import { preload } from 'react-dom'
import { SPECIALTY_BULLETS } from '@/lib/specialty'
import { FilmStill } from './FilmStill'
import { FILM_SIZE, FILM_STILLS, POSTER_PRELOADS } from './film'
import { GuidedSearch } from './GuidedSearch'
import { ArchFilm, FilmButton, HeroStage } from './HeroFilm'
import { heroSerif, heroSerifText } from './hero-font'

/** The words of the ribbon: the specialties a makeup artist chooses on her page, which the search filters by. */
export const RIBBON_WORDS: readonly string[] = SPECIALTY_BULLETS.map(bullet => bullet.label)

/** The hidden copies that follow the list in the ribbon: enough to cover a very wide screen while it slides by one. */
const RIBBON_COPIES = ['copy-1', 'copy-2', 'copy-3'] as const

/** U+00A0, written by its code point: as a character it would not show in this file. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0)

/**
 * The film's title around the badge. It ends on a no-break space: an ordinary one, last in the text, is dropped by the
 * collapsing of white space, and the dot would touch the « L » where the ring closes.
 */
const RING_TEXT = `L’OMBRE NETTE · UN FILM MY MAKEUP ·${NO_BREAK_SPACE}`

/** The poster says what the film shows: it is the picture of the hero, the film only brings it to life. */
const POSTER_ALT = 'Ombres chinoises : une maquilleuse pose le rouge sur les lèvres de sa cliente'

/**
 * The order of the load-in (docs/mouvement.md): the heading first, then the sentence and the arch, then the search.
 * Index 2 at most: with the tokens, the whole sequence is 660 ms.
 */
function enterOrder(index: 1 | 2): CSSProperties {
	return { '--enter-i': index } as CSSProperties
}

/**
 * The picture of the heading: a crop of a frame of the film (the red lips), 342 × 171, more than twice its size on a wide
 * screen (131 × 66 at 1440 px). AVIF first, the WebP as the image of the `<img>`.
 */
export const HERO_PILL = {
	avif: '/assets/accueil/pilule-levres-v2.avif',
	webp: '/assets/accueil/pilule-levres-v2.webp',
} as const

/**
 * The picture inside the heading: decoration, so it adds no word to the name of the heading. Its size is fixed in em, so
 * it moves nothing when it comes. Lazy: React writes no preload for it in the head, and the browser asks for it once the
 * page is laid out, after the first paint, so it is no request in front of what a phone paints first (LCP of P01).
 */
function Pill() {
	return (
		<picture>
			<source srcSet={HERO_PILL.avif} type="image/avif" />
			{/* A file made for this size: the image optimizer would add a request for nothing. */}
			<img
				src={HERO_PILL.webp}
				alt=""
				aria-hidden="true"
				width={342}
				height={171}
				loading="lazy"
				className="home-hero-pill"
			/>
		</picture>
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
 * The hero of the home page, « en arche » (decisions of 25/10/2026, docs/accueil.md): the headline in Bodoni on three
 * lines with one picture in its second line, one sentence, the guided search, and on the right the arch that holds the
 * film « L'Ombre nette », its badge and, under the hero, a ribbon of the specialties. Nothing else: no eyebrow, no
 * numbered steps (Andy, 25/10/2026: fewer elements, to the essential). Only the home page uses it: the other pages keep
 * the shared `Hero`.
 *
 * The lines of the h1 are spans with a space between them, and its picture is decoration (`alt=""`, `aria-hidden`): its
 * text and its name are « Trouvez la maquilleuse qui vous correspond près de chez vous. », one space between words.
 */
export function HomeHero() {
	// The poster is lazy (below the first screen of a phone, upright or sideways). Where the arch is in the first screen
	// and its poster the largest paint (`POSTER_SCREENS`: from 64rem, or a tablet held upright), these preloads in the
	// head ask for it as early as the stylesheets, the very file its <picture> takes there (film.ts).
	for (const { href, type, media } of POSTER_PRELOADS)
		preload(href, { as: 'image', type, media, fetchPriority: 'high' })
	return (
		<HeroStage className={`home-hero ${heroSerif.variable} ${heroSerifText.variable}`}>
			<div className="home-hero-grid">
				<div className="home-hero-text">
					<h1 className="home-hero-title enter-mask">
						<span className="home-hero-line">Trouvez la maquilleuse</span>{' '}
						{/* The space between the second and the third line is the one before the picture: the text reads « correspond
						près », and the picture, decoration, adds nothing to it. */}
						<span className="home-hero-line">
							<em>qui vous correspond</em> <Pill />
						</span>
						<span className="home-hero-line">près de chez vous.</span>
					</h1>
					<p className="home-hero-lede enter" style={enterOrder(1)}>
						Mariage, soirée, shooting&#8239;: des maquilleuses professionnelles, à&nbsp;contacter en direct.
					</p>
					<div className="home-hero-search enter-fade" style={enterOrder(2)}>
						<GuidedSearch />
					</div>
				</div>
				<div className="home-hero-arch-wrap enter-arch" style={enterOrder(1)}>
					<div className="home-hero-arch" style={{ aspectRatio: `${FILM_SIZE.width} / ${FILM_SIZE.height}` }}>
						<FilmStill
							still={FILM_STILLS.start}
							reduced={FILM_STILLS.end}
							alt={POSTER_ALT}
							loading="lazy"
							className="absolute inset-0 h-full w-full object-cover"
						/>
						{/* Without script the film never comes to bring the poster into focus: the end still covers it. */}
						<noscript>
							<FilmStill still={FILM_STILLS.end} alt="" className="absolute inset-0 h-full w-full object-cover" />
						</noscript>
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
