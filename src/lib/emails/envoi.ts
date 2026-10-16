/**
 * The one door every email of the application leaves through (ticket 073). A feature that sends a
 * mail receives `EnvoyerEmail` as a dependency; a test hands it a double, or the real one wired to
 * the mail catcher of the bench.
 *
 *   const envoyer = envoiEmailDePayload(payload, env)
 *   await envoyer({ a: adresse, ...composerEmail(contenu, site) }, { context: req.context })
 *
 * - The import of the old data sends nothing: a write that carries its context (`estUnImport`) leaves
 *   before anything is read or written.
 * - Without a relay (no SMTP_HOST: a work station), the mail is not sent, one line of the log says
 *   so, and the door gives back `AUCUN_RELAIS`. The site never gets there: its environment is refused without a relay (src/lib/env.ts).
 * - A failure reaches the caller as an `EnvoiEmailEchoue`, a sentence that can be shown. The log gets
 *   one line with the kind of failure; no address, no subject, no link and no token is ever written
 *   there, and the error of the relay (which names the address) is not kept.
 *
 * No `next` import: the scripts and the tests load this file too.
 */
import type { Payload, RequestContext } from 'payload'
import { estUnImport } from '../contexte-import'
import type { ServerEnv } from '../env'
import { EmailInvalide, exigerUneLigne } from './gabarit'

/** A mail ready to leave: the output of `composerEmail`, and the one address it goes to. */
export type EmailAEnvoyer = {
	/** The recipient. One address, whole. */
	a: string
	sujet: string
	texte: string
	html: string
	/** Where a reply goes, when it must not go to the sender (the contact form, ticket 158). One address, whole. */
	repondreA?: string
}

export type OptionsDEnvoi = {
	/** The context of the request that causes the mail. An import (`CONTEXTE_IMPORT`) sends nothing. */
	context?: RequestContext | undefined
}

/**
 * The door: sends the mail, or rejects with an `EnvoiEmailEchoue`. Resolves without sending for an import
 * (nothing), and for a work station without a relay (`AUCUN_RELAIS`): a caller that tells somebody that a
 * mail left (the contact message, ticket 224) must tell these two apart from a mail that went.
 */
export type EnvoyerEmail = (email: EmailAEnvoyer, options?: OptionsDEnvoi) => Promise<void | typeof AUCUN_RELAIS>

/** What the door gives back when no relay is set: the mail did not leave, and nothing failed. */
export const AUCUN_RELAIS = 'aucun-relais'

/** What the relay is asked to send. */
export type MessageDuRelais = { to: string; subject: string; text: string; html: string; replyTo?: string }

/** The relay: Payload's mail adapter on the site and on the bench. */
export type Relais = (message: MessageDuRelais) => Promise<unknown>

/** The mail did not leave. The message is meant for the caller to show; it holds no address and no link. */
export class EnvoiEmailEchoue extends Error {
	constructor() {
		super('L’email n’a pas pu partir : le service d’envoi ne répond pas. Réessaie dans un instant.')
		this.name = 'EnvoiEmailEchoue'
	}
}

/** The three lines the door writes, and nothing else. */
export type Journal = {
	info: (ligne: string) => void
	erreur: (ligne: string) => void
}

const ADRESSE = /^[^<>"\s@\p{Cc}]+@[^<>"\s@\p{Cc}]+\.[^<>"\s@\p{Cc}]+$/u

/** The kind of failure, in a word: what a log may keep of an error that names an address. */
function natureDeLEchec(erreur: unknown): string {
	if (typeof erreur === 'object' && erreur !== null && 'code' in erreur && typeof erreur.code === 'string') {
		const code = erreur.code
		if (/^[A-Z_]{3,30}$/.test(code)) return code
	}
	return 'inconnue'
}

export function creerEnvoiEmail({ relais, journal }: { relais: Relais | undefined; journal: Journal }): EnvoyerEmail {
	return async (email, options = {}) => {
		if (estUnImport(options.context)) return

		// A malformed mail is a bug of the caller, not a failure of the relay: it is thrown as it is.
		if (!ADRESSE.test(email.a)) throw new EmailInvalide('L’adresse du destinataire est illisible.')
		const sujet = exigerUneLigne(email.sujet, 'Le sujet')
		// The address of a reply is typed by a visitor: it is checked like the recipient, and refused if it could write a header.
		if (email.repondreA !== undefined && !ADRESSE.test(email.repondreA))
			throw new EmailInvalide('L’adresse de réponse est illisible.')

		if (!relais) {
			journal.info('Aucun relais d’envoi n’est réglé (SMTP_HOST) : l’email n’est pas parti.')
			return AUCUN_RELAIS
		}
		try {
			await relais({
				to: email.a,
				subject: sujet,
				text: email.texte,
				html: email.html,
				...(email.repondreA !== undefined && { replyTo: email.repondreA }),
			})
		} catch (erreur) {
			journal.erreur(`Un email n’est pas parti (nature : ${natureDeLEchec(erreur)}).`)
			throw new EnvoiEmailEchoue()
		}
	}
}

/** The door wired to a Payload instance: its mail adapter is the relay the environment names. */
export function envoiEmailDePayload(
	payload: Pick<Payload, 'logger' | 'sendEmail'>,
	env: Pick<ServerEnv, 'mail'>
): EnvoyerEmail {
	return creerEnvoiEmail({
		relais: env.mail ? message => payload.sendEmail(message) : undefined,
		journal: {
			info: ligne => payload.logger.info({ msg: ligne }),
			erreur: ligne => payload.logger.error({ msg: ligne }),
		},
	})
}
