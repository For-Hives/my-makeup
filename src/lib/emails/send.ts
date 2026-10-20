/**
 * The one door every email of the application leaves through (ticket 073). A feature that sends a
 * mail receives `SendEmail` as a dependency; a test hands it a double, or the real one wired to
 * the mail catcher of the bench.
 *
 *   const envoyer = payloadSendEmail(payload, env)
 *   await envoyer({ a: adresse, ...composerEmail(contenu, site) }, { context: req.context })
 *
 * - The import of the old data sends nothing: a write that carries its context (`estUnImport`) leaves
 *   before anything is read or written.
 * - Without a relay (no SMTP_HOST: a work station), the mail is not sent, one line of the log says
 *   so, and the door gives back `NO_RELAY`. The site never gets there: its environment is refused without a relay (src/lib/env.ts).
 * - A failure reaches the caller as an `EmailSendFailed`, a sentence that can be shown. The log gets
 *   one line with the kind of failure; no address, no subject, no link and no token is ever written
 *   there, and the error of the relay (which names the address) is not kept.
 *
 * No `next` import: the scripts and the tests load this file too.
 */
import type { Payload, RequestContext } from 'payload'
import { estUnImport } from '../contexte-import'
import type { ServerEnv } from '../env'
import { InvalidEmail, requireOneLine } from './layout'

/** A mail ready to leave: the output of `composerEmail`, and the one address it goes to. */
export type EmailToSend = {
	/** The recipient. One address, whole. */
	a: string
	sujet: string
	texte: string
	html: string
	/** Where a reply goes, when it must not go to the sender (the contact form, ticket 158). One address, whole. */
	repondreA?: string
}

export type SendOptions = {
	/** The context of the request that causes the mail. An import (`CONTEXTE_IMPORT`) sends nothing. */
	context?: RequestContext | undefined
}

/**
 * The door: sends the mail, or rejects with an `EmailSendFailed`. Resolves without sending for an import
 * (nothing), and for a work station without a relay (`NO_RELAY`): a caller that tells somebody that a
 * mail left (the contact message, ticket 224) must tell these two apart from a mail that went.
 */
export type SendEmail = (email: EmailToSend, options?: SendOptions) => Promise<void | typeof NO_RELAY>

/** What the door gives back when no relay is set: the mail did not leave, and nothing failed. */
export const NO_RELAY = 'aucun-relais'

/** What the relay is asked to send. */
export type RelayMessage = { to: string; subject: string; text: string; html: string; replyTo?: string }

/** The relay: Payload's mail adapter on the site and on the bench. */
export type Relay = (message: RelayMessage) => Promise<unknown>

/** The mail did not leave. The message is meant for the caller to show; it holds no address and no link. */
export class EmailSendFailed extends Error {
	constructor() {
		super('L’email n’a pas pu partir : le service d’envoi ne répond pas. Réessaie dans un instant.')
		this.name = 'EnvoiEmailEchoue'
	}
}

/** The three lines the door writes, and nothing else. */
export type Log = {
	info: (ligne: string) => void
	erreur: (ligne: string) => void
}

const ADDRESS = /^[^<>"\s@\p{Cc}]+@[^<>"\s@\p{Cc}]+\.[^<>"\s@\p{Cc}]+$/u

/** The kind of failure, in a word: what a log may keep of an error that names an address. */
function failureKind(erreur: unknown): string {
	if (typeof erreur === 'object' && erreur !== null && 'code' in erreur && typeof erreur.code === 'string') {
		const code = erreur.code
		if (/^[A-Z_]{3,30}$/.test(code)) return code
	}
	return 'inconnue'
}

export function createSendEmail({ relais, journal }: { relais: Relay | undefined; journal: Log }): SendEmail {
	return async (email, options = {}) => {
		if (estUnImport(options.context)) return

		// A malformed mail is a bug of the caller, not a failure of the relay: it is thrown as it is.
		if (!ADDRESS.test(email.a)) throw new InvalidEmail('L’adresse du destinataire est illisible.')
		const subject = requireOneLine(email.sujet, 'Le sujet')
		// The address of a reply is typed by a visitor: it is checked like the recipient, and refused if it could write a header.
		if (email.repondreA !== undefined && !ADDRESS.test(email.repondreA))
			throw new InvalidEmail('L’adresse de réponse est illisible.')

		if (!relais) {
			journal.info('Aucun relais d’envoi n’est réglé (SMTP_HOST) : l’email n’est pas parti.')
			return NO_RELAY
		}
		try {
			await relais({
				to: email.a,
				subject: subject,
				text: email.texte,
				html: email.html,
				...(email.repondreA !== undefined && { replyTo: email.repondreA }),
			})
		} catch (error) {
			journal.erreur(`Un email n’est pas parti (nature : ${failureKind(error)}).`)
			throw new EmailSendFailed()
		}
	}
}

/** The door wired to a Payload instance: its mail adapter is the relay the environment names. */
export function payloadSendEmail(
	payload: Pick<Payload, 'logger' | 'sendEmail'>,
	env: Pick<ServerEnv, 'mail'>
): SendEmail {
	return createSendEmail({
		relais: env.mail ? message => payload.sendEmail(message) : undefined,
		journal: {
			info: ligne => payload.logger.info({ msg: ligne }),
			erreur: ligne => payload.logger.error({ msg: ligne }),
		},
	})
}
