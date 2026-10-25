import { Bodoni_Moda, Instrument_Sans, Pinyon_Script } from 'next/font/google'

/**
 * The three typefaces of the art direction (issues 1007 and 1111), self-hosted by `next/font` and loaded ONCE, here:
 * the public layout (`src/app/(front)/layout.tsx`) sets their variables on `<html>`, so every page and the edit mode
 * read `font-display`, `font-body` and `font-script` without loading anything of their own.
 *
 * `preload: false` on all three: the browser fetches a face only when a page paints text in it, so a page that uses
 * none pays nothing (no `<link rel="preload">` competing with the LCP). A page that paints a heading in Bodoni
 * above the fold turns `preload` on for `display` (one line, here) and measures its LCP again.
 */
export const display = Bodoni_Moda({
	subsets: ['latin'],
	style: ['normal', 'italic'],
	variable: '--font-bodoni-moda',
	display: 'swap',
	preload: true,
})
export const body = Instrument_Sans({
	subsets: ['latin'],
	variable: '--font-instrument-sans',
	display: 'swap',
	preload: true,
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
