/**
 * How the application talks to its mail relay (ticket 073). One place, read by src/payload.config.ts.
 *
 * - The mail catcher of the bench takes the mail as it is: no login, no encryption.
 * - A relay with a login is Resend on the site (smtp.resend.com, user « resend », a sending key as
 *   password): port 465 is encrypted from the first byte, any other port must upgrade to TLS before the
 *   login is sent, or the mail is not sent. The login never travels in the clear.
 */
import type { EmailAdapter } from 'payload'
import type { MailEnv } from '../env'

/**
 * How long the application waits for a relay before the mail is given up, in milliseconds.
 * nodemailer waits 30 s for the greeting, 2 min for the connection and 10 min on a silent socket: a form
 * request would time out behind the proxy long before the caller got its readable error.
 */
export const DELAI_DU_RELAIS_MS = 10_000

export type OptionsDeTransport = {
	host: string
	port: number
	secure: boolean
	requireTLS?: true
	auth?: { user: string; pass: string }
	connectionTimeout: number
	greetingTimeout: number
	socketTimeout: number
}

export function optionsDeTransport(mail: MailEnv): OptionsDeTransport {
	return {
		host: mail.host,
		port: mail.port,
		secure: mail.port === 465,
		connectionTimeout: DELAI_DU_RELAIS_MS,
		greetingTimeout: DELAI_DU_RELAIS_MS,
		socketTimeout: DELAI_DU_RELAIS_MS,
		...(mail.auth && { auth: mail.auth, requireTLS: true as const }),
	}
}

/**
 * What Payload sends its own mails through (verification, forgotten password) when no relay is set.
 * Payload's console adapter would log the recipient and the subject; this one writes a line with neither.
 */
export const adaptateurSansRelais: EmailAdapter = ({ payload }) => {
	return {
		name: 'sans-relais',
		defaultFromAddress: 'ne-pas-repondre@invalid',
		defaultFromName: 'My Makeup',
		sendEmail: async () => {
			payload.logger.warn('Un mail de Payload n’est pas parti : aucun relais n’est réglé.')
		},
	}
}
