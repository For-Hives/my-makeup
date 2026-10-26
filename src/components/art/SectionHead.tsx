import type { ReactNode } from 'react'

/**
 * The head of a section in the kit's look. `centered`: eyebrow, title and lede in the middle, with optional art on
 * both sides (shown from 1024 px, decoration). `left`: a numbered eyebrow (« 01 — Les catégories », number in
 * italic Bodoni, then a hairline), the title, the lede, and an optional `aside` on the right (the arrows of a rail,
 * a link). The title is the section's heading: pass `id` to name the section with it. Three revealed siblings, like
 * the home head, so they come in together (docs/mouvement.md).
 */
export function SectionHead({
	variant = 'centered',
	eyebrow,
	number,
	title,
	children,
	aside,
	sideArt,
	id,
	as: Heading = 'h2',
}: {
	variant?: 'centered' | 'left'
	eyebrow?: string
	/** `left` only: « 01 », « 02 »… drawn in italic Bodoni before the eyebrow. */
	number?: string
	title: ReactNode
	/** The lede under the title. */
	children?: ReactNode
	aside?: ReactNode
	sideArt?: { start?: ReactNode; end?: ReactNode }
	id?: string
	as?: 'h2' | 'h3'
}) {
	const centered = variant === 'centered'
	const eyebrowNode = eyebrow && (
		<p
			className={`reveal mb-3.5 inline-flex items-center gap-2.5 font-semibold text-[13px] text-indigo-800 uppercase tracking-[0.14em]`}
		>
			{number && !centered && (
				<span className="font-display text-[22px] font-medium normal-case italic tracking-normal">{number}</span>
			)}
			{number && !centered && <span aria-hidden="true" className="h-px w-11 bg-current" />}
			{eyebrow}
		</p>
	)
	const heading = (
		<Heading
			id={id}
			className={`reveal text-balance font-display font-medium tracking-tight leading-[1.04] text-4xl md:text-5xl lg:text-6xl ${centered ? '' : 'lg:text-[3.5rem]'}`}
		>
			{title}
		</Heading>
	)
	const lede = children !== undefined && (
		<p className={`reveal text-pretty text-lg text-mute ${centered ? 'mt-4.5' : 'mt-0'}`}>{children}</p>
	)
	if (centered)
		return (
			<div className="relative mx-auto max-w-3xl py-6 text-center">
				{sideArt?.start && (
					<div aria-hidden="true" className="pointer-events-none absolute top-0 -left-40 hidden w-32 lg:block">
						{sideArt.start}
					</div>
				)}
				{sideArt?.end && (
					<div aria-hidden="true" className="pointer-events-none absolute top-0 -right-40 hidden w-32 lg:block">
						{sideArt.end}
					</div>
				)}
				{eyebrowNode}
				{heading}
				{lede}
			</div>
		)
	return (
		<div className="grid items-end gap-x-12 gap-y-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
			<div>
				{eyebrowNode}
				{heading}
			</div>
			{lede ? <div className="pb-1">{lede}</div> : <div />}
			{aside && <div className="reveal flex gap-3">{aside}</div>}
		</div>
	)
}
