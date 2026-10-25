import { Bodoni_Moda, Instrument_Sans, Pinyon_Script } from 'next/font/google'

/**
 * The three typefaces of the art direction (issues 1007 and 1111), self-hosted by `next/font` and declared ONCE for the
 * whole public site, here: the public layout (`src/app/(front)/layout.tsx`) sets their variables on `<html>`, so every
 * page reads `font-display`, `font-body` and `font-script`.
 *
 * `preload: false` on all three: the browser fetches a face only when a page paints text in it, so a page that uses
 * none pays nothing. Measured on a throttled phone (docs/direction-artistique.md, « Mesures »), `preload: true` here
 * adds three font requests (86 KB) to every page and moves the LCP of a page that uses no face by about +360 ms.
 *
 * The few routes that already paint Bodoni and Instrument Sans above the fold (content pages, blog, edit mode) keep
 * the preloaded pair of `src/components/direct-edit/fonts.ts`, unchanged, so their loading and their CLS do not move.
 * When every page has taken the kit, that pair goes and `preload` is turned on here for `display` and `body`.
 */
export const display = Bodoni_Moda({
	subsets: ['latin'],
	style: ['normal', 'italic'],
	variable: '--font-bodoni-moda',
	display: 'swap',
	preload: false,
})
export const body = Instrument_Sans({
	subsets: ['latin'],
	variable: '--font-instrument-sans',
	display: 'swap',
	preload: false,
})
/** The cursive of the scrolling banner, nothing else: a script face never sets a title or a paragraph. */
export const script = Pinyon_Script({
	subsets: ['latin'],
	weight: '400',
	variable: '--font-pinyon-script',
	display: 'swap',
	preload: false,
})

/** The class that sets the three variables: on `<html>` once. */
export const FONT_VARIABLES = `${display.variable} ${body.variable} ${script.variable}`
