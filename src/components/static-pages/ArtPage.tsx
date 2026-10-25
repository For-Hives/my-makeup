import type { ReactNode } from 'react'
import { Hairline } from '@/components/art/graphics'
import { body, display } from '@/components/direct-edit/fonts'

/**
 * The shell and the small shared pieces of the content pages that wear the art direction kit (issue 1111,
 * docs/direction-artistique.md): paper background, the two preloaded faces of the content pages (so the load and the
 * layout shift of these routes do not change), the scope of the `content-page` rules of globals.css. The legal pages do
 * not use this shell: they keep `ContentPage` and their text, byte for byte.
 */

/** The `<main>` of a page in the kit's look: paper, ink, the faces of the content pages. */
export function ArtPage({ children }: { children: ReactNode }) {
	return (
		<main className={`content-page relative bg-art-paper text-ink ${display.variable} ${body.variable} font-body`}>
			{children}
		</main>
	)
}

/** A short label over a title: where the page sits (a label of the menu), never a sentence. */
export function ArtEyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
	return (
		<p
			className={`reveal inline-flex items-center gap-2.5 font-semibold text-[13px] text-indigo-800 uppercase tracking-[0.14em] ${className}`.trim()}
		>
			<span aria-hidden="true" className="h-px w-9 bg-current" />
			{children}
		</p>
	)
}

/**
 * The heading of an article under the head of a page: an eyebrow, the h2 in Bodoni (a long title, so a size under the
 * one of a section head), and an optional lede. Three revealed siblings that come in together.
 */
export function ArticleHeading({
	eyebrow,
	title,
	centered = false,
	children,
	id,
}: {
	eyebrow?: string
	title: string
	centered?: boolean
	children?: ReactNode
	id?: string
}) {
	return (
		<div className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
			{eyebrow !== undefined && <ArtEyebrow className="mb-4">{eyebrow}</ArtEyebrow>}
			<h2
				id={id}
				className="reveal text-balance font-display font-medium text-3xl leading-[1.1] tracking-tight md:text-4xl lg:text-[2.6rem]"
			>
				{title}
			</h2>
			{children !== undefined && <div className="reveal mt-6">{children}</div>}
		</div>
	)
}

/** The first paragraph of an article, larger than the text, at a reading measure. */
export function ArtLead({ children, className = '' }: { children: ReactNode; className?: string }) {
	return (
		<p className={`max-w-[62ch] text-pretty text-ink text-lg leading-8 sm:text-xl sm:leading-9 ${className}`.trim()}>
			{children}
		</p>
	)
}

/** The closing line of an article: a hairline and the team. */
export function ArtSignature({ className = '' }: { className?: string }) {
	return (
		<p className={`reveal mt-12 flex items-center gap-4 text-mute text-sm ${className}`.trim()}>
			<Hairline variant="line" className="h-3 w-12 text-ink" />
			<span>L&apos;équipe My-Makeup</span>
		</p>
	)
}
