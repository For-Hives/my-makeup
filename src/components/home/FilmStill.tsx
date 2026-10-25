import { FILM_SIZE, type FilmSource, fallbackOf } from './film'

interface FilmStillProps {
	/** The still shown, best format first. */
	still: readonly FilmSource[]
	/** The still shown instead when the visitor asked for less motion (the end state of the film). */
	reduced?: readonly FilmSource[]
	alt: string
	className: string
}

/**
 * A still of the film in the arch, as a `<picture>`: the server draws it (it is the poster, and may be the largest
 * element of the first screen on a wide screen), and the film draws the end still over it when `play()` is refused.
 * Its size is given, so its box is known before it loads.
 */
export function FilmStill({ still, reduced = [], alt, className }: FilmStillProps) {
	return (
		<picture>
			{reduced.map(source => (
				<source key={source.src} media="(prefers-reduced-motion: reduce)" srcSet={source.src} type={source.type} />
			))}
			{still.map(source => (
				<source key={source.src} srcSet={source.src} type={source.type} />
			))}
			{/* A <picture> chooses by `prefers-reduced-motion`, which the image component cannot do; the files are sized and versioned. */}
			<img src={fallbackOf(still)} width={FILM_SIZE.width} height={FILM_SIZE.height} alt={alt} className={className} />
		</picture>
	)
}
