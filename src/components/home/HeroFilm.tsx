'use client'

import {
	createContext,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { FilmStill } from './FilmStill'
import {
	ARCH_OBSERVER_STEPS,
	archSeenBy,
	FILM_STILLS,
	FILM_VIDEOS,
	type FilmConditions,
	mountsFilm,
	pauseButtonName,
	playsFilm,
} from './film'
import { alongRing, ringGap, ringLetterSpacing, ringSpacingCorrection } from './ring'

/**
 * The moving part of the home hero (decisions of 25 and 26/10/2026, docs/accueil.md): the film in the arch, the pause
 * button, and the attributes of the hero that say what moves: the stylesheet turns the ring of the badge and slides the
 * ribbon under the first, the tests read the second. A client component and not an inline script: the videos are put
 * inside markup that React owns, and they answer events (`playing`, `ended`, a press on the pause button); a script that
 * added them to the server HTML would fight the hydration. The badge itself, a link to the search, is server markup
 * (HomeHero.tsx): it works without script and under reduced motion.
 *
 * - `data-hero-motion` (`running` or `paused`) is set only once the script runs and the visitor has not asked for less
 *   motion: without it, neither the ring nor the ribbon moves (WCAG 2.2.2, nothing loops without a way to stop it).
 * - `data-film="playing"` is set while a video plays.
 * - `data-arch="seen"` is set once `FILM_VIEW_RATIO` of the arch has been on the screen, and stays: on a phone, the
 *   stylesheet shows the still of the arch only then (before, its blurred copy, see `STILL_PLACEHOLDERS` of film.ts).
 *
 * Once the fonts are ready, it also measures the words of the badge's ring in the face the browser draws and sets their
 * letter-spacing so that they go exactly once round the circle (ring.ts).
 */

interface Stage {
	/** The script runs and the visitor has not asked for less motion. */
	motion: boolean
	/** The visitor stopped the film, the ring and the ribbon with the pause button. */
	userPaused: boolean
	/** `FILM_VIEW_RATIO` of the arch has been on the screen once. */
	archSeen: boolean
	toggle: () => void
	setPlaying: (playing: boolean) => void
	seeArch: () => void
}

const StageContext = createContext<Stage>({
	motion: false,
	userPaused: false,
	archSeen: false,
	toggle: () => undefined,
	setPlaying: () => undefined,
	seeArch: () => undefined,
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

/**
 * Sets the letter-spacing of the ring so that its words go exactly once round their circle, measured in the face the
 * browser really draws (ring.ts). The length without spacing is taken from the length with the spacing in place
 * (`natural = length − count × spacing`): a length read just after changing the spacing is stale in Chromium and in
 * Firefox (measured 26/10/2026), so the spacing is never toggled to measure. Once the fonts are ready, and again if a
 * face arrives later; the ring keeps the spacing of the server (Chromium's) when the browser cannot measure.
 */
function useRingFit(section: RefObject<HTMLElement | null>): void {
	useEffect(() => {
		const text = section.current?.querySelector<SVGTextElement>('.home-hero-ring text')
		if (!text || typeof text.getComputedTextLength !== 'function' || !('fonts' in document)) return
		let current = true
		const spacingNow = () => Number.parseFloat(getComputedStyle(text).letterSpacing) || 0
		// Second pass, two frames later, on the positions the browser drew: the seam becomes one gap among the others.
		const refine = () => {
			if (!current) return
			const count = text.getNumberOfChars()
			if (count < 2) return
			const at = (point: DOMPoint) => alongRing(point.x, point.y)
			const gaps: number[] = []
			for (let index = 0; index < count - 1; index++)
				gaps.push(ringGap(at(text.getEndPositionOfChar(index)), at(text.getStartPositionOfChar(index + 1))))
			const usual = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0
			const seam = ringGap(at(text.getEndPositionOfChar(count - 1)), at(text.getStartPositionOfChar(0)))
			const correction = ringSpacingCorrection(seam, usual, count)
			if (Math.abs(correction) > 0.001) text.style.letterSpacing = `${spacingNow() + correction}px`
		}
		const fit = () => {
			if (!current) return
			const count = text.getNumberOfChars()
			const natural = text.getComputedTextLength() - count * spacingNow()
			if (natural > 0 && count > 0) text.style.letterSpacing = `${ringLetterSpacing(natural, count)}px`
			requestAnimationFrame(() => requestAnimationFrame(refine))
		}
		document.fonts.ready.then(fit)
		document.fonts.addEventListener('loadingdone', fit)
		return () => {
			current = false
			document.fonts.removeEventListener('loadingdone', fit)
		}
	}, [section])
}

/** The `<section>` of the hero, which carries the state of the motion for the stylesheet. */
export function HeroStage({ className, children }: { className: string; children: ReactNode }) {
	const section = useRef<HTMLElement>(null)
	useRingFit(section)
	const reduced = useReducedMotion()
	const [userPaused, setUserPaused] = useState(false)
	const [playing, setPlaying] = useState(false)
	const [archSeen, setArchSeen] = useState(false)
	const toggle = useCallback(() => setUserPaused(paused => !paused), [])
	const seeArch = useCallback(() => setArchSeen(true), [])
	const stage = useMemo(
		() => ({ motion: !reduced, userPaused, archSeen, toggle, setPlaying, seeArch }),
		[reduced, userPaused, archSeen, toggle, seeArch]
	)
	return (
		<StageContext.Provider value={stage}>
			<section
				ref={section}
				className={className}
				data-hero-motion={reduced ? undefined : userPaused ? 'paused' : 'running'}
				data-film={!reduced && playing ? 'playing' : undefined}
				data-arch={archSeen ? 'seen' : undefined}
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
 * met (the script runs, motion is welcome, no Save-Data, `FILM_VIEW_RATIO` of the arch on the screen, the tab in front,
 * the page loaded and the browser idle). The intro plays once; the loop is loaded while it plays, stacked under it, and
 * shown when the intro ends: its first frame is the last frame of the intro, so the swap has no gap. Off the screen,
 * in a tab behind or stopped by the pause button, the film pauses.
 *
 * When the film will not come although motion is welcome, the end still covers the poster once the arch is seen: the
 * poster is the first frame of the intro, the artists still blurred, and nothing would ever bring them into focus.
 * That is a refused `play()`, Save-Data (no byte of video), and a browser without IntersectionObserver (no way to know
 * when the arch is seen: it counts as seen). Not before the arch is seen: on a phone its top peeks into the first
 * screen, where the end still would be the largest paint. Under reduced motion the poster already is the end still
 * (`<source media>` of the server).
 */
export function ArchFilm() {
	const { motion, userPaused, archSeen, setPlaying, seeArch } = useContext(StageContext)
	const host = useRef<HTMLDivElement>(null)
	const intro = useRef<HTMLVideoElement>(null)
	const loop = useRef<HTMLVideoElement>(null)
	const [inView, setInView] = useState(false)
	const [onScreen, setOnScreen] = useState(false)
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
			seeArch()
			return
		}
		// A share of the arch, not a pixel of it: on a phone its top peeks into the first screen, and the film (1 MB of
		// video) waits for a scroll. The last entry is the latest state of the arch.
		const observer = new IntersectionObserver(
			entries => {
				const entry = entries[entries.length - 1]
				if (!entry) return
				const shown = archSeenBy(
					{ ratio: entry.intersectionRatio, height: entry.intersectionRect.height },
					entry.rootBounds?.height ?? window.innerHeight
				)
				setInView(shown)
				setOnScreen(entry.isIntersecting)
				if (shown) seeArch()
			},
			{ threshold: [...ARCH_OBSERVER_STEPS] }
		)
		observer.observe(element)
		return () => observer.disconnect()
	}, [seeArch])

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
		onScreen,
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

	// Leaving the page: the hero no longer says a film plays that is gone.
	useEffect(() => () => setPlaying(false), [setPlaying])

	const playing = () => setPlaying(true)
	const paused = () => setPlaying(false)

	// The film will not come: Save-Data, or no way to know when the arch is seen (a refused play() has its own phase).
	const stillOnly = motion && (saveData || !observable)

	return (
		<div ref={host} className="absolute inset-0" data-film-phase={refused ? 'refused' : stillOnly ? 'still' : phase}>
			{refused || (stillOnly && archSeen) ? (
				<FilmStill still={FILM_STILLS.end} alt="" className={VIDEO} />
			) : (
				mounted && (
					<>
						{/* Hidden until the intro has ended: its first frame is the end of the story, the red lips, and an intro that
						    still buffers (a slow line) would let it show through before the story is told. */}
						<video
							ref={loop}
							className={`${VIDEO} ${phase === 'swap' || phase === 'loop' ? '' : 'invisible'}`}
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

/**
 * The pause button of the hero (WCAG 2.2.2: the film loops, the ring turns and the ribbon slides for as long as the page
 * stays open, so a visitor can stop them). Andy asked for no visible pause on 26/10/2026 (« le bouton de pause, il sert
 * à rien »): the badge is a link now, and this button stays out of sight until it takes the keyboard focus, like a skip
 * link; then the stylesheet shows it as a small ink pill on the arch (`.home-hero-pause`). One press stops the film, the
 * ring and the ribbon together; its name says what the next press does. A mouse stops the ribbon by hovering it.
 * Without script, or with less motion asked for, nothing moves: no button that commands nothing.
 */
export function PauseButton() {
	const { motion, userPaused, toggle } = useContext(StageContext)
	if (!motion) return null
	// Hidden as the skip link of the site is (SkipLink.tsx): `sr-only` until the focus, then the pill of `.home-hero-pause`.
	return (
		<button type="button" className="home-hero-pause sr-only focus:not-sr-only" onClick={toggle}>
			{pauseButtonName(userPaused)}
		</button>
	)
}
