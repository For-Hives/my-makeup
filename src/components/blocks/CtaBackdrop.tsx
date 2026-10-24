'use client'

import { type ComponentType, useEffect, useRef, useState } from 'react'
import { backdropMode } from './cta-backdrop-mode'

/** WebGL is there when a canvas gives a context; a browser without it keeps the static layer. */
function hasWebGl(): boolean {
	try {
		return document.createElement('canvas').getContext('webgl2') !== null
	} catch {
		return false
	}
}

/**
 * The background of the call to action (issue 1067). A static layer, made of gradients, is always drawn: it is
 * all there is without the script, with WebGL missing, and with reduced motion. The shader is added on top only
 * when the block comes near the screen and the visitor has not asked for less motion, and it is removed when the
 * block leaves the screen, which frees its WebGL context. Its code is loaded then, never before.
 */
export function CtaBackdrop() {
	const host = useRef<HTMLDivElement>(null)
	// « Static » until the browser has said otherwise: the markup of the server is the one without motion.
	const [reducedMotion, setReducedMotion] = useState(true)
	const [visible, setVisible] = useState(false)
	const [Shader, setShader] = useState<ComponentType | null>(null)

	useEffect(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)')
		setReducedMotion(query.matches)
		const change = (event: { matches: boolean }) => setReducedMotion(event.matches)
		query.addEventListener('change', change)
		return () => query.removeEventListener('change', change)
	}, [])

	useEffect(() => {
		if (typeof IntersectionObserver === 'undefined' || !host.current) return
		const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), {
			rootMargin: '200px',
		})
		observer.observe(host.current)
		return () => observer.disconnect()
	}, [])

	const wanted = !reducedMotion && visible
	useEffect(() => {
		if (!wanted || Shader || !hasWebGl()) return
		let current = true
		import('./CtaShader')
			.then(piece => {
				if (current) setShader(() => piece.CtaShader)
			})
			.catch(() => {
				// The shader is an extra: a piece that does not load leaves the static layer, which says everything.
			})
		return () => {
			current = false
		}
	}, [wanted, Shader])

	const mode = backdropMode({ reducedMotion, visible, webgl: Shader !== null })
	return (
		<div ref={host} aria-hidden="true" data-backdrop={mode} className="absolute inset-0">
			<div className="cta-backdrop-static cta-backdrop-mask absolute inset-0" />
			{mode === 'shader' && Shader && <Shader />}
		</div>
	)
}
