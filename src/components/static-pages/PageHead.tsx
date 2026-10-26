import type { CSSProperties, ReactNode } from 'react'
import { type ArchBand, ArchImage } from '@/components/art/ArchImage'
import type { Tint } from '@/components/art/CapsuleImage'
import type { LineDrawingName } from '@/components/art/drawings'
import { GlowBlob, LineDrawing, PrintMark, type PrintMarkKind } from '@/components/art/graphics'
import { Pill } from '@/components/art/Pill'

/**
 * The head of a content page in the kit's look (replaces the shared `Hero` on these pages, which the home page
 * keeps): the only h1 in Bodoni, the line under it, and either an arch picture beside the text (`split`, `mirrored`
 * puts the arch on the left) or the text alone, centred (`centered`, for pages whose title carries capsules).
 *
 * The motion is the one of the old head (docs/mouvement.md): the h1 is only clipped and moved (`enter-mask`, never
 * faded, so its text is painted at once), the line under it only moved (`enter`), the button faded (`enter-fade`).
 * The arch picture is the LCP on a phone: `priority`, no animation. The title may hold words, `TitleAccent` and
 * `CapsuleImage` (decoration, hidden from screen readers). No contact detail, no invented text: the decoration is a
 * painted illustration (a place for a future AI portrait: change `image`), a line drawing and a print mark.
 */
export function PageHead({
	title,
	description,
	layout = 'split',
	mirrored = false,
	// TODO(1136): illustration à générer (portrait par défaut de la tête de page, arche 4:5 ~380 px, une maquilleuse; remplace l'illustration provisoire)
	image = '/assets/back/maquilleuse_europeenne_white.webp',
	imageAlt = 'trouver une maquilleuse professionnelle freelance',
	tint = 'blush',
	band = 'band',
	mark = 'plus',
	drawing,
	glow = 'rose',
	signUp = false,
	children,
}: {
	title: ReactNode
	description: ReactNode
	layout?: 'split' | 'centered'
	mirrored?: boolean
	image?: string
	imageAlt?: string
	tint?: Tint
	band?: ArchBand
	mark?: PrintMarkKind | false
	/** A one-line drawing in the corner of a centred head, on a large screen only. */
	drawing?: LineDrawingName
	glow?: 'rose' | 'indigo' | 'blush'
	/** The sign-up pill under the text (« S'inscrire sur My-Makeup »). */
	signUp?: boolean
	/** More under the text (pills). */
	children?: ReactNode
}) {
	const split = layout === 'split'
	const text = (
		<div className={split ? '' : 'mx-auto max-w-4xl text-center'}>
			<h1
				className={`enter-mask text-balance font-display font-medium! leading-[1.08] tracking-tight ${split ? 'text-[2.1rem] sm:text-5xl lg:text-6xl' : 'text-[2.2rem] sm:text-5xl lg:text-7xl'}`}
			>
				{title}
			</h1>
			<p
				className={`enter mt-6 text-pretty text-lg text-mute leading-8 ${split ? 'max-w-[52ch]' : 'mx-auto max-w-[60ch]'}`}
				style={{ '--enter-i': 1 } as CSSProperties}
			>
				{description}
			</p>
			{(signUp || children !== undefined) && (
				<div
					className={`enter-fade mt-9 flex flex-wrap gap-4 ${split ? '' : 'justify-center'}`}
					style={{ '--enter-i': 2 } as CSSProperties}
				>
					{signUp && (
						<Pill href="/auth/signin" variant="filled" arrow>
							S&apos;inscrire sur My-Makeup
						</Pill>
					)}
					{children}
				</div>
			)}
		</div>
	)
	return (
		<header className="relative isolate overflow-hidden">
			<GlowBlob
				size="lg"
				tone={glow}
				className={
					split ? (mirrored ? '-left-80 -top-40' : '-right-80 -top-40') : 'top-[-22rem] left-1/2 -translate-x-1/2'
				}
			/>
			<div
				className={`page-frame relative pt-12 pb-16 md:pt-20 md:pb-24 ${split ? `grid items-center gap-12 md:gap-16 ${mirrored ? 'md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : 'md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]'}` : ''}`}
			>
				{drawing !== undefined && !split && (
					<>
						<div
							aria-hidden="true"
							className="pointer-events-none absolute top-16 left-8 hidden text-art-line xl:block"
						>
							<LineDrawing name={drawing} className="h-20 w-36" />
						</div>
						<div
							aria-hidden="true"
							className="pointer-events-none absolute top-24 right-12 hidden text-art-line xl:block"
						>
							<PrintMark kind="ring" className="h-5 w-5" />
						</div>
					</>
				)}
				{text}
				{split && <PageArch {...{ image, imageAlt, tint, band, mark, side: mirrored ? 'left' : 'right' }} />}
			</div>
		</header>
	)
}

function PageArch({
	image,
	imageAlt,
	tint,
	band,
	mark,
	side,
}: {
	image: string
	imageAlt: string
	tint: Tint
	band: ArchBand
	mark: PrintMarkKind | false
	side: 'left' | 'right'
}) {
	return (
		<div
			className={`mx-auto w-full max-w-[280px] md:max-w-[380px] ${side === 'right' ? 'pr-4' : 'pl-4 md:order-first'}`}
		>
			<ArchImage
				src={image}
				alt={imageAlt}
				tint={tint}
				band={band}
				side={side}
				mark={mark}
				priority
				sizes="(min-width: 768px) 380px, 280px"
			/>
		</div>
	)
}

// TODO(1136): illustration à générer (portraits en arche 4:5 pour la tête des pages; cinq variantes, une par teinte; aussi l'image par défaut de `PageHead`)
const ILLUSTRATIONS = [
	{ image: '/assets/back/maquilleuse_europeenne_white.webp', tint: 'blush', band: 'band' },
	{ image: '/assets/back/maquilleuse_asiatique_white.webp', tint: 'lavender', band: 'rose' },
	{ image: '/assets/back/maquilleuse_africaine_white.webp', tint: 'sand', band: 'night' },
	{ image: '/assets/back/maquilleuse_italienne_white.webp', tint: 'rose', band: 'band' },
	{ image: '/assets/back/maquilleuse_metisse_white.webp', tint: 'lavender', band: 'night' },
] as const satisfies readonly { image: string; tint: Tint; band: ArchBand }[]

/**
 * A painted illustration, its tint and its band, chosen from a key (a slug) so that the same page always gets the
 * same one and two neighbouring pages differ. These are the owner's illustrations served by the site, not photos of
 * people; this is the one place to swap for AI portraits later.
 */
export function pickIllustration(key: string) {
	let sum = 0
	for (const character of key) sum += character.charCodeAt(0)
	return ILLUSTRATIONS[sum % ILLUSTRATIONS.length] ?? ILLUSTRATIONS[0]
}
