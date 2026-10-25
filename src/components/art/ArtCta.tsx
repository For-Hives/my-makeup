import type { ReactNode } from 'react'
import { TrackedLink } from '@/components/analytics/TrackedLink'
import { CtaBackdrop } from '@/components/blocks/CtaBackdrop'
import type { MyMakeupEvents } from '@/lib/analytics/events'
import { GlowBlob, LineDrawing, PrintMark } from './graphics'
import { pillClassName } from './Pill'

type Where = MyMakeupEvents['cta_click']['where']

export interface ArtCtaLink {
	href: string
	label: string
	/** The measure of the click: the `where` value of the `cta_click` event. */
	where: Where
}

/**
 * The call to action in the kit's look: a white frame, a large indigo panel with the same real WebGL shader behind
 * (`CtaBackdrop`: the static gradients first, the shader only when the block is near the screen and motion is allowed,
 * unmounted when it leaves), centred Bodoni title, pill buttons, and a lot of room (120 px of air on a laptop). The
 * shader's colours are the existing indigos that hold 4.5:1 under white text, so the text reads on the worst pixel; the
 * side mask of the left-aligned version is lifted here because the text is centred (`.art-cta-open`). One-line drawings
 * and print marks sit in the corners, away from the text, hidden under 768 px. Same two measured links as `Cta`.
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
		<section className="relative overflow-hidden bg-art-paper px-4 py-16 md:px-8 md:py-36">
			<GlowBlob size="lg" tone="indigo" className="-top-40 -left-96 opacity-50" />
			<GlowBlob size="md" tone="rose" className="-right-72 -bottom-48" />
			<div className="reveal relative mx-auto max-w-6xl rounded-[calc(var(--radius-art-frame)+12px)] border border-nude-200 bg-white p-3.5 md:p-12">
				<div className="art-cta-open relative isolate overflow-hidden rounded-art-frame bg-art-night px-6 py-20 text-center text-white md:px-24 md:py-44">
					<CtaBackdrop />
					<div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden text-white/35 md:block">
						<LineDrawing name="lips" className="absolute top-12 left-10 h-16 w-28" />
						<LineDrawing name="hand-brush" className="absolute right-10 bottom-10 h-36 w-24" />
						<PrintMark kind="plus" className="absolute top-14 right-20 h-5 w-5" />
						<PrintMark kind="ring" className="absolute bottom-16 left-24 h-4 w-4" />
					</div>
					<div className="relative">
						<h2 className="mx-auto max-w-[16ch] text-balance font-display font-medium text-[2rem] leading-[1.06] tracking-tight sm:text-5xl lg:text-[5rem]">
							{title}
						</h2>
						<p className="mx-auto mt-7 max-w-[48ch] text-balance text-lg text-white md:mt-9 md:text-xl">{children}</p>
						<div className="mt-11 flex flex-wrap justify-center gap-4 md:mt-14">
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
