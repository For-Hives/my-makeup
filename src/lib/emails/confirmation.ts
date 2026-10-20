import type { ContenuEmail } from './layout'

/**
 * The confirmation mail of a new account (ticket 082): what it says, and where its button leads.
 * One text for both ways a mail can leave: the sign-up of the site, which sends it through the door
 * of ticket 073, and the account an admin creates in the panel, which Payload sends itself with
 * this same content (src/collections/Pros.ts).
 *
 * The link carries the token of the account, so the path is built here and nowhere else.
 * Pure: no `next` import, no Payload.
 */

/** The page the link of the mail opens: it confirms the account, then offers to sign in. */
export const PAGE_DE_CONFIRMATION = '/auth/verification-complete'

export const SUJET_DE_CONFIRMATION = 'Confirme ton adresse email pour activer ton compte My Makeup'

export function contenuEmailConfirmation(jeton: string): ContenuEmail {
	return {
		sujet: SUJET_DE_CONFIRMATION,
		titre: 'Bienvenue sur My Makeup',
		paragraphes: [
			'Plus qu’un clic pour activer ton compte : confirme que cette adresse email est bien la tienne.',
			'Une fois confirmée, tu pourras te connecter et remplir ton profil.',
		],
		action: { libelle: 'Confirmer mon adresse', chemin: `${PAGE_DE_CONFIRMATION}?code=${encodeURIComponent(jeton)}` },
	}
}
