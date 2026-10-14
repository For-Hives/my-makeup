'use client'

import Image from 'next/image'
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { altRealisation } from '@/lib/profil/vue-publique'
import { RATIO_PAR_DEFAUT, ratioMedia, sizesBoite } from '@/lib/taille-image'

/** The height of a photo of the portfolio, in px: its width follows the shape of the photo. */
const HAUTEUR_DE_LA_PHOTO = 500

/** The photos of a portfolio. Only what the page shows crosses to the browser: addresses and sizes. */
export interface PhotoDeLaGalerie {
	url: string
	width: number | null
	height: number | null
}

/** Quiet time after the last scroll before the position is read: the end of a swipe, not its middle. */
const ATTENTE_DE_LA_POSITION_MS = 120

const SANS_MOUVEMENT = '(prefers-reduced-motion: reduce)'

function Fleche({ vers }: { vers: 'gauche' | 'droite' }) {
	return (
		<svg
			viewBox="0 0 20 20"
			fill="currentColor"
			aria-hidden="true"
			className={`h-5 w-5 shrink-0 ${vers === 'gauche' ? 'rotate-180' : ''}`}
		>
			<path
				fillRule="evenodd"
				d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
				clipRule="evenodd"
			/>
		</svg>
	)
}

/**
 * The portfolio of a profile (ticket 103). The photos are in a row that scrolls: a finger swipes it
 * and each photo stops in place (CSS scroll snapping, no library). With JavaScript, the arrow keys
 * (on the row), Home, End and the two buttons move by one photo, and the position is said aloud
 * (« Photo 2 sur 6 », a polite live region). Without JavaScript the row still scrolls.
 *
 * Every photo has its alternative text, « Réalisation de <nom> (n/N) », and is asked to the image
 * optimizer at the width it is drawn at (`sizesBoite`), from its original address.
 */
export function GalerieDuProfil({ photos, nom }: { photos: readonly PhotoDeLaGalerie[]; nom: string }) {
	const piste = useRef<HTMLDivElement>(null)
	const attente = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	// True while the row scrolls toward a photo chosen by key or button: the position is then known, and what the
	// scroll passes on its way (a smooth scroll, slowed by a busy machine) must not rewrite it.
	const deplacement = useRef(false)
	const [courante, setCourante] = useState(0)
	const total = photos.length

	useEffect(() => () => clearTimeout(attente.current), [])

	const aller = useCallback(
		(rang: number) => {
			const visee = Math.min(Math.max(rang, 0), total - 1)
			setCourante(visee)
			const element = piste.current
			const photo = element?.children.item(visee)
			if (!element || !(photo instanceof HTMLElement) || typeof element.scrollTo !== 'function') return
			const sansMouvement = typeof matchMedia === 'function' && matchMedia(SANS_MOUVEMENT).matches
			// Nothing to wait for when the row is already there: no scroll event would end the wait.
			deplacement.current = Math.abs(photo.offsetLeft - element.scrollLeft) > 1
			element.scrollTo({ left: photo.offsetLeft, behavior: sansMouvement ? 'auto' : 'smooth' })
		},
		[total]
	)

	// The photo that sits at the left edge of the row: what a swipe ended on.
	const lireLaPosition = useCallback(() => {
		const element = piste.current
		if (!element) return
		// The scroll that was asked for has ended: the position stays the one that was asked for.
		if (deplacement.current) {
			deplacement.current = false
			return
		}
		let proche = 0
		let ecartMin = Number.POSITIVE_INFINITY
		for (const [rang, photo] of Array.from(element.children).entries()) {
			if (!(photo instanceof HTMLElement)) continue
			const ecart = Math.abs(photo.offsetLeft - element.scrollLeft)
			if (ecart < ecartMin) {
				ecartMin = ecart
				proche = rang
			}
		}
		setCourante(proche)
	}, [])

	const auDefilement = () => {
		clearTimeout(attente.current)
		attente.current = setTimeout(lireLaPosition, ATTENTE_DE_LA_POSITION_MS)
	}

	const auClavier = (evenement: KeyboardEvent<HTMLDivElement>) => {
		const rang =
			evenement.key === 'ArrowRight'
				? courante + 1
				: evenement.key === 'ArrowLeft'
					? courante - 1
					: evenement.key === 'Home'
						? 0
						: evenement.key === 'End'
							? total - 1
							: null
		if (rang === null) return
		evenement.preventDefault()
		aller(rang)
	}

	const bouton =
		'inline-flex min-h-11 items-center gap-2 rounded px-2 font-semibold text-indigo-950 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 aria-disabled:opacity-40'

	return (
		<section
			aria-roledescription="carrousel"
			aria-label={`Portfolio de ${nom}`}
			className="flex w-full min-w-0 flex-col gap-4"
		>
			{/* The row is the one tab stop of the photos: focused, the arrow keys move it. */}
			{/* biome-ignore lint/a11y/useSemanticElements: a focusable row of photos, named; a fieldset is a form control */}
			<div
				ref={piste}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
				tabIndex={0}
				role="group"
				aria-label={`Photos de ${nom}`}
				onKeyDown={auClavier}
				onScroll={auDefilement}
				// A finger or a wheel takes the row over: what follows is read from where it stops.
				onTouchStart={() => {
					deplacement.current = false
				}}
				onWheel={() => {
					deplacement.current = false
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
						style={{ aspectRatio: ratioMedia(photo) ?? RATIO_PAR_DEFAUT, height: HAUTEUR_DE_LA_PHOTO }}
						className="relative max-w-full shrink-0 snap-start"
					>
						<Image
							src={photo.url}
							alt={altRealisation(nom, rang + 1, total)}
							fill
							sizes={sizesBoite({ hauteur: HAUTEUR_DE_LA_PHOTO, ratio: ratioMedia(photo) })}
							className="rounded object-cover"
						/>
					</div>
				))}
			</div>
			{total > 1 && (
				<div className="flex w-full items-center justify-between gap-2">
					<button type="button" aria-disabled={courante === 0} onClick={() => aller(courante - 1)} className={bouton}>
						<Fleche vers="gauche" />
						Photo précédente
					</button>
					<p aria-live="polite" aria-atomic="true" className="text-gray-700 text-sm">
						Photo {courante + 1} sur {total}
					</p>
					<button
						type="button"
						aria-disabled={courante === total - 1}
						onClick={() => aller(courante + 1)}
						className={bouton}
					>
						Photo suivante
						<Fleche vers="droite" />
					</button>
				</div>
			)}
		</section>
	)
}
