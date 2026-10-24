import type { CheckRow } from '../activity/store'
import { formatSiret } from '../legal'
import { longDate } from './contact-details'

/**
 * What her space says of the check of her SIRET (issue 1004): the number she gave (for her eyes only, on her own
 * page) and where the check stands. Plain data, so that the page hands it to the browser.
 */
export type ActivityState = 'none' | 'pending' | 'active' | 'ceased' | 'not-found'

export interface ActivityView {
	/** The SIRET printed the usual way, or `null` without one. */
	siret: string | null
	state: ActivityState
	/** « 20 octobre 2026 »: the day of the last answer read, or `null`. */
	checkedOn: string | null
}

/**
 * The view from the SIRET stored and the row of the cache. A row is only trusted when she holds a SIRET: the
 * profile resets it at each change, so the row belongs to this number.
 */
export function activityView(siret: string | null | undefined, row: CheckRow | null): ActivityView {
	if (typeof siret !== 'string' || !/^\d{14}$/.test(siret)) return { siret: null, state: 'none', checkedOn: null }
	return { siret: formatSiret(siret), state: row?.outcome ?? 'pending', checkedOn: longDate(row?.checkedAt) }
}

const BADGE_LABEL = 'Activité vérifiée'

/**
 * Where the check of her SIRET stands, told to her in a sentence (the summary of her space, issue 1073; the block of the edit
 * mode says the same words: tests/unit/direct-edit-siret.test.tsx keeps the two together).
 */
export function activitySentence(view: ActivityView): string {
	switch (view.state) {
		case 'pending':
			return 'Ton SIRET est enregistré. Le contrôle a lieu dans la journée qui suit : le badge apparaît dès que l’annuaire public confirme ton activité.'
		case 'active':
			return view.checkedOn
				? `Le badge « ${BADGE_LABEL} » s’affiche sur ta page. Dernier contrôle : le ${view.checkedOn}.`
				: `Le badge « ${BADGE_LABEL} » s’affiche sur ta page.`
		case 'ceased':
			return 'L’annuaire public indique que cette activité est cessée : le badge ne s’affiche pas. Si ce n’est pas le bon numéro, remplace-le.'
		case 'not-found':
			return 'Ce SIRET est introuvable dans l’annuaire public : le badge ne s’affiche pas. Vérifie ton numéro et corrige-le au besoin ; un nouveau numéro relance le contrôle.'
		default:
			return 'Facultatif : avec ton SIRET, un contrôle quotidien peut afficher le badge « Activité vérifiée » sur ta page.'
	}
}
