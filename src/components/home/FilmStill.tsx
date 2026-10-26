import { FILM_SIZE, type FilmSource, fallbackOf } from './film'

interface FilmStillProps {
	/** The still shown, best format first. */
	still: readonly FilmSource[]
	/** The still shown instead when the visitor asked for less motion (the end state of the film). */
	reduced?: readonly FilmSource[]
	alt: string
	className: string
	/** `lazy` for the poster: below the first screen of a phone, it must not be asked before the largest paint there. */
	loading?: 'lazy'
}

/**
 * A still of the film in the arch, as a `<picture>`: the server draws it (it is the poster, and the largest element of
 * the first screen on a wide screen or a tablet held upright, `POSTER_SCREENS` of film.ts), and the film draws the end
 * still over it when `play()` is refused.
 * Its size is given, so its box is known before it loads.
 */
export function FilmStill({ still, reduced = [], alt, className, loading }: FilmStillProps) {
	return (
		<picture>
			{reduced.map(source => (
				<source key={source.src} media="(prefers-reduced-motion: reduce)" srcSet={source.src} type={source.type} />
			))}
			{still.map(source => (
				<source key={source.src} srcSet={source.src} type={source.type} />
			))}
			{/* A <picture> chooses by `prefers-reduced-motion`, which the image component cannot do; the files are sized and versioned. */}
			<img
				src={fallbackOf(still)}
				width={FILM_SIZE.width}
				height={FILM_SIZE.height}
				alt={alt}
				loading={loading}
				className={className}
			/>
		</picture>
	)
}
