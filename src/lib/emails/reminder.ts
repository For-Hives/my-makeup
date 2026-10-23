import { CONDITION_TEXTS, type MissingCondition } from '../reminders/rules'
import type { EmailContent } from './layout'

/**
 * The reminder to a makeup artist whose profile is one or two conditions from being published (issue 1006):
 * what it says. It leaves by the one door of the site (src/lib/emails/send.ts), and only when
 * REMINDERS_SEND is « on ».
 *
 * - The subject holds nothing of hers, and the text no name: it says what her page still needs.
 * - The tone is the one of her space (« tu »).
 * - The footer carries the unsubscribe link, in the open: one click, no sign-in.
 *
 * Pure: no `next` import, no Payload.
 */

export const REMINDER_SUBJECT = 'Il te manque peu de chose pour publier ton profil'

export function reminderEmailContent({
	missing,
	unsubscribeLink,
}: {
	missing: readonly MissingCondition[]
	unsubscribeLink: string
}): EmailContent {
	return {
		sujet: REMINDER_SUBJECT,
		titre: REMINDER_SUBJECT,
		paragraphes: [
			'Ton profil My Makeup est presque prêt à être publié. Pour que les clientes le trouvent, il lui manque :',
			...missing.map(condition => `- ${CONDITION_TEXTS[condition]}`),
			'Cela ne prend que quelques minutes depuis ton espace.',
		],
		action: { libelle: 'Compléter mon profil', chemin: '/auth/profil' },
		pied: `Tu ne veux plus recevoir ces rappels ? Ouvre ce lien, c’est immédiat : ${unsubscribeLink}`,
	}
}
