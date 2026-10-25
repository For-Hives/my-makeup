'use client'

import { useRef, useState } from 'react'
import { Icon } from './graphics'

/**
 * The pause button of the scrolling banner (WCAG 2.2.2: moving text that lasts more than five seconds can be stopped).
 * It is the only client code of the banner: it flips `data-paused` on the banner it sits in, and the stylesheet pauses
 * the animation. With reduced motion the banner does not move and the stylesheet hides the button.
 */
export function MarqueePauseButton() {
	const [paused, setPaused] = useState(false)
	const button = useRef<HTMLButtonElement>(null)
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
			<Icon name={paused ? 'play' : 'pause'} className="h-4 w-4" />
		</button>
	)
}
