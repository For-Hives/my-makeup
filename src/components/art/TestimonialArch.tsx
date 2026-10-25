import Image from 'next/image'
import type { ReactNode } from 'react'
import { type ArchBand, ArchImage } from './ArchImage'
import type { Tint } from './CapsuleImage'
import type { MakeupObjectName } from './drawings'
import { MakeupObject } from './graphics'

/**
 * The testimonial of the kit: an arch picture beside a large quote in Bodoni, with the name and the role under it.
 * A `<figure>` with a `<blockquote>` and a `<figcaption>`. The big opening quotation mark is decoration. With no
 * `image` the arch holds a drawn makeup object on a tint, so the layout stands even before there is a portrait.
 * `quote` may carry a `TitleAccent` for one coloured word.
 */
export function TestimonialArch({
	quote,
	name,
	byline,
	image,
	placeholder = 'lipstick',
	tint = 'blush',
	band = 'band',
	avatar,
}: {
	quote: ReactNode
	name: string
	/** Under the name: « Mariée, Annecy ». */
	byline?: string
	image?: { src: string; alt: string }
	placeholder?: MakeupObjectName
	tint?: Tint
	band?: ArchBand
	/** A round portrait next to the name; decoration, the name is written out. */
	avatar?: { src: string }
}) {
	return (
		<figure className="grid items-center gap-9 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:gap-24">
			<div className="mx-auto w-full max-w-[280px] md:mx-0 md:max-w-none">
				<ArchImage src={image?.src} alt={image?.alt} tint={tint} band={band} mark="ring">
					{!image && (
						<span aria-hidden="true" className="absolute inset-[20%_26%] text-indigo-900">
							<MakeupObject name={placeholder} />
						</span>
					)}
				</ArchImage>
			</div>
			<div>
				<span aria-hidden="true" className="block h-[52px] font-display text-[120px] text-art-rose leading-[0.6]">
					“
				</span>
				<blockquote className="text-balance font-display text-[1.65rem] leading-[1.22] sm:text-4xl lg:text-[2.5rem]">
					{quote}
				</blockquote>
				<figcaption className="mt-7 flex items-center gap-4">
					{avatar && (
						<span
							aria-hidden="true"
							className="relative size-14 flex-none overflow-hidden rounded-full bg-art-blush shadow-[0_0_0_2px_#fff,0_0_0_3px_var(--color-indigo-200)]"
						>
							<Image src={avatar.src} alt="" fill sizes="56px" className="object-cover" />
						</span>
					)}
					<span>
						<b className="block font-semibold">{name}</b>
						{byline && <span className="text-[14.5px] text-mute">{byline}</span>}
					</span>
				</figcaption>
			</div>
		</figure>
	)
}
