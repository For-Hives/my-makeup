'use client'

import { useEffect, useRef, useState } from 'react'
import { IconPath } from './IconPath'
import { ICON_PAUSE, ICON_PLAY } from './icons'

/**
 * The pause button of the scrolling banner (WCAG 2.2.2: moving text that lasts more than five seconds can be stopped).
 * It is the only client code of the banner: it flips `data-paused` on the banner it sits in, and the stylesheet pauses
 * the animation. With reduced motion the banner does not move and the stylesheet hides the button.
 *
 * It also tells the banner when its typeface is there (`data-ready`): until then, with scripting on, the stylesheet keeps
 * the words `visibility: hidden`, so the swap from the fallback face (a few pixels of width) happens unseen and moves
 * nothing the visitor sees (CLS 0). A timeout of 2.5 s shows the band whatever happens to the font.
 */
export function MarqueePauseButton() {
	const [paused, setPaused] = useState(false)
	const button = useRef<HTMLButtonElement>(null)
	useEffect(() => {
		const banner = button.current?.closest('.art-marquee')
		const show = () => banner?.setAttribute('data-ready', '')
		const timer = window.setTimeout(show, 2500)
		document.fonts.ready.then(show, show)
		return () => window.clearTimeout(timer)
	}, [])
	return (
		<button
			ref={button}
			type="button"
			aria-pressed={paused}
			aria-label={paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement'}
			className="art-marquee__pause focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
			onClick={() => {
				const next = !paused
				setPaused(next)
				button.current?.closest('.art-marquee')?.setAttribute('data-paused', String(next))
			}}
		>
			<IconPath d={paused ? ICON_PLAY : ICON_PAUSE} className="h-4 w-4" />
		</button>
	)
}
