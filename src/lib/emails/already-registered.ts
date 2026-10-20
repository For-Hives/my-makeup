import type { ContenuEmail } from './layout'

/**
 * The mail of an address that already has an account (ticket 083): what the real owner of the
 * mailbox reads when someone, maybe herself, signs up with it again. The page the visitor sees is
 * the same as for a new address; this mail is where the truth is told, to the one person who may
 * hear it. It holds no link to a confirmation and no token.
 *
 * Pure: no `next` import, no Payload.
 */

export const SUJET_DEJA_INSCRITE = 'Tu as déjà un compte My Makeup'

export function contenuEmailDejaInscrite(): ContenuEmail {
	return {
		sujet: SUJET_DEJA_INSCRITE,
		titre: 'Tu as déjà un compte My Makeup',
		paragraphes: [
			'Quelqu’un, peut-être toi, vient de s’inscrire sur My Makeup avec cette adresse email. Elle a déjà un compte : aucun second compte n’a été créé.',
			'Si c’est toi, connecte-toi comme d’habitude, par le moyen que tu avais choisi.',
			'Si ce n’est pas toi, tu peux ignorer ce message : ton compte n’a pas changé.',
		],
		action: { libelle: 'Me connecter', chemin: '/auth/signin' },
	}
}
