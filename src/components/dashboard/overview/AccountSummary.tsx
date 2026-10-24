import { SignOutButtons } from '@/components/auth/SignOutButtons'
import { type ActivityView, activitySentence } from '@/lib/dashboard/activity'
import { editBlockHref } from '@/lib/dashboard/edit-blocks'
import { CARD, EDIT_LINK, SECONDARY, TITLE } from './card'

/**
 * Her SIRET and the badge « Activité vérifiée » (issue 1073): where the check stands, for her eyes only. It is changed in
 * the block of the edit mode, which the link opens; nothing is typed here.
 */
export function ActivitySummary({ view }: { view: ActivityView }) {
	return (
		<section aria-labelledby="activite-titre" data-testid="activite" data-activity-state={view.state} className={CARD}>
			<h2 id="activite-titre" className={TITLE}>
				SIRET et « Activité vérifiée »
			</h2>
			{view.siret === null ? null : <p className="mt-2 font-medium">{view.siret}</p>}
			<p className={`mt-2 ${SECONDARY}`}>{activitySentence(view)}</p>
			<a className={`${EDIT_LINK} mt-2`} href={editBlockHref('siret')}>
				{view.siret === null ? 'Ajouter mon SIRET' : 'Modifier mon SIRET'}
			</a>
		</section>
	)
}

/** The way out of the space: this device, or every device after a confirmation (ticket 078). */
export function SignOutCard() {
	return (
		<section aria-labelledby="deconnexion-titre" className={CARD}>
			<h2 id="deconnexion-titre" className={TITLE}>
				Me déconnecter
			</h2>
			<div className="mt-3 flex">
				<SignOutButtons />
			</div>
		</section>
	)
}
