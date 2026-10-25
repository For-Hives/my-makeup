import Link from 'next/link'
import type { ComponentProps } from 'react'
import { Icon, type IconName } from './graphics'

type RoundCommon = {
	/** The accessible name: a round button has no text, so it is required. */
	label: string
	icon: IconName
	/** Ink disc with a white icon, for the « next » of a pair. */
	solid?: boolean
	className?: string
}

export type RoundButtonProps =
	| (RoundCommon & { href: string } & Omit<
				ComponentProps<typeof Link>,
				'href' | 'className' | 'children' | 'aria-label'
			>)
	| (RoundCommon & { href?: undefined } & Omit<ComponentProps<'button'>, 'className' | 'children' | 'aria-label'>)

/** The 52 px round button of the kit (previous, next, search, menu). Always named by `label`; the icon is decoration. */
export function RoundButton(props: RoundButtonProps) {
	const { label, icon, solid = false, className = '', ...rest } = props
	const classes =
		`inline-flex size-13 flex-none items-center justify-center rounded-full border border-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-700 disabled:cursor-default disabled:opacity-45 ${
			solid ? 'bg-ink text-white hover:bg-art-night' : 'text-ink hover:bg-ink hover:text-white'
		} ${className}`.trim()
	if (typeof props.href === 'string') {
		const { href, ...linkProps } = rest as Omit<ComponentProps<typeof Link>, 'className' | 'children'>
		return (
			<Link href={href} aria-label={label} className={classes} {...linkProps}>
				<Icon name={icon} />
			</Link>
		)
	}
	const buttonProps = rest as ComponentProps<'button'>
	return (
		<button type="button" aria-label={label} className={classes} {...buttonProps}>
			<Icon name={icon} />
		</button>
	)
}
