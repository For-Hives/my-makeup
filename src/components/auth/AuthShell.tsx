import type { ReactNode } from 'react'
import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { body, display } from '@/components/direct-edit/fonts'

/**
 * The shell of the pages of sign-in, sign-up, forgotten password and verification, in the kit's look (coherence pass,
 * 25/10/2026): paper, the only h1 in Bodoni, a centred column, one diffuse glow and one print mark (decoration, hidden
 * from screen readers). Same two preloaded faces as the content pages. It adds no word: the page gives the title and
 * the content. A server component.
 */
export function AuthShell({
	title,
	children,
	titleClassName = '',
}: {
	title: ReactNode
	children: ReactNode
	/** More on the h1 (a width for a long title). */
	titleClassName?: string
}) {
	return (
		<main
			className={`relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden bg-art-paper px-4 py-16 text-center text-ink ${display.variable} ${body.variable} font-body`}
		>
			{/* TODO(1136): illustration à générer (visuel de la coque de connexion: aucun aujourd'hui; ratio libre, ~420 px, à gauche ou au-dessus du titre; intention: accueil, espace personnel) */}
			<GlowBlob size="lg" tone="rose" className="-right-72 -top-48 -z-10" />
			<PrintMark kind="ring" className="absolute top-16 left-10 hidden h-5 w-5 text-art-line md:block" />
			<h1
				className={`text-balance font-display font-medium text-4xl leading-[1.1] tracking-tight sm:text-5xl ${titleClassName}`.trim()}
			>
				{title}
			</h1>
			{children}
		</main>
	)
}
