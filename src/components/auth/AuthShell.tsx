import type { ReactNode } from 'react'
import { ArchImage } from '@/components/art/ArchImage'
import { GlowBlob, MakeupObject, PrintMark } from '@/components/art/graphics'
import { body, display } from '@/components/direct-edit/fonts'

/**
 * The shell of the pages of sign-in, sign-up, forgotten password and verification, in the kit's look (coherence pass,
 * 25/10/2026): paper, the only h1 in Bodoni, one diffuse glow and one print mark (decoration, hidden from screen
 * readers). Same two preloaded faces as the content pages. It adds no word: the page gives the title and the content.
 * A server component.
 *
 * Two layouts. `centered` (the default) is a centred column. `split` (issue 1138, sign-in and sign-up) puts an art
 * panel on one side, with the title and a photo cut as an arch (decoration, from 1024 px up only), and the form in a
 * white card on the other; under 1024 px the title sits over the card. Both columns start at the top (never centred
 * on the page's height): a font that arrives late changes the height of a column, and a centred one would move. `footer` is what goes under the card (the
 * links to the other pages).
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
	layout?: 'centered' | 'split'
	/** Under the card, `split` only. */
	footer?: ReactNode
}) {
	if (layout === 'split') {
		return (
			<main
				className={`relative isolate min-h-dvh overflow-hidden bg-art-paper text-ink lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] ${display.variable} ${body.variable} font-body`}
			>
				<GlowBlob size="lg" tone="rose" className="-right-72 -top-48 -z-10" />
				<section className="relative flex flex-col items-center gap-10 px-4 pt-14 pb-6 text-center lg:items-start lg:bg-art-blush-50 lg:px-12 lg:py-20 lg:text-left xl:px-20">
					<PrintMark kind="ring" className="absolute top-12 left-10 hidden h-5 w-5 text-art-line lg:block" />
					<h1
						className={`text-balance font-display font-medium text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl ${titleClassName}`.trim()}
					>
						{title}
					</h1>
					<div className="relative hidden w-full max-w-[17rem] lg:ml-4 lg:block xl:ml-6 xl:max-w-sm">
						<ArchImage
							src="/assets/maquilleuse_blog.webp"
							tint="rose"
							band="night"
							side="left"
							mark="ring"
							sizes="(min-width: 1280px) 24rem, 17rem"
							quality={90}
						/>
						<MakeupObject
							name="brush"
							className="absolute -right-6 bottom-8 h-24 w-24 rotate-12 text-art-berry xl:-right-12"
						/>
					</div>
				</section>
				<div className="relative flex flex-col items-center gap-6 px-4 pt-4 pb-16 lg:px-12 lg:py-20">
					<div
						data-testid="auth-card"
						className="flex w-full max-w-md flex-col items-center gap-6 rounded-card border border-hairline bg-white p-6 text-left shadow-art-lift sm:p-10"
					>
						{children}
					</div>
					{footer ? (
						<div className="flex flex-col items-center gap-1 text-center text-ink text-sm">{footer}</div>
					) : null}
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
