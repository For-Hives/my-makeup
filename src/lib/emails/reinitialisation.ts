import type { ContenuEmail } from './gabarit'

/**
 * The mail of a forgotten password (ticket 085): what it says, and where its button leads.
 * Payload sends it itself when the request is made (src/collections/Pros.ts), with this content.
 *
 * The link carries the token, so the path is built here and nowhere else. It opens
 * `/auth/reinitialiser`, which keeps the token out of the address (src/proxy.ts).
 * Pure: no `next` import, no Payload.
 */

export const SUJET_DE_REINITIALISATION = 'Réinitialise ton mot de passe My Makeup'

export function contenuEmailReinitialisation(jeton: string): ContenuEmail {
	return {
		sujet: SUJET_DE_REINITIALISATION,
		titre: 'Choisis un nouveau mot de passe',
		paragraphes: [
			'Tu as demandé à changer ton mot de passe My Makeup. Clique sur le bouton pour en choisir un nouveau.',
			'Ce lien est valable une heure et ne sert qu’une fois. Si tu n’as rien demandé, ignore cet email : ton mot de passe ne change pas.',
		],
		action: {
			libelle: 'Choisir un nouveau mot de passe',
			chemin: `/auth/reinitialiser?code=${encodeURIComponent(jeton)}`,
		},
	}
}
