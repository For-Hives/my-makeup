import localFont from 'next/font/local'

/**
 * The faces of the home hero (decision of 25/10/2026, docs/accueil.md, « La police »): Bodoni Moda as three static cuts,
 * served from this repository (fonts/, with the licence). A static cut carries one optical size: the variable font of
 * next/font/google carried them all, with its weights, in about 100 KB preloaded in front of the stylesheets, which
 * pushed the paint of a phone (LCP of P01) over its budget.
 *
 * - `heroSerif`, the display cut (`opsz` 96, 400): the headline, upright and italic. Its fine hairlines are made for 60 px.
 * - `heroSerifText`, the text cut (`opsz` 11, 400), italic only: the ribbon (ivory on ink at 20 px, where the hairlines
 *   of the display cut vanish, the hyphen of « auto-maquillage » with them) and the numerals of the three steps.
 *
 * Each cut holds only the characters of the text it draws (9 208 bytes for the three): every byte asked before the
 * largest paint of a phone (the sentence under the headline) counts in its simulated LCP, and a font is asked as soon
 * as the page is laid out, preloaded or not. A text of the hero that changes means new cuts (the recipe is in
 * docs/accueil.md); tests/unit/home-hero.test.tsx lists the characters, tests/e2e/home-hero.spec.ts asks Chromium which
 * fonts drew each text.
 *
 * All are preloaded: their text is in the first screen of a wide screen, and a late swap would move it. Their fallback
 * is set by hand (`hero-serif-fallback` and `hero-serif-text-fallback`, globals.css), with the values Next computed
 * from the full cuts: Next reads the widths of a to z, which these subsets no longer all carry. Only the home page
 * imports this file; the body, the paragraph and the form keep the sans of the site, and the shared instance of the art
 * direction (src/components/direct-edit/fonts.ts) does not change.
 */
export const heroSerif = localFont({
	src: [
		{ path: './fonts/bodoni-moda-display-regular.woff2', weight: '400', style: 'normal' },
		{ path: './fonts/bodoni-moda-display-italic.woff2', weight: '400', style: 'italic' },
	],
	variable: '--font-hero-serif',
	display: 'swap',
	adjustFontFallback: false,
	fallback: ['hero-serif-fallback'],
})

export const heroSerifText = localFont({
	src: [{ path: './fonts/bodoni-moda-text-italic.woff2', weight: '400', style: 'italic' }],
	variable: '--font-hero-serif-text',
	display: 'swap',
	adjustFontFallback: false,
	fallback: ['hero-serif-text-fallback'],
})
