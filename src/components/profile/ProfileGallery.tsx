'use client'

import Image from 'next/image'
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/art/Icon'
import { ofName } from '@/lib/french-elision'
import { DEFAULT_RATIO, ratioMedia, sizesBox } from '@/lib/image-size'
import { altWork } from '@/lib/profile/public-view'

/** The height of a photo of the portfolio, in px: its width follows the shape of the photo. */
const PHOTO_HEIGHT = 500

/** The photos of a portfolio. Only what the page shows crosses to the browser: addresses and sizes. */
export interface GalleryPhoto {
	url: string
	width: number | null
	height: number | null
}

/** Quiet time after the last scroll before the position is read: the end of a swipe, not its middle. */
const POSITION_WAIT_MS = 120

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function Arrow({ vers }: { vers: 'gauche' | 'droite' }) {
	return <Icon name="chevron-right" className={`h-5 w-5 shrink-0 ${vers === 'gauche' ? 'rotate-180' : ''}`} />
}

/**
 * The portfolio of a profile (ticket 103). The photos are in a row that scrolls: a finger swipes it
 * and each photo stops in place (CSS scroll snapping, no library). With JavaScript, the arrow keys
 * (on the row), Home, End and the two buttons move by one photo, and the position is said aloud
 * (« Photo 2 sur 6 », a polite live region). Without JavaScript the row still scrolls.
 *
 * Every photo has its alternative text, « Réalisation de <nom> (n/N) », and is asked to the image
 * optimizer at the width it is drawn at (`sizesBox`), from its original address.
 */
export function ProfileGallery({ photos, nom }: { photos: readonly GalleryPhoto[]; nom: string }) {
	const track = useRef<HTMLDivElement>(null)
	const wait = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	// True while the row scrolls toward a photo chosen by key or button: the position is then known, and what the
	// scroll passes on its way (a smooth scroll, slowed by a busy machine) must not rewrite it.
	const scrollBy = useRef(false)
	const [current, setCurrent] = useState(0)
	const total = photos.length

	useEffect(() => () => clearTimeout(wait.current), [])

	const goTo = useCallback(
		(rang: number) => {
			const targetIndex = Math.min(Math.max(rang, 0), total - 1)
			setCurrent(targetIndex)
			const element = track.current
			const photo = element?.children.item(targetIndex)
			if (!element || !(photo instanceof HTMLElement) || typeof element.scrollTo !== 'function') return
			const reducedMotion = typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches
			// Nothing to wait for when the row is already there: no scroll event would end the wait.
			scrollBy.current = Math.abs(photo.offsetLeft - element.scrollLeft) > 1
			element.scrollTo({ left: photo.offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' })
		},
		[total]
	)

	// The photo that sits at the left edge of the row: what a swipe ended on.
	const readPosition = useCallback(() => {
		const element = track.current
		if (!element) return
		// The scroll that was asked for has ended: the position stays the one that was asked for.
		if (scrollBy.current) {
			scrollBy.current = false
			return
		}
		let nearest = 0
		let minGap = Number.POSITIVE_INFINITY
		for (const [rank, photo] of Array.from(element.children).entries()) {
			if (!(photo instanceof HTMLElement)) continue
			const gap = Math.abs(photo.offsetLeft - element.scrollLeft)
			if (gap < minGap) {
				minGap = gap
				nearest = rank
			}
		}
		setCurrent(nearest)
	}, [])

	const onScroll = () => {
		clearTimeout(wait.current)
		wait.current = setTimeout(readPosition, POSITION_WAIT_MS)
	}

	const onKeyDown = (evenement: KeyboardEvent<HTMLDivElement>) => {
		const rank =
			evenement.key === 'ArrowRight'
				? current + 1
				: evenement.key === 'ArrowLeft'
					? current - 1
					: evenement.key === 'Home'
						? 0
						: evenement.key === 'End'
							? total - 1
							: null
		if (rank === null) return
		evenement.preventDefault()
		goTo(rank)
	}

	const button =
		'inline-flex min-h-11 items-center gap-2 rounded px-2 font-semibold text-indigo-950 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 aria-disabled:opacity-40'

	return (
		<section
			aria-roledescription="carrousel"
			aria-label={`Portfolio ${ofName(nom)}`}
			className="flex w-full min-w-0 flex-col gap-4"
		>
			{/* The row is the one tab stop of the photos: focused, the arrow keys move it. */}
			{/* biome-ignore lint/a11y/useSemanticElements: a focusable row of photos, named; a fieldset is a form control */}
			<div
				ref={track}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
				tabIndex={0}
				role="group"
				aria-label={`Photos ${ofName(nom)}`}
				onKeyDown={onKeyDown}
				onScroll={onScroll}
				// A finger or a wheel takes the row over: what follows is read from where it stops.
				onTouchStart={() => {
					scrollBy.current = false
				}}
				onWheel={() => {
					scrollBy.current = false
				}}
				className="relative flex w-full snap-x snap-mandatory gap-8 overflow-x-auto overscroll-x-contain scroll-smooth rounded focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 motion-reduce:scroll-auto"
			>
				{photos.map((photo, rang) => (
					// biome-ignore lint/a11y/useSemanticElements: the slide of the carousel pattern (WAI-ARIA APG)
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: a photo can be listed twice, and the rows never move
						key={`${rang}-${photo.url}`}
						role="group"
						aria-roledescription="photo"
						aria-label={`${rang + 1} sur ${total}`}
						style={{ aspectRatio: ratioMedia(photo) ?? DEFAULT_RATIO, height: PHOTO_HEIGHT }}
						className="relative max-w-full shrink-0 snap-start"
					>
						<Image
							src={photo.url}
							alt={altWork(nom, rang + 1, total)}
							fill
							sizes={sizesBox({ hauteur: PHOTO_HEIGHT, ratio: ratioMedia(photo) })}
							className="rounded object-cover"
						/>
					</div>
				))}
			</div>
			{total > 1 && (
				<div className="flex w-full items-center justify-between gap-2">
					<button type="button" aria-disabled={current === 0} onClick={() => goTo(current - 1)} className={button}>
						<Arrow vers="gauche" />
						Photo précédente
					</button>
					<p aria-live="polite" aria-atomic="true" className="text-gray-700 text-sm">
						Photo {current + 1} sur {total}
					</p>
					<button
						type="button"
						aria-disabled={current === total - 1}
						onClick={() => goTo(current + 1)}
						className={button}
					>
						Photo suivante
						<Arrow vers="droite" />
					</button>
				</div>
			)}
		</section>
	)
}
