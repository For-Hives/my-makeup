import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Icon, type IconName } from './graphics'

/** The tones of a chip: outlined grey, blush, indigo, ink outline, solid indigo, white « seal ». */
export type ChipTone = 'plain' | 'blush' | 'indigo' | 'ink' | 'solid' | 'seal'

const TONE: Record<ChipTone, string> = {
	plain: 'border-hairline text-mute',
	blush: 'border-transparent bg-art-blush text-art-blush-ink',
	indigo: 'border-transparent bg-indigo-100 text-indigo-900',
	ink: 'border-ink text-ink',
	solid: 'border-indigo-700 bg-indigo-700 text-white',
	seal: 'border-indigo-200 bg-white text-indigo-900',
}

interface ChipCommon {
	tone?: ChipTone
	icon?: IconName
	className?: string
	children: ReactNode
}

/**
 * A chip. With no link and no `pressed` it is a plain label (30 px, not a target). With an `href` it is a link, and
 * with `pressed` (true or false) it is a toggle button (`aria-pressed`): both are 44 px high, take the keyboard ring,
 * and a pressed chip turns solid indigo. A link chip that stands for the current filter passes `current`.
 */
export type ChipProps =
	| (ChipCommon & { href?: undefined; pressed?: undefined } & Omit<ComponentProps<'span'>, 'className' | 'children'>)
	| (ChipCommon & { href: string; current?: boolean } & Omit<
				ComponentProps<typeof Link>,
				'href' | 'className' | 'children'
			>)
	| (ChipCommon & { href?: undefined; pressed: boolean } & Omit<ComponentProps<'button'>, 'className' | 'children'>)

/** What a link or a button chip does under a hand (issue 1137): a soft fill of its own tone, no underline, never a block. */
const HOVER: Record<ChipTone, string> = {
	plain: 'hover:bg-indigo-50',
	blush: 'hover:bg-art-rose-tint',
	indigo: 'hover:bg-indigo-200',
	ink: 'hover:bg-indigo-50',
	solid: 'hover:border-indigo-900 hover:bg-indigo-900 hover:text-white',
	seal: 'hover:bg-indigo-50',
}

const LABEL = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 font-medium text-[13.5px] whitespace-nowrap'
const TARGET =
	'min-h-11 cursor-pointer hover:no-underline px-[18px] text-[15px] hover:border-indigo-700 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700'

export function Chip(props: ChipProps) {
	const { tone = 'plain', icon, className = '', children, ...rest } = props
	const inner = (
		<>
			{icon && <Icon name={icon} className="h-3 w-3" />}
			{children}
		</>
	)
	if (typeof props.href === 'string') {
		const { href, current, ...linkProps } = rest as { href: string; current?: boolean } & Omit<
			ComponentProps<typeof Link>,
			'className' | 'children'
		>
		return (
			<Link
				href={href}
				aria-current={current ? 'true' : undefined}
				className={`${LABEL} ${TARGET} ${TONE[tone]} ${current ? 'border-indigo-700 bg-indigo-700 text-white hover:text-white' : HOVER[tone]} ${className}`.trim()}
				{...linkProps}
			>
				{inner}
			</Link>
		)
	}
	if (typeof props.pressed === 'boolean') {
		const { pressed, ...buttonProps } = rest as { pressed: boolean } & ComponentProps<'button'>
		const hover = pressed ? '' : HOVER[tone]
		return (
			<button
				type="button"
				aria-pressed={pressed}
				className={`${LABEL} ${TARGET} ${TONE[tone]} ${hover} aria-pressed:border-indigo-700 aria-pressed:bg-indigo-700 aria-pressed:text-white ${className}`.trim()}
				{...buttonProps}
			>
				{inner}
			</button>
		)
	}
	return (
		<span className={`${LABEL} min-h-[30px] ${TONE[tone]} ${className}`.trim()} {...(rest as ComponentProps<'span'>)}>
			{inner}
		</span>
	)
}
