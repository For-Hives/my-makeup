import type { Payload } from 'payload'
import { z } from 'zod'
import { contenuEmailConfirmation } from '../emails/confirmation'
import { contenuEmailDejaInscrite } from '../emails/deja-inscrite'
import type { EnvoyerEmail } from '../emails/envoi'
import { composerEmail } from '../emails/gabarit'
import { trouverLeCompte } from './compte-par-email'
import { cleDeBoite } from './email-canonique'
import { FREINS_DE_BOITE, type FreinsDeBoite, prendreUnMailPour } from './freins-inscription'
import { EMAIL_MAX, MESSAGES_INSCRIPTION } from './inscription'
import { attendreJusqua, PLANCHER_INSCRIPTION_MS } from './inscription-payload'
import type { CodeEvenement, Journaliser } from './journal'

/**
 * The resending of the confirmation mail, from the wall of verification (ticket 083; plan 02 E04).
 *
 * The answer is the same for an address with an unconfirmed account, with a confirmed one and with
 * no account at all: « si un compte attend, un email est reparti ». Only the mail differs, and
 * only its real owner reads it.
 *
 * - An unconfirmed account gets its confirmation link again (the very token of the sign-up: a
 *   link already followed has none left, and the account is then confirmed anyway).
 * - A confirmed account gets the « tu as déjà un compte » mail. An address with no account gets
 *   nothing.
 * - One mail a minute and 5 a day for a mailbox (the canonical form: the Gmail variants of an
 *   address are one mailbox), counted for every address, known or not, so that a refusal says
 *   nothing about the account. The brake by client address is the caller's (`freinDeRenvoi`).
 * - The answer leaves no sooner than the floor of the sign-up, whatever was sent.
 *
 * No `next` import.
 */

export type ResultatDeRenvoi =
	| { ok: true }
	| { ok: false; code: 'email-invalide'; message: string }
	| { ok: false; code: 'trop-de-renvois'; raison: 'minute' | 'jour'; reessayerDansS: number }
	| { ok: false; code: 'email-non-envoye' }

export const MESSAGES_RENVOI = {
	ok: 'Si un compte attend d’être confirmé avec cette adresse, un email vient de repartir. Regarde aussi dans tes spams.',
	minute: 'Un seul email par minute : attends un instant avant d’en demander un autre.',
	jour: 'Tu as déjà demandé 5 emails aujourd’hui. Réessaie demain, ou écris-nous si rien n’arrive.',
	'trop-de-tentatives': 'Trop de demandes depuis cette adresse. Réessaie un peu plus tard, dans une heure au plus.',
	'email-non-envoye': 'L’email n’a pas pu partir. Réessaie dans un instant.',
} as const

const schemaEmail = z
	.string()
	.trim()
	.min(1, MESSAGES_INSCRIPTION.email.vide)
	.max(EMAIL_MAX, MESSAGES_INSCRIPTION.email.long)
	.pipe(z.email(MESSAGES_INSCRIPTION.email.invalide))

export interface EntreesDeRenvoi {
	payload: Payload
	email: unknown
	envoyer: EnvoyerEmail
	site: string
	journal?: Journaliser
	plancherMs?: number
	freins?: FreinsDeBoite
}

export async function renvoyerLaConfirmation({
	payload,
	email,
	envoyer,
	site,
	journal,
	plancherMs = PLANCHER_INSCRIPTION_MS,
	freins = FREINS_DE_BOITE,
}: EntreesDeRenvoi): Promise<ResultatDeRenvoi> {
	const debut = Date.now()
	const noter = async (code: CodeEvenement) => {
		try {
			await journal?.({ type: 'renvoi', code, dureeMs: Date.now() - debut })
		} catch {
			// The journal is not the resending's to fail.
		}
	}
	const lecture = schemaEmail.safeParse(typeof email === 'string' ? email : '')
	if (!lecture.success) {
		await noter('donnees-invalides')
		return {
			ok: false,
			code: 'email-invalide',
			message: lecture.error.issues[0]?.message ?? MESSAGES_INSCRIPTION.email.invalide,
		}
	}
	const adresse = lecture.data.toLowerCase()

	const place = prendreUnMailPour(cleDeBoite(adresse), freins)
	if (!place.autorise) {
		await noter('trop-de-tentatives')
		return { ok: false, code: 'trop-de-renvois', raison: place.raison, reessayerDansS: place.reessayerDansS }
	}

	const resultat = await envoyerLeMail(adresse)
	await noter(resultat.ok ? 'ok' : 'service-indisponible')
	await attendreJusqua(debut + plancherMs)
	return resultat

	async function envoyerLeMail(destinataire: string): Promise<ResultatDeRenvoi> {
		try {
			const compte = await trouverLeCompte(payload, destinataire)
			if (!compte) return { ok: true }
			const contenu =
				!compte.verifie && compte.jeton ? contenuEmailConfirmation(compte.jeton) : contenuEmailDejaInscrite()
			await envoyer({ a: compte.email, ...composerEmail(contenu, site) })
			return { ok: true }
		} catch {
			return { ok: false, code: 'email-non-envoye' }
		}
	}
}
