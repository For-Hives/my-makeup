import type { ReactNode } from 'react'
import { expiredSessionUrl } from '@/lib/auth/return-to'

/** The page of the onboarding: where the sign-in page brings her back. */
export const PAGE_DE_L_ACCUEIL = '/auth/init-account'

export const BOUTON = 'min-h-11 rounded-md px-4 py-2 font-medium'
export const BOUTON_PRINCIPAL = `${BOUTON} bg-neutral-900 text-white disabled:cursor-wait disabled:opacity-60`
export const CHAMP = 'min-h-11 w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-base'

/**
 * The failure of a step, under its form: the message in French, and, when the session ended, the way
 * to sign in again in another tab (what she typed stays in this one). It is a live region that is
 * always in the page, so that a screen reader announces the message when it appears.
 */
export function MessageDEchec({ message, sessionExpiree }: { message: string; sessionExpiree: boolean }) {
	return (
		<div role="alert">
			{message ? (
				<p className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
					{message}
					{sessionExpiree ? (
						<>
							{' '}
							<a
								className="font-medium underline"
								href={expiredSessionUrl(PAGE_DE_L_ACCUEIL)}
								target="_blank"
								rel="noopener"
							>
								Te reconnecter (nouvel onglet)
							</a>
							, puis reviens ici et enregistre à nouveau : ta saisie est toujours là.
						</>
					) : null}
				</p>
			) : null}
		</div>
	)
}

/** The frame of one step: its title (focused when the step opens) and its explanation. */
export function CadreDEtape({
	titre,
	explication,
	reference,
	children,
}: {
	titre: string
	explication: string
	reference: React.RefObject<HTMLHeadingElement | null>
	children: ReactNode
}) {
	return (
		<section aria-labelledby="accueil-titre-etape" className="flex flex-col gap-4">
			<div>
				<h2
					id="accueil-titre-etape"
					ref={reference}
					tabIndex={-1}
					className="font-semibold text-2xl focus-visible:outline-none"
				>
					{titre}
				</h2>
				<p className="text-neutral-700">{explication}</p>
			</div>
			{children}
		</section>
	)
}
