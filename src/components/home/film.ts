/**
 * The film in the arch of the home hero, « L'Ombre nette » (decision of 25/10/2026): an intro that plays once, then
 * a loop whose first frame is the last frame of the intro. Its files live under `public/assets/accueil/`, with a
 * version in their name: next.config.ts serves them as immutable, so a new render is a new name, never the same name
 * with new bytes.
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
 * The sources of each part, best first: the browser takes the first type it can play. The final render adds its HEVC
 * file with one line in each list, before the H.264 one: `{ src: …hevc.mp4, type: 'video/mp4; codecs="hvc1"' }`.
 * The codecs are those of the files (ffprobe): AV1 Main, level 4.0, 8 bits; H.264 High, level 3.0.
 */
export const FILM_VIDEOS: Readonly<Record<'intro' | 'loop', readonly FilmSource[]>> = {
	intro: [
		{ src: `${FOLDER}/ombre-nette-intro-v0.av1.mp4`, type: 'video/mp4; codecs="av01.0.04M.08"' },
		{ src: `${FOLDER}/ombre-nette-intro-v0.h264.mp4`, type: 'video/mp4; codecs="avc1.64001E"' },
	],
	loop: [
		{ src: `${FOLDER}/ombre-nette-boucle-v0.av1.mp4`, type: 'video/mp4; codecs="av01.0.04M.08"' },
		{ src: `${FOLDER}/ombre-nette-boucle-v0.h264.mp4`, type: 'video/mp4; codecs="avc1.64001E"' },
	],
}

/**
 * The two still frames, best format first: the first frame of the intro (soft silhouettes, the client sharp) and the
 * end state (the red lip), which is also the first frame of the loop. The final render adds its `.avif` files with one
 * line at the top of each list, `{ src: ….avif, type: 'image/avif' }`. The last entry of a list is the one an `<img>`
 * falls back to.
 */
export const FILM_STILLS: Readonly<Record<'start' | 'end', readonly FilmSource[]>> = {
	start: [{ src: `${FOLDER}/ombre-nette-debut-v0.webp`, type: 'image/webp' }],
	end: [{ src: `${FOLDER}/ombre-nette-fin-v0.webp`, type: 'image/webp' }],
}

/** The size the film is rendered at (the placeholders are half of it): the box of the arch has the same shape. */
export const FILM_SIZE = { width: 1080, height: 1400 } as const

/** The file an `<img>` shows when no `<source>` of its `<picture>` applies. */
export const fallbackOf = (sources: readonly FilmSource[]): string => sources.at(-1)?.src ?? ''

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
