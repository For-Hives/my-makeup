import type { Payload } from 'payload'
import { z } from 'zod'
import { contenuEmailConfirmation } from '../emails/confirmation'
import { contenuEmailDejaInscrite } from '../emails/deja-inscrite'
import type { EnvoyerEmail } from '../emails/envoi'
import { composerEmail } from '../emails/gabarit'
import { findAccount } from './account-by-email'
import type { EventCode, Log } from './auth-log'
import { mailboxKey } from './canonical-email'
import { EMAIL_MAX, SIGN_UP_MESSAGES } from './sign-up'
import { SIGN_UP_FLOOR_MS, waitUntil } from './sign-up-payload'
import { MAILBOX_RATE_LIMITS, type MailboxRateLimits, takeMailFor } from './sign-up-rate-limits'

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
 *   nothing about the account. The brake by client address is the caller's (`resendRateLimit`).
 * - The answer leaves no sooner than the floor of the sign-up, whatever was sent.
 *
 * No `next` import.
 */

export type ResendResult =
	| { ok: true }
	| { ok: false; code: 'email-invalide'; message: string }
	| { ok: false; code: 'trop-de-renvois'; raison: 'minute' | 'jour'; reessayerDansS: number }
	| { ok: false; code: 'email-non-envoye' }

export const RESEND_MESSAGES = {
	ok: 'Si un compte attend d’être confirmé avec cette adresse, un email vient de repartir. Regarde aussi dans tes spams.',
	minute: 'Un seul email par minute : attends un instant avant d’en demander un autre.',
	jour: 'Tu as déjà demandé 5 emails aujourd’hui. Réessaie demain, ou écris-nous si rien n’arrive.',
	'trop-de-tentatives': 'Trop de demandes depuis cette adresse. Réessaie un peu plus tard, dans une heure au plus.',
	'email-non-envoye': 'L’email n’a pas pu partir. Réessaie dans un instant.',
} as const

const schemaEmail = z
	.string()
	.trim()
	.min(1, SIGN_UP_MESSAGES.email.vide)
	.max(EMAIL_MAX, SIGN_UP_MESSAGES.email.long)
	.pipe(z.email(SIGN_UP_MESSAGES.email.invalide))

export interface ResendInputs {
	payload: Payload
	email: unknown
	envoyer: EnvoyerEmail
	site: string
	journal?: Log
	plancherMs?: number
	freins?: MailboxRateLimits
}

export async function resendConfirmation({
	payload,
	email,
	envoyer,
	site,
	journal,
	plancherMs = SIGN_UP_FLOOR_MS,
	freins = MAILBOX_RATE_LIMITS,
}: ResendInputs): Promise<ResendResult> {
	const start = Date.now()
	const record = async (code: EventCode) => {
		try {
			await journal?.({ type: 'resend', code, durationMs: Date.now() - start })
		} catch {
			// The journal is not the resending's to fail.
		}
	}
	const read = schemaEmail.safeParse(typeof email === 'string' ? email : '')
	if (!read.success) {
		await record('donnees-invalides')
		return {
			ok: false,
			code: 'email-invalide',
			message: read.error.issues[0]?.message ?? SIGN_UP_MESSAGES.email.invalide,
		}
	}
	const address = read.data.toLowerCase()

	const place = takeMailFor(mailboxKey(address), freins)
	if (!place.autorise) {
		await record('trop-de-tentatives')
		return { ok: false, code: 'trop-de-renvois', raison: place.raison, reessayerDansS: place.reessayerDansS }
	}

	const result = await sendMail(address)
	await record(result.ok ? 'ok' : 'service-indisponible')
	await waitUntil(start + plancherMs)
	return result

	async function sendMail(destinataire: string): Promise<ResendResult> {
		try {
			const account = await findAccount(payload, destinataire)
			if (!account) return { ok: true }
			const content =
				!account.verifie && account.jeton ? contenuEmailConfirmation(account.jeton) : contenuEmailDejaInscrite()
			await envoyer({ a: account.email, ...composerEmail(content, site) })
			return { ok: true }
		} catch {
			return { ok: false, code: 'email-non-envoye' }
		}
	}
}
