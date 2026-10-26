import type { CSSProperties } from 'react'
import { preload } from 'react-dom'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { Icon } from '@/components/art/graphics'
import { SEARCH_LINK } from '@/components/layout/links'
import { SPECIALTY_BULLETS } from '@/lib/specialty'
import { FilmStill } from './FilmStill'
import { FILM_SIZE, FILM_STILLS, POSTER_PRELOADS, STILL_PLACEHOLDERS } from './film'
import { GuidedSearch } from './GuidedSearch'
import { ArchFilm, HeroStage, PauseButton } from './HeroFilm'
import { heroSerif, heroSerifText } from './hero-font'
import { RING_DEFAULT_SPACING, RING_RADIUS } from './ring'

/** The words of the ribbon: the specialties a makeup artist chooses on her page, which the search filters by. */
export const RIBBON_WORDS: readonly string[] = SPECIALTY_BULLETS.map(bullet => bullet.label)

/** The hidden copies that follow the list in the ribbon: enough to cover a very wide screen while it slides by one. */
const RIBBON_COPIES = ['copy-1', 'copy-2', 'copy-3'] as const

/** The name of the link of the badge, and the words of its ring: what a visitor reads is what a screen reader says. */
export const EXPLORE_LABEL = 'Explorer les maquilleuses'

/** U+00A0, written by its code point: as a character it would not show in this file. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0)

/**
 * The ring of the badge, once round its circle. It ends on a no-break space: an ordinary one, last in the text, is
 * dropped by the collapsing of white space, and the dot would touch the « E » where the ring closes.
 */
export const RING_TEXT = `${EXPLORE_LABEL.toUpperCase()} ·${NO_BREAK_SPACE}`

/**
 * The circle the ring runs on, in the 112 units of the badge (7rem from 40rem, 6.25rem on a phone: the units are pixels
 * on a large screen): the baseline at `RING_RADIUS` (37) from the centre, the capitals (set at 12.5, globals.css)
 * standing outward of it, so about 9 px of air between them and the edge of the notch (56), and 9 to 11 px between them
 * and the disc (28 px on a large screen, 22 px on a phone, where the units are 0.89 px). The words go exactly once round
 * the circle by their letter-spacing (ring.ts: the formula, and why not `textLength`); `HeroStage` measures them in the
 * face the browser draws and sets it.
 */
const RING_PATH = `M56 56m-${RING_RADIUS} 0a${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${2 * RING_RADIUS} 0a${RING_RADIUS} ${RING_RADIUS} 0 1 1 -${2 * RING_RADIUS} 0`

/**
 * What the film shows, said by the arch itself (`role="img"`), which is always there: on a phone the poster stays hidden
 * until the arch is seen, and a screen reader moving through the page would pass it first. The poster under it says
 * nothing, so the description is read once.
 */
const ARCH_DESCRIPTION = 'Silhouettes à contre-jour : une maquilleuse pose le rouge sur les lèvres de sa cliente'

/**
 * The box of the arch, at the shape of the film, and the blurred copies of its two stills that the stylesheet draws
 * under them (`.home-hero-arch::before`, by motion setting): in the HTML of the home page alone, not in the stylesheet
 * every page loads.
 */
const ARCH_STYLE = {
	aspectRatio: `${FILM_SIZE.width} / ${FILM_SIZE.height}`,
	'--arch-placeholder-start': `url(${STILL_PLACEHOLDERS.start})`,
	'--arch-placeholder-end': `url(${STILL_PLACEHOLDERS.end})`,
} as CSSProperties

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
 * The badge on the bottom-left corner of the arch (Andy, 26/10/2026): a round notch of the page tone that eats into the
 * corner of the film, the ink disc in its middle, now a link to the search with the arrow of the kit, and its name
 * turning slowly round it, in the type of the kit's badge. Server markup, like the kit's `RotatingBadge` it mirrors: the
 * link works without script and under reduced motion. Not that component itself: its ring turns on CSS alone (without
 * script, and with no way to stop it) and its centre is a 56 px link that reports nothing. Here the ring turns only
 * under the attribute the script sets and stops with the film and the ribbon, the disc keeps the size of the pause
 * button it replaces (44 px on a phone), and the click is measured like the other ways to the search (`cta_click`).
 */
function ExploreBadge() {
	return (
		<div className="home-hero-badge">
			<svg className="home-hero-ring" viewBox="0 0 112 112" aria-hidden="true" focusable="false">
				<defs>
					<path id="home-hero-ring-path" d={RING_PATH} />
				</defs>
				<text style={{ letterSpacing: `${RING_DEFAULT_SPACING}px` }}>
					<textPath href="#home-hero-ring-path">{RING_TEXT}</textPath>
				</text>
			</svg>
			<TrackedLink
				href={SEARCH_LINK.href}
				aria-label={EXPLORE_LABEL}
				className="home-hero-disc"
				suivi={{ nom: 'cta_click', proprietes: { where: 'accueil_explorer' } }}
			>
				<Icon name="arrow-right" className="art-arrow home-hero-arrow" />
			</TrackedLink>
		</div>
	)
}

/**
 * The hero of the home page, « en arche » (decisions of 25/10/2026, docs/accueil.md): the headline in Bodoni on three
 * lines, type alone, one sentence, the guided search, and on the right the arch that holds the film « L'Ombre nette »,
 * with the badge that leads to the search and, under the hero, a ribbon of the specialties. Nothing else: no eyebrow,
 * no numbered steps, no picture in the headline (Andy, 25/10/2026: fewer elements, to the essential). The film plays by
 * itself; its pause button shows only when it takes the keyboard focus (Andy, 26/10/2026). Only the home page uses it:
 * the other pages keep the shared `Hero`.
 *
 * The lines of the h1 are spans with a space between them: its text and its name are « Trouvez la maquilleuse qui vous
 * correspond près de chez vous. », one space between words.
 */
export function HomeHero() {
	// The poster is lazy (a phone held upright shows it once the arch is seen, sideways it is below the first screen; on
	// both the largest paint is a text). Where the arch is in the first screen
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
					<div className="home-hero-arch" role="img" aria-label={ARCH_DESCRIPTION} style={ARCH_STYLE}>
						<FilmStill
							still={FILM_STILLS.start}
							reduced={FILM_STILLS.end}
							alt=""
							loading="lazy"
							className="absolute inset-0 h-full w-full object-cover"
						/>
						{/* Without script the film never comes to bring the poster into focus: the end still covers it. */}
						<noscript>
							<FilmStill still={FILM_STILLS.end} alt="" className="absolute inset-0 h-full w-full object-cover" />
						</noscript>
						<ArchFilm />
					</div>
					<PauseButton />
					<ExploreBadge />
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
