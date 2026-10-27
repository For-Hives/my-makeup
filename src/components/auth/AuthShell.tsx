import Link from 'next/link'
import type { ReactNode } from 'react'
import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { body, display } from '@/components/direct-edit/fonts'

/**
 * The shell of the pages of sign-in, sign-up, forgotten password and verification, in the kit's look (coherence pass,
 * 25/10/2026): paper, the only h1 in Bodoni, one diffuse glow and one print mark (decoration, hidden from screen
 * readers). Same two preloaded faces as the content pages. It adds no word: the page gives the title and the content.
 * A server component.
 *
 * Two layouts. `centered` (the default) is a centred column. `card` (sign-in and sign-up, simplified 27/10/2026 at
 * Andy's request: the art panel, the arch photo and the decorations are gone) is one narrow left-aligned column: the
 * name of the site (a link home), the title, the form in a white card, then the links to the other pages. The title is
 * left-aligned: the italic face arrives late, and a centred title moves when its width changes (a layout shift).
 */
export function AuthShell({
	title,
	children,
	titleClassName = '',
	layout = 'centered',
	footer,
}: {
	title: ReactNode
	children: ReactNode
	/** More on the h1 (a width for a long title). */
	titleClassName?: string
	layout?: 'centered' | 'card'
	/** Under the card, `card` only. */
	footer?: ReactNode
}) {
	if (layout === 'card') {
		return (
			<main
				className={`relative isolate min-h-dvh bg-art-paper px-4 py-8 text-ink sm:py-12 ${display.variable} ${body.variable} font-body`}
			>
				<div className="mx-auto flex w-full max-w-md flex-col gap-8">
					<Link
						href="/"
						prefetch={false}
						className="-ml-2 inline-flex min-h-11 w-fit items-center rounded-full px-2 font-display font-medium text-ink text-xl tracking-tight hover:text-art-berry focus-visible:outline-2 focus-visible:outline-indigo-700 focus-visible:outline-offset-2"
					>
						My Makeup
					</Link>
					<h1
						className={`text-balance text-left font-display font-medium text-4xl leading-[1.1] tracking-tight sm:text-5xl ${titleClassName}`.trim()}
					>
						{title}
					</h1>
					<div
						data-testid="auth-card"
						className="flex w-full flex-col items-center gap-6 rounded-card border border-hairline bg-white p-6 text-left sm:p-8"
					>
						{children}
					</div>
					{footer ? <div className="flex flex-col gap-1 text-ink text-sm">{footer}</div> : null}
				</div>
			</main>
		)
	}
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
