import { MAIL_LINK_WINDOW_WORDS } from '../auth/mail-link-window'
import type { EmailContent } from './layout'

/**
 * The mail of a forgotten password (ticket 085): what it says, and where its button leads.
 * The request sends it by the one door of the site (src/lib/auth/password-reset-payload.ts), with this content.
 *
 * The link carries the token, so the path is built here and nowhere else. It opens
 * `/auth/reinitialiser`, which keeps the token out of the address (src/proxy.ts).
 * Pure: no `next` import, no Payload.
 */

export const PASSWORD_RESET_SUBJECT = 'Réinitialise ton mot de passe My Makeup'

export function passwordResetEmailContent(jeton: string): EmailContent {
	return {
		sujet: PASSWORD_RESET_SUBJECT,
		titre: 'Choisis un nouveau mot de passe',
		paragraphes: [
			'Tu as demandé à changer ton mot de passe My Makeup. Clique sur le bouton pour en choisir un nouveau.',
			`Ce lien est valable ${MAIL_LINK_WINDOW_WORDS} et ne sert qu’une fois. Si tu n’as rien demandé, ignore cet email : ton mot de passe ne change pas.`,
		],
		action: {
			libelle: 'Choisir un nouveau mot de passe',
			chemin: `/auth/reinitialiser?code=${encodeURIComponent(jeton)}`,
		},
	}
}
