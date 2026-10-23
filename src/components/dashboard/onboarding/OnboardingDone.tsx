import { PageOnline } from '@/components/dashboard/PageOnline'
import type { Missing } from '@/lib/dashboard/progress'

const PRIMARY =
	'inline-flex min-h-11 items-center justify-center rounded-full border border-lipstick bg-lipstick px-6 font-semibold text-sm text-white focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2'
const SECONDARY =
	'inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-6 font-semibold text-ink text-sm focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2'

/**
 * The last screen of the onboarding (issue 1009), drawn from what the server reads of her stored profile:
 * - online: the card « Ta page est en ligne ! » of her space, her address in clear;
 * - not yet: what stands between her profile and a published page, in the words of her space, and the
 *   way to do it. The presentation of 200 characters is not a step of the onboarding, so it is the
 *   usual remainder; a skipped step is another.
 * The screen never says « en ligne » for a page the rule of a profile does not call publishable.
 */
export function OnboardingDone({
	online,
	address,
	missing,
	resume,
	editPath,
	dashboardPath,
}: {
	online: boolean
	/** Her public address in full; used when she is online. */
	address: string
	/** What she still lacks for a published page, required points only. */
	missing: readonly Missing[]
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
			{online ? (
				<PageOnline adresse={address} />
			) : (
				<section
					aria-labelledby="accueil-fin-manque"
					className="flex flex-col gap-4 rounded-card border border-hairline bg-white p-5 sm:p-7"
				>
					<h2 id="accueil-fin-manque" className="font-display font-medium text-2xl text-ink">
						Pas encore en ligne
					</h2>
					<p className="text-mute">Ta page n’est pas encore publiée. Il reste :</p>
					<ul className="flex list-disc flex-col gap-1 pl-5" data-testid="accueil-fin-manques">
						{missing.map(point => (
							<li key={point.critere}>{point.texte}</li>
						))}
					</ul>
				</section>
			)}
			<div className="flex flex-col gap-3 sm:flex-row">
				<a href={editPath} className={PRIMARY}>
					{online ? 'Modifier ma page' : 'Compléter ma page'}
				</a>
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
