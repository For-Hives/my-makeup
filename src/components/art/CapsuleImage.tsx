import Image from 'next/image'
import type { LineDrawingName, MakeupObjectName } from './drawings'
import { LineDrawing, MakeupObject } from './graphics'

export type Tint = 'blush' | 'rose' | 'lavender' | 'sand' | 'indigo' | 'night'

export interface CapsuleImageProps {
	/** `pill` is 2.3 em wide, `round` 1.1 em; both about 1 em high, so they sit in a title. */
	shape?: 'pill' | 'round'
	tint?: Tint
	/** On a dark background: white drawing, lighter offset. */
	dark?: boolean
	/** What is inside: a makeup object, a one-line drawing, or a photo. Decoration, never information. */
	object?: MakeupObjectName
	line?: LineDrawingName
	image?: { src: string }
	/** Degrees, for an object laid on its side. */
	rotate?: number
	/** Colour of the drawing, as a text-colour class. */
	drawingClassName?: string
	className?: string
}

/**
 * A capsule (« pastille »): a picture in the shape of a pill, sized in `em` so it sits inside a title, with a white ring, a solid
 * indigo offset and an inner hairline. Pure decoration (`aria-hidden`): the words of the title carry the meaning, so
 * a capsule is never the only content of anything.
 */
export function CapsuleImage({
	shape = 'pill',
	tint = 'blush',
	dark = false,
	object,
	line,
	image,
	rotate,
	drawingClassName,
	className = '',
}: CapsuleImageProps) {
	const colour = drawingClassName ?? (dark ? 'text-white' : 'text-indigo-900')
	return (
		<span
			aria-hidden="true"
			data-tint={tint}
			data-shape={shape}
			{...(dark ? { 'data-dark': '' } : {})}
			className={`art-capsule ${className}`.trim()}
		>
			<span className="art-capsule__in">
				{image && <Image src={image.src} alt="" fill sizes="12rem" className="object-cover" />}
				{(object || line) && (
					<span className={`art-capsule__item ${colour}`} style={rotate ? { rotate: `${rotate}deg` } : undefined}>
						{object && <MakeupObject name={object} />}
						{line && <LineDrawing name={line} />}
					</span>
				)}
			</span>
		</span>
	)
}
