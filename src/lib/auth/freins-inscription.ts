import { creerFrein, type Frein } from './frein'

/**
 * The brakes of the sign-up and of the resending of the confirmation (tickets 083 and 084), each
 * with its own counters (`creerFrein` shares the counters of a name, never between names).
 *
 * By client address (`ipClient`):
 * - the sign-up: 5 a hour. What is counted is every attempt that got past the form's checks, taken
 *   address or new one alike, so that the count tells nothing about the account;
 * - the resending of the confirmation: 10 an hour;
 * - following the link of the confirmation mail: 30 an hour (ticket 084, which closes the note of
 *   ticket 082 on the page that wrote a journal row for every visit).
 *
 * By mailbox (the canonical form of the address, hashed: `cleDeBoite`), for every mail
 * the resending and the sign-up send to an address: 1 a minute and 5 a day. The sign-up of a NEW address
 * takes its place too (its result ignored: that mail always leaves), exactly as the « tu as déjà un
 * compte » mail of a taken one does, so a resend asked right after a sign-up reads the same answer
 * whether the address had an account or not. A mailbox that is not an account is counted like one.
 */

export const freinDInscription: Frein = creerFrein({ nom: 'inscription', limite: 5, fenetreMs: 60 * 60 * 1000 })

/** The rows of refusals the journal takes: 3 an hour for a client address and an outcome (`journaliserUnRefus`). */
export const freinDeJournal: Frein = creerFrein({ nom: 'journal-refus', limite: 3, fenetreMs: 60 * 60 * 1000 })

export const freinDeRenvoi: Frein = creerFrein({ nom: 'renvoi', limite: 10, fenetreMs: 60 * 60 * 1000 })

/** Following the link of the confirmation mail: 30 an hour per client address (a person follows it once). */
export const freinDeConfirmation: Frein = creerFrein({ nom: 'confirmation', limite: 30, fenetreMs: 60 * 60 * 1000 })

export const freinDeBoiteParMinute: Frein = creerFrein({
	nom: 'boite-minute',
	limite: 1,
	fenetreMs: 60 * 1000,
})

export const freinDeBoiteParJour: Frein = creerFrein({
	nom: 'boite-jour',
	limite: 5,
	fenetreMs: 24 * 60 * 60 * 1000,
})

export interface FreinsDeBoite {
	parMinute: Frein
	parJour: Frein
}

export const FREINS_DE_BOITE: FreinsDeBoite = { parMinute: freinDeBoiteParMinute, parJour: freinDeBoiteParJour }

export type DecisionDeBoite =
	| { autorise: true }
	| { autorise: false; raison: 'minute' | 'jour'; reessayerDansS: number }

/**
 * Takes a place for this mailbox in both brakes, or says which one refuses. A place taken in the
 * minute brake is given back when the day brake refuses: a refused mail is no mail.
 */
export function prendreUnMailPour(
	cle: string,
	freins: FreinsDeBoite = FREINS_DE_BOITE,
	maintenant = Date.now()
): DecisionDeBoite {
	const minute = freins.parMinute.prendre(cle, maintenant)
	if (!minute.autorise) return { autorise: false, raison: 'minute', reessayerDansS: minute.reessayerDansS }
	const jour = freins.parJour.prendre(cle, maintenant)
	if (!jour.autorise) {
		freins.parMinute.rendre(cle, maintenant)
		return { autorise: false, raison: 'jour', reessayerDansS: jour.reessayerDansS }
	}
	return { autorise: true }
}
