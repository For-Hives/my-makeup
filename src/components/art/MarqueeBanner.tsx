import { Fragment } from 'react'
import { PrintMark, type PrintMarkKind } from './graphics'
import { MarqueePauseButton } from './MarqueePauseButton'

const ROUNDS = [0, 1, 2, 3, 4, 5] as const

/** `band`: indigo, script face, white. `rule`: paper, ink hairlines, italic display, runs the other way. `blush`: pink, small capitals. */
export type MarqueeVariant = 'band' | 'rule' | 'blush'

const SEPARATOR: Record<MarqueeVariant, { kind: PrintMarkKind; className: string }> = {
	band: { kind: 'plus', className: 'h-5 w-5' },
	rule: { kind: 'ring', className: 'h-3.5 w-3.5 text-indigo-700' },
	blush: { kind: 'dot', className: 'h-3 w-3 text-art-berry' },
}

/**
 * The scrolling banner of the kit, three variants. A server component: the text is in the HTML once for a screen reader
 * (the repeats and the second group are `aria-hidden`), the sliding is CSS (`transform` only, hover, focus and the pause
 * button stop it), and with reduced motion it is a static, centred line with no copy and no pause button. `items` are
 * short phrases, each followed by a print mark. `label` names the region.
 */
export function MarqueeBanner({
	items,
	label,
	variant = 'band',
	repeat = variant === 'band' ? 3 : 2,
	className = '',
	rounded = false,
}: {
	items: readonly string[]
	label: string
	variant?: MarqueeVariant
	/** How many times the phrases are written in a group, so a group is wider than the screen. */
	repeat?: number
	className?: string
	rounded?: boolean
}) {
	const separator = SEPARATOR[variant]
	const group = (hidden: boolean) =>
		ROUNDS.slice(0, repeat).map(round => (
			<Fragment key={round}>
				{items.map(item => (
					<span
						key={item}
						className="art-marquee__item"
						{...(hidden || round > 0 ? { 'aria-hidden': true } : {})}
						{...(round > 0 ? { 'data-copy': '' } : {})}
					>
						{item}
						<PrintMark kind={separator.kind} className={separator.className} />
					</span>
				))}
			</Fragment>
		))
	return (
		<section
			aria-label={label}
			data-variant={variant}
			className={`art-marquee ${rounded ? 'rounded-[18px]' : ''} ${className}`.trim()}
		>
			<div className="art-marquee__track">
				<div className="art-marquee__group">{group(false)}</div>
				<div className="art-marquee__group" aria-hidden="true">
					{group(true)}
				</div>
			</div>
			<MarqueePauseButton />
		</section>
	)
}
