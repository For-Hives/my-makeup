import { DraftNotice } from '@/components/dashboard/DraftNotice'
import { PageOnline } from '@/components/dashboard/PageOnline'
import type { DraftNotice as Notice } from '@/lib/dashboard/draft-notice'

const PRIMARY =
	'inline-flex min-h-11 items-center justify-center rounded-full border border-lipstick bg-lipstick px-6 font-semibold text-sm text-white focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2'
const SECONDARY =
	'inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-6 font-semibold text-ink text-sm focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2'

/**
 * The last screen of the onboarding (issue 1009), drawn from what the server reads of her stored profile:
 * - online: the card « Ta page est en ligne ! » of her space, her address in clear;
 * - not yet: the draft notice (« En brouillon »): her page is not online, what stands between her
 *   profile and a published page, and the button that leads to the block to complete. The presentation of
 *   200 characters is not a step of the onboarding, so it is the usual remainder; a skipped step is another.
 * The screen never says « en ligne » for a page the rule of a profile does not call publishable.
 */
export function OnboardingDone({
	online,
	address,
	notice,
	resume,
	editPath,
	dashboardPath,
}: {
	online: boolean
	/** Her public address in full; used when she is online. */
	address: string
	/** The draft notice: what she still lacks for a published page, and where to go (null when online). */
	notice: Notice | null
	/** True while the contact or the offer step is not done: the onboarding can pick it up. */
	resume: boolean
	editPath: string
	dashboardPath: string
}) {
	return (
		<div className="flex flex-col gap-6" data-testid="accueil-fin">
			<h1 className="font-display font-medium text-3xl text-ink sm:text-4xl">
				{online ? 'Bravo, ton profil est prêt' : 'Ton profil est presque prêt'}
			</h1>
			{online ? <PageOnline adresse={address} /> : notice === null ? null : <DraftNotice notice={notice} />}
			<div className="flex flex-col gap-3 sm:flex-row">
				{online || notice === null ? (
					<a href={editPath} className={PRIMARY}>
						{online ? 'Modifier ma page' : 'Compléter ma page'}
					</a>
				) : null}
				{!online && resume ? (
					<a href="/auth/init-account" className={SECONDARY}>
						Reprendre l’accueil
					</a>
				) : null}
				<a href={dashboardPath} className={SECONDARY}>
					Aller à mon espace
				</a>
			</div>
		</div>
	)
}
