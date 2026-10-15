import { cleDeBoite } from '../auth/email-canonique'
import { creerFrein, type Frein } from '../auth/frein'
import { estUneAdresseLocale } from '../recherche/frein'

/**
 * The brakes of the contact form (ticket 161; plan 02 U77), the protection kept for the switch-over,
 * without any third-party service. Two counters, each with its own name (`creerFrein`):
 * - by client address (`ipClient`): 5 messages an hour;
 * - by mailbox (the hashed canonical form, `cleDeBoite`): 20 messages a day, whatever the address
 *   they come from.
 *
 * What is counted is every message that got past the checks of the form, as the sign-up does. A
 * message the checks refuse costs nothing, and neither does the trap field (no row, no mail, no place).
 *
 * The address brake is also read by the proxy (`secondesAvantUnMessage`), which answers a real 429:
 * a Server Action cannot choose its status. The mailbox brake lives in the action alone: the proxy does
 * not read the body of a request, so that refusal is a state of the form, not a status.
 *
 * A request that did not come through the proxy of the site (no `X-Forwarded-For`, or a loopback
 * address: development, the bench) is never counted by address, as for the search.
 *
 * No `next` import: read by the proxy, the action and the tests.
 */

export const MESSAGES_PAR_HEURE_ET_ADRESSE = 5
export const MESSAGES_PAR_JOUR_ET_EMAIL = 20

/** The path of the contact page: a Server Action is posted to the page that holds its form. */
export const CHEMIN_DU_CONTACT = '/contact'
/** The path the proxy sends a refused message to. */
export const CHEMIN_DU_REFUS_DE_CONTACT = '/contact/refus'

export const freinDeContactParAdresse: Frein = creerFrein({
	nom: 'contact-adresse',
	limite: MESSAGES_PAR_HEURE_ET_ADRESSE,
	fenetreMs: 60 * 60 * 1000,
})

export const freinDeContactParEmail: Frein = creerFrein({
	nom: 'contact-email',
	limite: MESSAGES_PAR_JOUR_ET_EMAIL,
	fenetreMs: 24 * 60 * 60 * 1000,
})

export interface FreinsDeContact {
	parAdresse: Frein
	parEmail: Frein
}

export const FREINS_DE_CONTACT: FreinsDeContact = {
	parAdresse: freinDeContactParAdresse,
	parEmail: freinDeContactParEmail,
}

/** Two brakes with the same numbers and counters of their own (named after `nom`): for a test that must not share the process's. */
export function creerFreinsDeContact(nom: string): FreinsDeContact {
	return {
		parAdresse: creerFrein({
			nom: `contact-adresse-${nom}`,
			limite: MESSAGES_PAR_HEURE_ET_ADRESSE,
			fenetreMs: 60 * 60 * 1000,
		}),
		parEmail: creerFrein({
			nom: `contact-email-${nom}`,
			limite: MESSAGES_PAR_JOUR_ET_EMAIL,
			fenetreMs: 24 * 60 * 60 * 1000,
		}),
	}
}

export type DecisionDeContact =
	| { autorise: true }
	| { autorise: false; raison: 'adresse' | 'email'; reessayerDansS: number }

/**
 * Takes a place for this message in both brakes, or says which one refuses. The place taken by address
 * is given back when the mailbox refuses: a refused message is no message.
 */
export function prendreUnePlaceDeContact(
	client: string,
	email: string,
	freins: FreinsDeContact = FREINS_DE_CONTACT,
	maintenant = Date.now()
): DecisionDeContact {
	const compteLAdresse = !estUneAdresseLocale(client)
	if (compteLAdresse) {
		const adresse = freins.parAdresse.prendre(client, maintenant)
		if (!adresse.autorise) return { autorise: false, raison: 'adresse', reessayerDansS: adresse.reessayerDansS }
	}
	const boite = freins.parEmail.prendre(cleDeBoite(email), maintenant)
	if (!boite.autorise) {
		if (compteLAdresse) freins.parAdresse.rendre(client, maintenant)
		return { autorise: false, raison: 'email', reessayerDansS: boite.reessayerDansS }
	}
	return { autorise: true }
}

/** Seconds before this client address may send again, or `undefined` when it may. Reads, takes nothing. */
export function secondesAvantUnMessage(
	client: string,
	freins: FreinsDeContact = FREINS_DE_CONTACT,
	maintenant = Date.now()
): number | undefined {
	if (estUneAdresseLocale(client)) return undefined
	const decision = freins.parAdresse.prendre(client, maintenant)
	if (decision.autorise) {
		freins.parAdresse.rendre(client, maintenant)
		return undefined
	}
	return decision.reessayerDansS
}
