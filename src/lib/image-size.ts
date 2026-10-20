/**
 * The width at which the photos of the makeup artists are asked to the image optimizer
 * (plan 01 §3.2 UI-09). `next/image` picks a width of its `srcset` from `sizes`, the width the
 * picture takes on screen. A photo drawn with `object-fit: cover` in a box of fixed height takes
 * more than the width of the box as soon as it is wider than the box: a 4:3 photo in a card of
 * 356 × 350 px is drawn 467 px wide, then cropped. `sizes` has to say that width, or a phone with a
 * dense screen gets a picture the browser enlarges.
 *
 * Ported from src/lib/taille-image.js of the old site (branch main). Plain px and calc() only in
 * `sizes` (CSS max() is not read there by every browser).
 *
 * Screens of 2.5 dppx and more (3x phones) get 3/4 of that width: 2.25 device pixels per CSS pixel
 * instead of 3, hardly visible at arm's length, for a third fewer bytes. A browser that does not read
 * `min-resolution` in `sizes` skips those entries and takes the full width.
 */

/** Screens whose photos are asked below their density (3x phones). */
export const VERY_DENSE_SCREEN = '(min-resolution: 2.5dppx)'

/** Part of the drawn width asked on those screens: 2.25x on a 3x screen. */
export const VERY_DENSE_FACTOR = 0.75

/**
 * The ratio assumed for a photo without dimensions: a 4:3 landscape, the costliest common shape.
 */
export const DEFAULT_RATIO = 4 / 3

const positive = (valeur: unknown): number | null =>
	typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0 ? valeur : null

/** Width over height of a photo, `null` when one of the two is unknown. */
export function ratioMedia(media: { width?: unknown; height?: unknown } | null | undefined): number | null {
	const width = positive(media?.width)
	const height = positive(media?.height)
	return width && height ? width / height : null
}

/** The width of a photo of that ratio drawn at that height, in whole px. */
const drawnWidth = (hauteur: number, ratio: number | null | undefined): number =>
	Math.ceil(hauteur * (positive(ratio) ?? DEFAULT_RATIO))

/**
 * `sizes` of a photo drawn with `object-fit: cover` in a box of fixed size, or in a box of its own
 * ratio (`largeur` 0: only the height counts). For example `(min-resolution: 2.5dppx) 201px, 267px`.
 */
export function sizesBox({
	largeur: width = 0,
	hauteur: height,
	ratio,
}: {
	largeur?: number
	hauteur: number
	ratio?: number | null
}): string {
	const px = Math.max(Math.ceil(width), drawnWidth(height, ratio))
	const dense = `${VERY_DENSE_SCREEN} ${Math.ceil(px * VERY_DENSE_FACTOR)}px`
	return `${dense}, ${px}px`
}
