import type { EmailContent } from './layout'

/**
 * The mail that tells an account its password was changed from her space. It carries no password and no token: only
 * a way back, the page of the forgotten password, in case it was not her.
 * Pure: no `next` import, no Payload.
 */

export const PASSWORD_CHANGED_SUBJECT = 'Ton mot de passe My Makeup a changé'

export function passwordChangedEmailContent(): EmailContent {
	return {
		sujet: PASSWORD_CHANGED_SUBJECT,
		titre: 'Ton mot de passe a changé',
		paragraphes: [
			'Le mot de passe de ton compte My Makeup vient d’être changé depuis ton espace. Tes autres appareils ont été déconnectés.',
			'Si c’est toi, tu n’as rien à faire. Si ce n’est pas toi, choisis tout de suite un nouveau mot de passe avec le bouton ci-dessous, puis écris-nous depuis la page contact.',
		],
		action: { libelle: 'Choisir un nouveau mot de passe', chemin: '/auth/mot-de-passe-oublie' },
		pied: 'Cet email a été envoyé automatiquement par My Makeup pour ta sécurité.',
	}
}
