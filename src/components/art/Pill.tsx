import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from './graphics'

/** The looks of a pill button: ink outline, solid indigo, white (on a dark band), ghost (on a dark band), and the round « play » disc. */
export type PillVariant = 'outline' | 'filled' | 'light' | 'ghost-light' | 'play'

const BASE =
	'group inline-flex items-center justify-center gap-3.5 rounded-full border text-center font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4'

const SIZE = { md: 'min-h-13 px-7 text-base', sm: 'min-h-11 px-5 text-[15px]' } as const

const LOOK: Record<Exclude<PillVariant, 'play'>, string> = {
	outline: 'border-ink text-ink hover:bg-ink hover:text-white focus-visible:outline-indigo-700',
	filled:
		'border-indigo-700 bg-indigo-700 text-white hover:border-indigo-900 hover:bg-indigo-900 focus-visible:outline-indigo-700',
	light: 'border-white bg-white text-art-night hover:border-art-blush hover:bg-art-blush focus-visible:outline-white',
	'ghost-light': 'border-white/70 text-white hover:bg-white hover:text-art-night focus-visible:outline-white',
}

/**
 * The class of a pill: for a link that must stay another component (the tracked links of the call to action wear it).
 * Every size is 44 px high at least, and the keyboard ring is always drawn (white on a dark band).
 */
export function pillClassName({
	variant = 'outline',
	size = 'md',
}: {
	variant?: PillVariant
	size?: 'md' | 'sm'
} = {}) {
	if (variant === 'play')
		return 'group inline-flex min-h-14 items-center gap-3.5 rounded-full text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-700'
	return `${BASE} ${SIZE[size]} ${LOOK[variant]}`
}

interface PillCommon {
	variant?: PillVariant
	size?: 'md' | 'sm'
	/** Draws the arrow that moves 4 px ahead on hover (a still arrow with reduced motion). */
	arrow?: boolean
	className?: string
	children: ReactNode
}

export type PillProps =
	| (PillCommon & { href: string } & Omit<ComponentProps<typeof Link>, 'href' | 'className' | 'children'>)
	| (PillCommon & { href?: undefined } & Omit<ComponentProps<'button'>, 'className' | 'children'>)

function Content({ variant, arrow, children }: Pick<PillCommon, 'variant' | 'arrow' | 'children'>) {
	if (variant === 'play')
		return (
			<>
				<span className="grid size-14 flex-none place-items-center rounded-full border border-ink transition-colors group-hover:bg-ink group-hover:text-white">
					<Icon name="play" className="ml-0.5 h-4 w-4" />
				</span>
				{children}
			</>
		)
	return (
		<>
			{children}
			{arrow && <Icon name="arrow-right" className="art-arrow h-5 w-5" />}
		</>
	)
}

/**
 * A pill button or link (a link when it has an `href`). Server component. `variant="play"` is a round disc with a
 * play triangle and a label, for « Comment ça marche ? ». The arrow and the disc are decoration (`aria-hidden`): the
 * label is the name of the control.
 */
export function Pill(props: PillProps) {
	const { variant = 'outline', size = 'md', arrow = false, className = '', children, ...rest } = props
	const classes = `${pillClassName({ variant, size })} ${className}`.trim()
	if (typeof props.href === 'string') {
		const { href, ...linkProps } = rest as Omit<ComponentProps<typeof Link>, 'className' | 'children'>
		return (
			<Link href={href} className={classes} {...linkProps}>
				<Content variant={variant} arrow={arrow}>
					{children}
				</Content>
			</Link>
		)
	}
	const buttonProps = rest as ComponentProps<'button'>
	return (
		<button type="button" className={classes} {...buttonProps}>
			<Content variant={variant} arrow={arrow}>
				{children}
			</Content>
		</button>
	)
}
