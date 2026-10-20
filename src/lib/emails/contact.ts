import type { MessageDeContact } from '../contact/message'
import type { ContenuEmail } from './layout'

/**
 * The mail of a contact message to the team (ticket 158): what it says. It leaves by the one door of
 * the site (src/lib/emails/envoi.ts), with the address the visitor typed as the address of the reply.
 *
 * - The subject is the one of the live site and holds nothing she typed (plan 02 U76).
 * - What she typed is text: the template escapes it for the HTML part, so a tag in her message stays
 *   text. Her message is cut into lines, one paragraph each, so that the HTML part keeps its line breaks.
 * - The footer says what the mail is, and that a reply goes to her.
 *
 * Pure: no `next` import, no Payload.
 */

export const SUJET_DU_CONTACT = 'Nouveau message de contact'

const PIED_DU_CONTACT =
	'Message envoyé par le formulaire de contact de My Makeup. Répondre à cet email répond à la personne qui l’a écrit.'

export function contenuEmailContact(message: MessageDeContact): ContenuEmail {
	return {
		sujet: SUJET_DU_CONTACT,
		titre: SUJET_DU_CONTACT,
		paragraphes: [
			`Nom : ${message.nom}`,
			`Prénom : ${message.prenom}`,
			`Email : ${message.email}`,
			`Numéro de téléphone : ${message.telephone}`,
			'Message :',
			...message.message.split(/\r\n|\r|\n/),
		],
		pied: PIED_DU_CONTACT,
	}
}
