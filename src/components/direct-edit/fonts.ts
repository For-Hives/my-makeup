import { Bodoni_Moda, Instrument_Sans } from 'next/font/google'

/**
 * The two typefaces of the art direction (issue 1007), loaded for her edit mode only: this file is
 * imported by the private route, never by the public layout, so a visitor's page loads neither.
 */
export const display = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni-moda', display: 'swap' })
export const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument-sans', display: 'swap' })
