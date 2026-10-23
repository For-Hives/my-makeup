import type { ReactNode } from 'react'

/** The page of the onboarding: where the sign-in page brings her back. */
export const ONBOARDING_PAGE = '/auth/init-account'

/** The page the onboarding ends on: the server reads her profile and says where she stands (issue 1009). */
export const ONBOARDING_END_PAGE = `${ONBOARDING_PAGE}?etape=fin`

/** The look of a button that is not the main one, as « Annuler » in the editors of the direct edition. */
export const SECONDARY_BUTTON =
	'min-h-11 w-full rounded-full border border-ink bg-white px-6 font-semibold text-ink text-sm transition-colors hover:bg-nude-100 focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 disabled:opacity-60 motion-reduce:transition-none sm:w-auto'

/** The look of a link or a button that leads on without saving (« Plus tard »): quiet, but 44 px tall. */
export const QUIET_BUTTON =
	'inline-flex min-h-11 items-center justify-center rounded-full px-4 font-semibold text-mute text-sm underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 disabled:opacity-60'

/**
 * The frame of one step: its title (focused when the step opens), its explanation, and its form. The
 * heading carries the display typeface of the art direction; the card is white on blush, red only where
 * she can act.
 */
export function StepFrame({
	titre,
	explication,
	reference,
	children,
}: {
	titre: string
	explication: ReactNode
	reference: React.RefObject<HTMLHeadingElement | null>
	children: ReactNode
}) {
	return (
		<section
			aria-labelledby="accueil-titre-etape"
			className="flex flex-col gap-5 rounded-card border border-hairline bg-white p-5 sm:p-7"
		>
			<div className="flex flex-col gap-2">
				<h2
					id="accueil-titre-etape"
					ref={reference}
					tabIndex={-1}
					className="font-display font-medium text-2xl text-ink focus-visible:outline-none sm:text-3xl"
				>
					{titre}
				</h2>
				<p className="text-mute">{explication}</p>
			</div>
			{children}
		</section>
	)
}
