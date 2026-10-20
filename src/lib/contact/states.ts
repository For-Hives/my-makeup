/**
 * The closed lists of a contact message (tickets 158 and 159), shared by the collection `contact-requests`
 * and the server code that writes it. Pure.
 *
 * `status` follows the message: `new` when it is stored, `forwarded` once the mail to the team
 * has left, `answered` once an admin has answered, `spam` when an admin says it is not a real message
 * (ticket 163; plan 02 U78, reduced to the contact message: `conclue` and `perdue` belong to the
 * requests to a makeup artist, which have no ticket yet).
 * `mailStatus` says where the mail stands, apart from the message: `pending` while it is sent,
 * `sent`, or `failed` when the relay did not take it (the message stays, an admin can see it).
 */

export const TYPES_DE_DEMANDE = ['contact'] as const
export type TypeDeDemande = (typeof TYPES_DE_DEMANDE)[number]

export const STATUTS_DE_DEMANDE = ['new', 'forwarded', 'answered', 'spam'] as const
export type StatutDeDemande = (typeof STATUTS_DE_DEMANDE)[number]

/**
 * The cycle of a contact message: `new` → `forwarded` → `answered`, and `spam` from any of them.
 * The server moves `new` to `forwarded` when the mail has left; an admin moves the others.
 * An admin may answer a message whose mail failed (`new` → `answered`: she read it in the panel),
 * and may take a message back out of `spam` (it returns to `new`, the mail state tells the rest).
 * Going back from `answered` to `forwarded` is not allowed: an answer is not undone.
 */
const SUIVANTS: Record<StatutDeDemande, readonly StatutDeDemande[]> = {
	new: ['forwarded', 'answered', 'spam'],
	forwarded: ['answered', 'spam'],
	answered: ['spam'],
	spam: ['new'],
}

/** True when a message may go from `de` to `vers`. Staying where it is is always allowed. */
export function transitionPermise(de: StatutDeDemande, vers: StatutDeDemande): boolean {
	return de === vers || SUIVANTS[de].includes(vers)
}

/** A string that is one of the statuses, or nothing. */
export function estUnStatutDeDemande(valeur: unknown): valeur is StatutDeDemande {
	return typeof valeur === 'string' && (STATUTS_DE_DEMANDE as readonly string[]).includes(valeur)
}

export const ETATS_DU_MAIL = ['pending', 'sent', 'failed'] as const
export type EtatDuMail = (typeof ETATS_DU_MAIL)[number]
