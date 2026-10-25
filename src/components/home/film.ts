/**
 * The film in the arch of the home hero, « L'Ombre nette » (decision of 25/10/2026): an intro that plays once and ends
 * on the red lip, then a loop that rests on it, whose first frame is the last frame of the intro and the last frame
 * its own first. Since v2 it is an AI video made from key frames (docs/accueil.md, « Le film »): the people in it are
 * generated, nobody real. Its files live under `public/assets/accueil/`, with a version in their name: next.config.ts
 * serves them as immutable, so a new render is a new name, never the same name with new bytes. `bun run film:check`
 * (scripts/film/check.ts) checks the seams of the files listed here before a render goes in.
 *
 * No React, no `next` import: read by the server part of the hero, by its client part and by the tests.
 */

const FOLDER = '/assets/accueil'

/** A file of the film and the type the browser checks before it asks for it. */
export interface FilmSource {
	src: string
	type: string
}

/**
 * The sources of each part, best first: the browser takes the first type it can play. AV1 for Chrome, Firefox and the
 * Apple devices that decode it, HEVC for the other Safaris, H.264 for what plays neither. The intro and the loop list
 * the same formats in the same order (scripts/film/seams.ts refuses otherwise). The codecs are read from the files
 * themselves (their av1C, hvcC and avcC boxes): AV1 Main, level 4.0, 10 bits; HEVC Main 10, level 4.0; H.264 High,
 * level 5.0. A new render reads them again: a wrong string makes a browser skip a file it could play.
 */
export const FILM_VIDEOS: Readonly<Record<'intro' | 'loop', readonly FilmSource[]>> = {
	intro: [
		{ src: `${FOLDER}/ombre-nette-intro-v2.av1.mp4`, type: 'video/mp4; codecs="av01.0.08M.10"' },
		{ src: `${FOLDER}/ombre-nette-intro-v2.hevc.mp4`, type: 'video/mp4; codecs="hvc1.2.4.L120.90"' },
		{ src: `${FOLDER}/ombre-nette-intro-v2.h264.mp4`, type: 'video/mp4; codecs="avc1.640032"' },
	],
	loop: [
		{ src: `${FOLDER}/ombre-nette-boucle-v2.av1.mp4`, type: 'video/mp4; codecs="av01.0.08M.10"' },
		{ src: `${FOLDER}/ombre-nette-boucle-v2.hevc.mp4`, type: 'video/mp4; codecs="hvc1.2.4.L120.90"' },
		{ src: `${FOLDER}/ombre-nette-boucle-v2.h264.mp4`, type: 'video/mp4; codecs="avc1.640032"' },
	],
}

/**
 * The two still frames, best format first: the first frame of the intro (the artists blurred, the client sharp) and
 * the end state (the red lip), which is the last frame of the intro and the first of the loop. The last entry of a list
 * is the one an `<img>` falls back to.
 */
export const FILM_STILLS: Readonly<Record<'start' | 'end', readonly FilmSource[]>> = {
	start: [
		{ src: `${FOLDER}/ombre-nette-debut-v2.avif`, type: 'image/avif' },
		{ src: `${FOLDER}/ombre-nette-debut-v2.webp`, type: 'image/webp' },
	],
	end: [
		{ src: `${FOLDER}/ombre-nette-fin-v2.avif`, type: 'image/avif' },
		{ src: `${FOLDER}/ombre-nette-fin-v2.webp`, type: 'image/webp' },
	],
}

/**
 * The size the film and its stills are rendered at: the widest arch is 28.5 rem (456 px), so a screen of density 2 gets
 * all its pixels. The box of the arch has the same shape.
 */
export const FILM_SIZE = { width: 1080, height: 1400 } as const

/** The file an `<img>` shows when no `<source>` of its `<picture>` applies. */
export const fallbackOf = (sources: readonly FilmSource[]): string => sources.at(-1)?.src ?? ''

/**
 * The screens where the arch is in the first screen and its poster is the largest paint there (measured in Chromium on
 * 25/10/2026 with the hero of three elements, docs/accueil.md, « Comment il se lance »):
 *
 * - from 64rem the arch stands beside the text (`.home-hero-grid`, globals.css), its top 9 to 12.5rem down the page
 *   (139 to 197 px): from 22rem tall the poster is the largest paint (at 20rem, a line of the headline);
 * - from 40rem to 64rem it comes under the text, its top 33 to 39rem down (532 to 618 px): from 50rem tall the poster
 *   is the largest paint (a tablet held upright), not on a phone held sideways (under 30rem tall, the arch below);
 * - below 40rem, a phone, the text block fills the first screen and the arch starts just below it.
 *
 * With reduced motion the poster is the largest paint from the first frame; with motion it becomes it once the arch has
 * risen (`enter-arch`, about 0.8 s). Elsewhere the largest paint is a text, and the poster waits (`loading="lazy"`).
 */
export const POSTER_SCREENS = [
	'(min-width: 64rem) and (min-height: 22rem)',
	'(min-width: 40rem) and (min-height: 50rem)',
] as const

/** A preload of the poster: the file, its type, and the screens it is asked on. */
export interface PosterPreload {
	href: string
	type: string
	media: string
}

/**
 * The poster is `loading="lazy"`: on a phone, upright or sideways, the arch comes after the text, below the first screen,
 * and a byte asked before the largest paint there (the sentence or the headline) delays it (LCP of P01). On the screens
 * of `POSTER_SCREENS` the poster is that largest paint: these preloads ask for it from the head, on those screens only.
 * Each one is the file the `<picture>` of the poster takes there, AVIF, once per motion setting (the end still under
 * reduced motion): a preload of another file would be a second download, and a browser without AVIF skips it by its
 * type. The motion setting is written in each screen of the list: in a media list, a condition joined to the last item
 * only would leave the other items true under both settings, and both files would be preloaded.
 */
export const POSTER_PRELOADS: readonly PosterPreload[] = [
	{ still: FILM_STILLS.start, motion: 'no-preference' },
	{ still: FILM_STILLS.end, motion: 'reduce' },
].map(({ still, motion }) => ({
	href: still[0]?.src ?? '',
	type: still[0]?.type ?? '',
	media: POSTER_SCREENS.map(screen => `${screen} and (prefers-reduced-motion: ${motion})`).join(', '),
}))

/** What the visitor's browser says, read once the page runs its script. */
export interface FilmConditions {
	/** `prefers-reduced-motion: reduce`. */
	reducedMotion: boolean
	/** `navigator.connection.saveData`. */
	saveData: boolean
	/** The arch is on the screen. */
	inView: boolean
	/** The tab is in front (`document.visibilityState`). */
	visible: boolean
	/** The page has finished loading and the browser had a moment of rest after it. */
	settled: boolean
	/** The visitor pressed the button of the badge to stop the film. */
	userPaused: boolean
	/** `play()` was refused: the end still is shown instead. */
	refused: boolean
}

/**
 * Whether the videos are put in the page. Once they are, they stay: leaving the screen pauses them. They come only
 * with every condition met, so a visitor who asked for less motion or to save data, or who never scrolls back to the
 * hero, downloads no byte of video, and the page is loaded before the first one is asked for.
 */
export function mountsFilm(conditions: FilmConditions): boolean {
	const { reducedMotion, saveData, inView, visible, settled, userPaused, refused } = conditions
	return !reducedMotion && !saveData && !refused && !userPaused && inView && visible && settled
}

/** Whether the mounted film plays right now: on the screen, in the tab in front, and not stopped by the visitor. */
export function playsFilm(conditions: FilmConditions): boolean {
	const { reducedMotion, refused, userPaused, inView, visible } = conditions
	return !reducedMotion && !refused && !userPaused && inView && visible
}

/** The name of the button of the badge, which says what a press does. */
export const filmButtonName = (userPaused: boolean): string => (userPaused ? 'Lire le film' : 'Mettre le film en pause')
