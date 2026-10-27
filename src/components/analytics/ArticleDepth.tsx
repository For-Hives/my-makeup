'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { track } from '@/lib/analytics/track'
import { routeOf } from '@/lib/analytics/values'

/** The share of the text of the article that has been scrolled past, from 0 to 1: the bottom of the screen against the text. */
export function readDepth(top: number, height: number, screen: number): number {
	if (height <= 0) return 0
	return Math.min(1, Math.max(0, (screen - top) / height))
}

/**
 * The depth of the reading of an article (27/10/2026): `article_depth_50` when half of the text has gone past the
 * bottom of the screen, `article_depth_90` at nine tenths, each once for the page, and only after a real scroll (a
 * short article that fits on the screen is not « read »). The text is the element marked `data-article-body`.
 * Reaching 90 % in one jump counts the 50 % first, so that the two events chain in a funnel. Renders nothing.
 */
export function ArticleDepth() {
	const path = usePathname()
	useEffect(() => {
		const page = routeOf(path)
		let half = false
		let nine = false
		let frame = 0
		const check = () => {
			frame = 0
			const text = document.querySelector('[data-article-body]')
			if (!text) return
			const box = text.getBoundingClientRect()
			const depth = readDepth(box.top, box.height, window.innerHeight)
			if (!half && depth >= 0.5) {
				half = true
				track('article_depth_50', { page })
			}
			if (!nine && depth >= 0.9) {
				nine = true
				if (!half) track('article_depth_50', { page })
				half = true
				track('article_depth_90', { page })
			}
			if (nine) window.removeEventListener('scroll', onScroll)
		}
		const onScroll = () => {
			if (frame === 0) frame = requestAnimationFrame(check)
		}
		window.addEventListener('scroll', onScroll, { passive: true })
		return () => {
			window.removeEventListener('scroll', onScroll)
			if (frame !== 0) cancelAnimationFrame(frame)
		}
	}, [path])
	return null
}
