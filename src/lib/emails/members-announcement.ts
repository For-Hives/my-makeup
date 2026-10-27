import { CONDITION_TEXTS, GOOGLE_TEXTS, type GoogleSuggestion, type MissingCondition } from '../reminders/rules'
import type { EmailContent } from './layout'

/**
 * The one mail to the members after the switch to the new site (issue 998): what changed, what to do if the
 * account came from Facebook, what her profile still lacks to be published (a photo, a city, a speciality, a way to reach her), what she could add to be better referenced on Google, and that the quotes come later.
 * It leaves by the one door of the site (src/lib/emails/send.ts), through `bun run members:mail` only.
 *
 * - The subject holds nothing of hers, and the text no name and nothing of another profile: the list is her
 *   own, drawn from the single rule of src/lib/profile/completeness.ts (`missing` comes from the plan).
 * - The tone is the one of her space (« tu »). No date is promised for the quotes.
 * - The footer carries the unsubscribe link of the reminders (issue 1006), in the open: one click, no sign-in.
 *
 * Pure: no `next` import, no Payload.
 */

export const MEMBERS_ANNOUNCEMENT_SUBJECT = 'Le nouveau My Makeup est en ligne'

export function membersAnnouncementContent({
	missing,
	forGoogle = [],
	unsubscribeLink,
}: {
	missing: readonly MissingCondition[]
	/** What she could add to be better referenced on Google: suggestions, said after the conditions. */
	forGoogle?: readonly GoogleSuggestion[]
	unsubscribeLink: string
}): EmailContent {
	return {
		sujet: MEMBERS_ANNOUNCEMENT_SUBJECT,
		titre: 'Du nouveau sur My Makeup',
		paragraphes: [
			'Bonjour, depuis le 22 octobre, My Makeup a un nouveau site. Voici ce qui change pour toi, en quelques lignes.',
			'Ton espace est maintenant ton profil : tu le vois comme les clientes le voient, et tu modifies directement ce que tu veux (ta photo, ta présentation, tes prestations, ta zone).',
			'Pour te connecter, utilise ton adresse email et ton mot de passe, ou Google. Les liens reçus par email (confirmation, mot de passe oublié) restent valables 24 heures.',
			'La connexion avec Facebook n’existe plus. Si tu passais par Facebook, ouvre la page de connexion et clique sur « Mot de passe oublié » pour choisir un mot de passe, ou connecte-toi avec Google si c’est la même adresse email.',
			...(missing.length > 0
				? [
						'Pour que ton profil soit publié et que les clientes le trouvent, il manque encore à ton profil :',
						...missing.map(condition => `- ${CONDITION_TEXTS[condition]}`),
						'Cela ne prend que quelques minutes depuis ton espace.',
					]
				: [
						'Bonne nouvelle : ton profil a tout ce qu’il faut pour être publié. Tu peux toujours l’enrichir depuis ton espace.',
					]),
			...(forGoogle.length > 0
				? [
						'Pour être mieux référencée sur Google, tu peux aussi ajouter (c’est facultatif) :',
						...forGoogle.map(suggestion => `- ${GOOGLE_TEXTS[suggestion]}`),
					]
				: []),
			'Les demandes de devis par le site arriveront dans un second temps. Nous te préviendrons.',
			'Une question, un souci de connexion ? Écris-nous depuis la page Contact du site.',
		],
		action: { libelle: 'Ouvrir mon espace', chemin: '/auth/profil' },
		pied: `Tu ne veux plus recevoir ces courriels d’information ni nos rappels ? Ouvre ce lien, c’est immédiat : ${unsubscribeLink}`,
	}
}
