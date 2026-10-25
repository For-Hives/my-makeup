/**
 * The seams of the film « L'Ombre nette » in the arch of the home hero (docs/accueil.md, « Le film »), as data and pure
 * functions: no ffmpeg, no file read here.
 *
 * A seam is two frames that the visitor must see as one: the last frame of the loop and its first (each turn of
 * `loop`), the last frame of the intro and the first of the loop (the swap on `ended`), the poster and the first frame
 * of the intro (the film starts over the poster), the end still and the first frame of the loop (the still stands for
 * the film under reduced motion, Save-Data or a refused `play()`). Each seam is checked in every format, because each
 * browser plays its own.
 *
 * Two readers: scripts/film/check.ts decodes the real files, tests/unit/film-seams.test.ts checks these rules.
 */

import type { FilmSource } from '../../src/components/home/film'

/**
 * Above this distance (root mean square on the 8-bit RGB channels, from 0 to 1), two frames that should be one show a
 * jump. The film v2 (an AI video) sits under 0.0096 on every seam, its frames equal before encoding: the distance left is
 * the encoding of the grain of its backlit paper, highest at the end of the intro (one keyframe per file) in H.264. The
 * Blender render v1 sat under 0.007; the draft v0, whose loop started before the red, at 0.065.
 */
export const SEAM_LIMIT = 0.01

/** One frame of a file of the film. A still has a single frame, its `first`. */
export interface FrameOf {
	src: string
	frame: 'first' | 'last'
}

/** Two frames that must be one, and what the visitor would see if they were not. */
export interface Seam {
	label: string
	a: FrameOf
	b: FrameOf
}

/** The files of the film, as `FILM_VIDEOS` and `FILM_STILLS` of src/components/home/film.ts list them. */
export interface FilmFiles {
	videos: Readonly<Record<'intro' | 'loop', readonly FilmSource[]>>
	stills: Readonly<Record<'start' | 'end', readonly FilmSource[]>>
}

/** The format of a file, for the labels: `av1`, `hevc`, `h264`, `avif`, `webp`. */
const formatOf = (src: string): string => /\.([a-z0-9]+)(?:\.mp4)?$/.exec(src)?.[1] ?? src

/**
 * Every seam of the film. The intro and the loop must list the same formats in the same order: the browser takes the
 * first type it can play in each list, so the intro and the loop it plays are the files at the same place.
 */
export function seamsOf(videos: FilmFiles['videos'], stills: FilmFiles['stills']): Seam[] {
	const { intro, loop } = videos
	const types = (sources: readonly FilmSource[]) => sources.map(source => source.type).join('|')
	if (types(intro) !== types(loop))
		throw new Error('L’intro et la boucle doivent avoir les mêmes formats, dans le même ordre.')
	const seams: Seam[] = []
	for (const [index, loopSource] of loop.entries()) {
		const introSource = intro[index] as FilmSource
		const format = formatOf(loopSource.src)
		seams.push({
			label: `${format} : la boucle revient à sa première image`,
			a: { src: loopSource.src, frame: 'last' },
			b: { src: loopSource.src, frame: 'first' },
		})
		seams.push({
			label: `${format} : l’intro finit sur la première image de la boucle`,
			a: { src: introSource.src, frame: 'last' },
			b: { src: loopSource.src, frame: 'first' },
		})
	}
	for (const still of stills.start)
		for (const introSource of intro)
			seams.push({
				label: `affiche ${formatOf(still.src)} = première image de l’intro ${formatOf(introSource.src)}`,
				a: { src: still.src, frame: 'first' },
				b: { src: introSource.src, frame: 'first' },
			})
	for (const still of stills.end)
		for (const loopSource of loop)
			seams.push({
				label: `image de fin ${formatOf(still.src)} = première image de la boucle ${formatOf(loopSource.src)}`,
				a: { src: still.src, frame: 'first' },
				b: { src: loopSource.src, frame: 'first' },
			})
	return seams
}

/** The distance between two frames of the same size, given as 8-bit channels: 0 when equal, 1 from black to white. */
export function rmse(a: Uint8Array, b: Uint8Array): number {
	if (a.length !== b.length || a.length === 0)
		throw new Error(`Deux images de tailles différentes : ${a.length} et ${b.length} octets.`)
	let sum = 0
	for (let index = 0; index < a.length; index++) {
		const difference = (a[index] as number) - (b[index] as number)
		sum += difference * difference
	}
	return Math.sqrt(sum / a.length) / 255
}
