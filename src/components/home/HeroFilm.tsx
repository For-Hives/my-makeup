'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { FilmStill } from './FilmStill'
import { FILM_STILLS, FILM_VIDEOS, type FilmConditions, filmButtonName, mountsFilm, playsFilm } from './film'

/**
 * The moving part of the home hero (decision of 25/10/2026, docs/accueil.md): the film in the arch, the button of the
 * badge, and the two attributes of the hero that let the stylesheet run the ring and the ribbon. A client component
 * and not an inline script: the videos are put inside markup that React owns, and they answer events (`playing`,
 * `ended`, a press on the button); a script that added them to the server HTML would fight the hydration.
 *
 * - `data-hero-motion` (`running` or `paused`) is set only once the script runs and the visitor has not asked for less
 *   motion: without it, the ribbon and the ring never move (WCAG 2.2.2, nothing loops without a way to stop it).
 * - `data-film="playing"` is set while a video plays: the ring turns only then.
 */

interface Stage {
	/** The script runs and the visitor has not asked for less motion. */
	motion: boolean
	/** The visitor stopped the film with the button of the badge. */
	userPaused: boolean
	toggle: () => void
	setPlaying: (playing: boolean) => void
}

const StageContext = createContext<Stage>({
	motion: false,
	userPaused: false,
	toggle: () => undefined,
	setPlaying: () => undefined,
})

/** Reduced until the browser has said otherwise: the markup of the server is the one without motion. */
function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(true)
	useEffect(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)')
		setReduced(query.matches)
		const change = (event: { matches: boolean }) => setReduced(event.matches)
		query.addEventListener('change', change)
		return () => query.removeEventListener('change', change)
	}, [])
	return reduced
}

/** The `<section>` of the hero, which carries the state of the motion for the stylesheet. */
export function HeroStage({ className, children }: { className: string; children: ReactNode }) {
	const reduced = useReducedMotion()
	const [userPaused, setUserPaused] = useState(false)
	const [playing, setPlaying] = useState(false)
	const toggle = useCallback(() => setUserPaused(paused => !paused), [])
	const stage = useMemo(() => ({ motion: !reduced, userPaused, toggle, setPlaying }), [reduced, userPaused, toggle])
	return (
		<StageContext.Provider value={stage}>
			<section
				className={className}
				data-hero-motion={reduced ? undefined : userPaused ? 'paused' : 'running'}
				data-film={!reduced && playing ? 'playing' : undefined}
			>
				{children}
			</section>
		</StageContext.Provider>
	)
}

/** True for a refusal of `play()`: an `AbortError` only says that a pause came before the start. */
const isRefusal = (error: unknown): boolean => !(error instanceof DOMException && error.name === 'AbortError')

/** Where the film is: nothing yet (the poster shows), the intro, the swap to the loop, the loop. */
type Phase = 'wait' | 'intro' | 'swap' | 'loop'

const VIDEO = 'absolute inset-0 h-full w-full object-cover'

/**
 * The film, over the poster of the arch. Its videos are put in the page only when every condition of `mountsFilm` is
 * met (the script runs, motion is welcome, no Save-Data, the arch on the screen, the tab in front, the page loaded
 * and the browser idle). The intro plays once; the loop is loaded while it plays, stacked under it, and shown when the
 * intro ends: its first frame is the last frame of the intro, so the swap has no gap. Off the screen, in a tab behind
 * or stopped by the button, the film pauses.
 *
 * When the film will not come although motion is welcome, the end still covers the poster: the poster is the first
 * frame of the intro, the artists still blurred, and nothing would ever bring them into focus. That is a refused
 * `play()`, Save-Data (no byte of video), and a browser without IntersectionObserver (no way to know when the arch is
 * seen). Under reduced motion the poster already is the end still (`<source media>` of the server).
 */
export function ArchFilm() {
	const { motion, userPaused, setPlaying } = useContext(StageContext)
	const host = useRef<HTMLDivElement>(null)
	const intro = useRef<HTMLVideoElement>(null)
	const loop = useRef<HTMLVideoElement>(null)
	const [inView, setInView] = useState(false)
	const [visible, setVisible] = useState(false)
	const [settled, setSettled] = useState(false)
	const [saveData, setSaveData] = useState(false)
	// Read in an effect, like Save-Data: the server has no IntersectionObserver either, and its markup must be the first one.
	const [observable, setObservable] = useState(true)
	const [refused, setRefused] = useState(false)
	const [mounted, setMounted] = useState(false)
	const [phase, setPhase] = useState<Phase>('wait')

	useEffect(() => {
		const element = host.current
		if (!element) return
		if (typeof IntersectionObserver === 'undefined') {
			setObservable(false)
			return
		}
		const observer = new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)))
		observer.observe(element)
		return () => observer.disconnect()
	}, [])

	useEffect(() => {
		const read = () => setVisible(document.visibilityState === 'visible')
		read()
		document.addEventListener('visibilitychange', read)
		return () => document.removeEventListener('visibilitychange', read)
	}, [])

	useEffect(() => {
		setSaveData((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true)
	}, [])

	// After the load event, at the first moment of rest: the film never competes with what the page needs first.
	useEffect(() => {
		let current = true
		const done = () => {
			if (current) setSettled(true)
		}
		const rest = () => {
			// Safari has no requestIdleCallback: a short timer after the load stands for the moment of rest.
			if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(done, { timeout: 2000 })
			else setTimeout(done, 200)
		}
		if (document.readyState === 'complete') rest()
		else window.addEventListener('load', rest, { once: true })
		return () => {
			current = false
			window.removeEventListener('load', rest)
		}
	}, [])

	const conditions: FilmConditions = {
		reducedMotion: !motion,
		saveData,
		inView,
		visible,
		settled,
		userPaused,
		refused,
	}
	const wanted = mountsFilm(conditions)
	const plays = mounted && !refused && playsFilm(conditions)

	useEffect(() => {
		if (wanted) setMounted(true)
	}, [wanted])

	// The video that plays: the intro, then the loop from the end of the intro.
	const active = phase === 'swap' || phase === 'loop' ? 'loop' : 'intro'
	useEffect(() => {
		const video = active === 'loop' ? loop.current : intro.current
		if (!mounted || refused || !video) return
		if (!plays) {
			video.pause()
			return
		}
		video.play().catch((error: unknown) => {
			if (isRefusal(error)) setRefused(true)
		})
	}, [mounted, refused, plays, active])

	useEffect(() => {
		if (refused) setPlaying(false)
	}, [refused, setPlaying])

	// Leaving the page: the ring no longer waits for a film that is gone.
	useEffect(() => () => setPlaying(false), [setPlaying])

	const playing = () => setPlaying(true)
	const paused = () => setPlaying(false)

	// The film will not come: Save-Data, or no way to know when the arch is seen (a refused play() has its own phase).
	const stillOnly = motion && (saveData || !observable)

	return (
		<div ref={host} className="absolute inset-0" data-film-phase={refused ? 'refused' : stillOnly ? 'still' : phase}>
			{refused || stillOnly ? (
				<FilmStill still={FILM_STILLS.end} alt="" className={VIDEO} />
			) : (
				mounted && (
					<>
						<video
							ref={loop}
							className={`${VIDEO} ${phase === 'wait' ? 'invisible' : ''}`}
							muted
							loop
							playsInline
							preload="auto"
							disablePictureInPicture
							disableRemotePlayback
							aria-hidden="true"
							tabIndex={-1}
							onPlaying={() => {
								setPhase('loop')
								playing()
							}}
							onPause={paused}
						>
							{FILM_VIDEOS.loop.map(source => (
								<source key={source.src} src={source.src} type={source.type} />
							))}
						</video>
						<video
							ref={intro}
							className={`${VIDEO} ${phase === 'intro' || phase === 'swap' ? '' : 'invisible'}`}
							muted
							playsInline
							preload="auto"
							disablePictureInPicture
							disableRemotePlayback
							aria-hidden="true"
							tabIndex={-1}
							onPlaying={() => {
								setPhase(current => (current === 'wait' ? 'intro' : current))
								playing()
							}}
							onPause={paused}
							onEnded={() => setPhase('swap')}
						>
							{FILM_VIDEOS.intro.map(source => (
								<source key={source.src} src={source.src} type={source.type} />
							))}
						</video>
					</>
				)
			)}
		</div>
	)
}

/** Two bars, or a triangle: what a press of the button does. */
function Glyph({ paused }: { paused: boolean }) {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true" className="home-hero-glyph">
			{paused ? <path d="M5 3.2v9.6L13 8z" /> : <path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z" />}
		</svg>
	)
}

/**
 * The disc at the heart of the badge. With motion, a real button that stops and plays again the film, the ring and the
 * ribbon. Without script, or with less motion asked for, nothing moves: the disc is a plain mark, so no button
 * promises what it cannot do.
 */
export function FilmButton() {
	const { motion, userPaused, toggle } = useContext(StageContext)
	if (!motion)
		return (
			<span className="home-hero-disc" aria-hidden="true">
				<span className="home-hero-seal" />
			</span>
		)
	return (
		<button type="button" className="home-hero-disc" aria-label={filmButtonName(userPaused)} onClick={toggle}>
			<Glyph paused={userPaused} />
		</button>
	)
}
