import { Bodoni_Moda } from 'next/font/google'

/**
 * The display face of the home hero (decision of 25/10/2026, docs/accueil.md): Bodoni Moda with its optical size axis
 * and its italic. The shared instance of the art direction (src/components/direct-edit/fonts.ts) is the upright text
 * cut: at 60 px the headline needs the display cut, with its fine hairlines, and the lipstick words are italic. Only
 * the home page imports this file; the body, the paragraph and the form keep the sans of the site.
 */
export const heroSerif = Bodoni_Moda({
	subsets: ['latin'],
	axes: ['opsz'],
	style: ['normal', 'italic'],
	variable: '--font-hero-serif',
	display: 'swap',
})
