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

/** The poster says what the film shows: it is the picture of the hero, the film only brings it to life. */
const POSTER_ALT = 'Ombres chinoises : une maquilleuse pose le rouge sur les lèvres de sa cliente'

/**
 * The order of the load-in (docs/mouvement.md): the heading first, then the sentence and the arch, then the search.
 * Index 2 at most: with the tokens, the whole sequence is 660 ms.
 */
function enterOrder(index: 1 | 2): CSSProperties {
	return { '--enter-i': index } as CSSProperties
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
 * lines, type alone, one sentence, the guided search, and on the right the arch that holds the film « L'Ombre nette »,
 * the button that pauses it and, under the hero, a ribbon of the specialties. Nothing else: no eyebrow, no numbered
 * steps, no picture in the headline, no ring of text around the button (Andy, 25/10/2026: fewer elements, to the
 * essential). Only the home page uses it: the other pages keep the shared `Hero`.
 *
 * The lines of the h1 are spans with a space between them: its text and its name are « Trouvez la maquilleuse qui vous
 * correspond près de chez vous. », one space between words.
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
						{/* Under 30rem « maquilleuse » takes a line of its own, for a larger headline (globals.css): a span, so the
						text keeps its space. */}
						<span className="home-hero-line">
							Trouvez la <span className="home-hero-split">maquilleuse</span>
						</span>{' '}
						<span className="home-hero-line">
							<em>qui vous correspond</em>
						</span>{' '}
						<span className="home-hero-line">près de chez vous.</span>
					</h1>
					<p className="home-hero-lede enter" style={enterOrder(1)}>
						Des maquilleuses professionnelles, à&nbsp;contacter en direct.
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
