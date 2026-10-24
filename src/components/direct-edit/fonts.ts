import { Bodoni_Moda, Instrument_Sans } from 'next/font/google'

/**
 * The two typefaces of the art direction (issue 1007), loaded for her edit mode and for the content pages of the
 * public site (`ContentPage`, issue 1102): this file is imported by those routes, never by the public layout, so the
 * home page, the navigation and the blog load neither.
 */
export const display = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni-moda', display: 'swap' })
export const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument-sans', display: 'swap' })
