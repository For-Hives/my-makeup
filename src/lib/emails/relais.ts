/**
 * How the application talks to its mail relay (ticket 073). One place, read by src/payload.config.ts.
 *
 * - The mail catcher of the bench takes the mail as it is: no login, no encryption.
 * - A relay with a login is Resend on the site (smtp.resend.com, user « resend », a sending key as
 *   password): port 465 is encrypted from the first byte, any other port must upgrade to TLS before the
 *   login is sent, or the mail is not sent. The login never travels in the clear.
 */
import type { MailEnv } from '../env'

export type OptionsDeTransport = {
	host: string
	port: number
	secure: boolean
	requireTLS?: true
	auth?: { user: string; pass: string }
}

export function optionsDeTransport(mail: MailEnv): OptionsDeTransport {
	return {
		host: mail.host,
		port: mail.port,
		secure: mail.port === 465,
		...(mail.auth && { auth: mail.auth, requireTLS: true as const }),
	}
}
