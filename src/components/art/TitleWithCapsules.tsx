import { Fragment, type ReactNode } from 'react'
import { CapsuleImage, type CapsuleImageProps } from './CapsuleImage'

export type TitleTone = 'ink' | 'indigo' | 'berry' | 'rose'

const TONE: Record<TitleTone, string> = {
	ink: '',
	indigo: 'text-indigo-700',
	berry: 'text-art-berry',
	rose: 'text-art-rose',
}

/** A coloured or italic word of a title. The rule: at most two colours (ink, indigo, berry) and one italic word. */
export function TitleAccent({
	tone = 'indigo',
	italic = false,
	children,
}: {
	tone?: TitleTone
	italic?: boolean
	children: ReactNode
}) {
	return <span className={`${TONE[tone]} ${italic ? 'font-normal italic' : ''}`.trim()}>{children}</span>
}

export type TitleSegment =
	| { text: string; tone?: TitleTone; italic?: boolean }
	| { capsule: CapsuleImageProps }
	| { lineBreak: true }

const SIZE = {
	section: 'text-4xl md:text-5xl lg:text-6xl',
	hero: 'text-[2.4rem] sm:text-5xl lg:text-7xl',
	/** A block title inside a column (an h3 beside a photo). */
	card: 'text-3xl md:text-4xl',
} as const

/**
 * A title in Bodoni made of words and small capsule pictures, the multicolour title of the kit. `segments` are
 * words (with an optional tone and italic), capsules (decoration, hidden from screen readers) and line breaks;
 * a space is added between two neighbours. The heading's text is the words alone.
 */
export function TitleWithCapsules({
	segments,
	as: Tag = 'h2',
	size = 'section',
	id,
	className = '',
}: {
	segments: readonly TitleSegment[]
	as?: 'h1' | 'h2' | 'h3'
	size?: keyof typeof SIZE
	id?: string
	className?: string
}) {
	return (
		<Tag
			id={id}
			className={`text-balance font-display font-medium tracking-tight leading-[1.14] ${SIZE[size]} ${className}`.trim()}
		>
			{segments.map((segment, index) => {
				const key = `${index}`
				const separator =
					index > 0 && !('lineBreak' in segment) && !('lineBreak' in (segments[index - 1] ?? {})) ? ' ' : null
				return (
					<Fragment key={key}>
						{separator}
						{'lineBreak' in segment ? (
							<br />
						) : 'capsule' in segment ? (
							<CapsuleImage {...segment.capsule} />
						) : (
							<TitleAccent tone={segment.tone ?? 'ink'} italic={segment.italic ?? false}>
								{segment.text}
							</TitleAccent>
						)}
					</Fragment>
				)
			})}
		</Tag>
	)
}
