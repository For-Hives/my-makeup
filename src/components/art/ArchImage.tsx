import Image from 'next/image'
import type { ReactNode } from 'react'
import type { Tint } from './CapsuleImage'
import { PrintMark, type PrintMarkKind } from './graphics'

export type ArchBand = 'band' | 'rose' | 'night'

const MARK_COLOUR: Record<ArchBand, string> = {
	band: 'text-art-berry',
	rose: 'text-indigo-700',
	night: 'text-art-berry',
}

/**
 * A picture cut as an arch (two 999 px radii on top, 4:5), with a coloured band offset behind it, a white ring and an
 * inner hairline. `band` is the band colour (indigo violet, rose, night), `side` the side it falls on, `mark` an optional print
 * mark on the band's corner (never twinkling), `size="sm"` the smaller offset for a list card. Give `src` and `alt`
 * (`alt=""` when the picture only decorates) or put a drawing in `children` for a placeholder on a tint.
 * A server component; wrap it in `.card-hover` to get the photo zoom.
 */
export function ArchImage({
	src,
	alt = '',
	tint = 'blush',
	band = 'band',
	side = 'right',
	size = 'md',
	mark = 'plus',
	sizes = '(min-width: 768px) 33vw, 80vw',
	priority = false,
	children,
	className = '',
}: {
	src?: string
	alt?: string
	tint?: Tint
	band?: ArchBand
	side?: 'right' | 'left'
	size?: 'md' | 'sm'
	mark?: PrintMarkKind | false
	sizes?: string
	priority?: boolean
	children?: ReactNode
	className?: string
}) {
	return (
		<div
			data-band={band}
			data-side={side === 'left' ? 'left' : undefined}
			data-size={size === 'sm' ? 'sm' : undefined}
			data-tint={tint}
			className={`art-arch ${className}`.trim()}
		>
			<div className="art-arch__img">
				{src && (
					<Image
						src={src}
						alt={alt}
						fill
						sizes={sizes}
						priority={priority}
						fetchPriority={priority ? 'high' : undefined}
						className="card-zoom object-cover object-center"
					/>
				)}
				{children}
			</div>
			{mark && (
				<span aria-hidden="true" className={`art-arch__mark ${MARK_COLOUR[band]}`}>
					<PrintMark kind={mark} className={size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'} />
				</span>
			)}
		</div>
	)
}
