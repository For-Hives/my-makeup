import type { ReactNode } from 'react'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { CtaBackdrop } from '@/components/blocks/CtaBackdrop'
import type { MyMakeupEvents } from '@/lib/analytics/events'
import { pillClassName } from './Pill'

type Where = MyMakeupEvents['cta_click']['where']

export interface ArtCtaLink {
	href: string
	label: string
	/** The measure of the click: the `where` value of the `cta_click` event. */
	where: Where
}

/**
 * The call to action in the kit's look: an indigo panel on the page background (no white frame: it made a thick band,
 * 25/10/2026), with the real WebGL shader behind (`CtaBackdrop`: the static gradients first, the shader only when the
 * block is near the screen and motion is allowed, unmounted when it leaves). It has no decor (27/10/2026: no lips,
 * brush, print marks or glows around it) and follows the one frame of the site: the panel sits in `page-frame`, so it
 * lines up edge to edge with the sections above it, with the same gutter on a phone. The title is a notch smaller
 * (56 px at most) on a wider measure, so the block is light. The shader's colours are the existing indigos that hold
 * 4.5:1 under white text, so the text reads on the worst pixel; the side mask of the left-aligned version is lifted
 * here because the text is centred (`.art-cta-open`). Same two measured links as `Cta`.
 */
export function ArtCta({
	title,
	children,
	primary,
	secondary,
}: {
	title: ReactNode
	children: ReactNode
	primary: ArtCtaLink
	secondary: ArtCtaLink
}) {
	return (
		<section className="bg-art-paper py-12 md:py-20">
			<div className="page-frame">
				<div className="reveal art-cta-open relative isolate overflow-hidden rounded-art-frame bg-art-night px-6 py-14 text-center text-white md:px-16 md:py-24">
					<CtaBackdrop />
					<div className="relative">
						<h2 className="mx-auto max-w-[24ch] text-balance font-display font-medium text-[2rem] leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.25rem]">
							{title}
						</h2>
						<p className="mx-auto mt-5 max-w-[48ch] text-balance text-base text-white md:mt-6 md:text-lg">{children}</p>
						<div className="mt-8 flex flex-wrap justify-center gap-4 md:mt-10">
							<TrackedLink
								href={primary.href}
								suivi={{ nom: 'cta_click', proprietes: { where: primary.where } }}
								className={pillClassName({ variant: 'light' })}
							>
								{primary.label}
							</TrackedLink>
							<TrackedLink
								href={secondary.href}
								suivi={{ nom: 'cta_click', proprietes: { where: secondary.where } }}
								className={pillClassName({ variant: 'ghost-light' })}
							>
								{secondary.label}
							</TrackedLink>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}
