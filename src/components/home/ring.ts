/**
 * The ring of words round the badge of the home hero: one turn of its circle, exactly, in every browser.
 *
 * `textLength` on a `<textPath>` would be the short way, but Firefox ignores it there: the words then cover 84 % of the
 * turn and leave a gap of a sixth where the ring closes (measured 26/10/2026, Firefox 1538 and Chromium 1243). The spacing
 * is given by `letter-spacing` instead, which every browser applies on a path, and computed so that the words fill the
 * circle: a letter-spacing is added after every character, the last one included, so `count` equal gaps close the turn
 * and the gap where the ring closes is the same as all the others.
 *
 *   natural + count × spacing = 2π × radius   ⇒   spacing = (2π × radius − natural) / count
 *
 * `natural` is the length of the words with no spacing, in the face the browser really draws: it differs between
 * browsers (206 units in Chromium, 196.4 in Firefox, for the same face and size), so the hero measures it once the fonts
 * are ready (`HeroStage`). Until then, and without script, the spacing measured in Chromium stands.
 */

/** The radius of the circle the words run on, in the 112 units of the badge: their baseline. */
export const RING_RADIUS = 37

/** One turn of that circle, in the units of the badge. */
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** The letter-spacing that makes `count` characters of length `natural` (no spacing) go exactly once round the circle. */
export function ringLetterSpacing(natural: number, count: number): number {
	return (RING_CIRCUMFERENCE - natural) / count
}

/**
 * The spacing before the fonts are measured, and without script: Instrument Sans semibold at 12.5 units, as Chromium
 * measures « EXPLORER LES MAQUILLEUSES · » and its no-break space (206 units, 28 characters).
 */
export const RING_DEFAULT_SPACING = Number(ringLetterSpacing(206, 28).toFixed(3))

/** The centre of the circle, in the 112 units of the badge. */
const RING_CENTRE = 56

/** How far round the circle a point of the ring lies, as a length along it (0 to one turn). */
export function alongRing(x: number, y: number): number {
	const turn = (Math.atan2(y - RING_CENTRE, x - RING_CENTRE) + 2 * Math.PI) % (2 * Math.PI)
	return (turn / (2 * Math.PI)) * RING_CIRCUMFERENCE
}

/** The gap from one length along the ring to the next, signed and within half a turn: an overlap is negative. */
export function ringGap(from: number, to: number): number {
	const half = RING_CIRCUMFERENCE / 2
	return ((((to - from + half) % RING_CIRCUMFERENCE) + RING_CIRCUMFERENCE) % RING_CIRCUMFERENCE) - half
}

/**
 * The second pass, on what the browser drew: the gap where the ring closes (from the end of the last character to the
 * start of the first) should be the gap between any two characters. What it differs by is shared between the `count`
 * characters: the change to the letter-spacing (Chromium draws its words about half a unit longer than it measures them).
 */
export function ringSpacingCorrection(seam: number, usualGap: number, count: number): number {
	return (seam - usualGap) / count
}
