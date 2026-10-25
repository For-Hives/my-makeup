import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from './graphics'

import { type PillVariant, pillClassName } from './pill-class'

export { type PillVariant, pillClassName }

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
