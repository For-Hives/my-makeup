import type { ReactNode } from 'react'

/**
 * The head of a section of the home page below the hero (issue 1101): a numbered hairline (the number is drawn by
 * the stylesheet, a CSS counter, so it follows the sections that exist and is not in the page text), the title, and
 * an optional line under it. Three siblings, each one revealed: they come into view together and the reveal script
 * staggers them 70 ms apart (docs/mouvement.md). The `h2` keeps the text and the id the page gave it.
 */
export function SectionHead({
	id,
	titre,
	children,
	align = 'start',
}: {
	id?: string
	titre: ReactNode
	/** The line under the title. */
	children?: ReactNode
	align?: 'start' | 'center' | 'end'
}) {
	const frame = {
		start: 'max-w-3xl',
		center: 'mx-auto max-w-3xl text-center',
		end: 'ml-auto max-w-3xl text-right',
	}[align]
	return (
		<div className={frame}>
			<div aria-hidden="true" className={`reveal home-eyebrow${align === 'start' ? '' : ` home-eyebrow-${align}`}`} />
			<h2
				id={id}
				className="reveal mt-6 text-balance font-bold text-3xl text-gray-900 tracking-tight md:text-4xl lg:text-5xl lg:leading-[1.1]"
			>
				{titre}
			</h2>
			{children !== undefined && (
				<p className="reveal mt-6 text-pretty text-gray-700 text-lg leading-8 md:text-xl md:leading-9">{children}</p>
			)}
		</div>
	)
}
