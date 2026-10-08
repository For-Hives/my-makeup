/**
 * The /api/sendMail route (contact form, MES-11): picks the provider, checks
 * the message, sends it and logs the outcome. Resend when RESEND_API_KEY is
 * set, else Mailgun as before (MAILGUN_API_KEY and MAILGUN_DOMAIN), else 503.
 *
 * `[sendMail]` logs carry the provider, the outcome, the failure kind and the
 * HTTP status only: never what the visitor typed, nor a key.
 */

import { contactMessage, mailgunErrorSummary } from './mailgun.js'
import {
	DEFAULT_CONTACT_TO,
	DEFAULT_EMAIL_FROM,
	sendWithResend,
} from './resend.js'

export const CONTACT_SUBJECT = 'Nouveau message de contact'

/**
 * Body of the email, the same for both providers (unchanged since Mailgun).
 * @param {Object<string, string>} fields - checked by contactMessage
 * @returns {string}
 */
export function contactText(fields) {
	return `
                Nom: ${fields.last_name} \n
                Prénom: ${fields.first_name} \n
                Email: ${fields.email} \n
                Numéro de téléphone: ${fields.phone_number} \n
                Message: ${fields.message}
            `
}

// an optional setting: trimmed, a blank value is unset
function setting(value) {
	return typeof value === 'string' ? value.trim() : ''
}

/**
 * Who sends the contact form: Resend wins over Mailgun.
 * @param {Object<string, string|undefined>} env
 * @returns {'resend'|'mailgun'|null}
 */
export function contactProvider(env = {}) {
	if (setting(env.RESEND_API_KEY)) return 'resend'
	if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) return 'mailgun'
	return null
}

/**
 * Builds the API route handler.
 * @param {object} deps
 * @param {Object<string, string|undefined>} deps.env - read on each request
 * @param {typeof fetch} [deps.fetchImpl] - Resend; default: the global fetch
 * @param {(domain: string, message: object) => Promise<unknown>} deps.sendWithMailgun
 * @param {number} [deps.timeoutMs] - Resend; default: RESEND_TIMEOUT_MS
 * @returns {(req: object, res: object) => Promise<unknown>}
 */
export function sendMailHandler({
	env,
	fetchImpl,
	sendWithMailgun,
	timeoutMs,
}) {
	return async function sendMail(req, res) {
		if (req.method !== 'POST') {
			return res.status(405).json({ message: 'Method not allowed' })
		}

		const provider = contactProvider(env)
		if (!provider) {
			console.error('[sendMail] not configured')
			return res.status(503).json({ success: false })
		}

		const checked = contactMessage(req.body)
		if (!checked.ok) {
			console.warn('[sendMail] rejected', { field: checked.field })
			return res.status(400).json({ success: false })
		}

		const { fields } = checked
		if (provider === 'resend') {
			const outcome = await sendWithResend(
				{
					key: setting(env.RESEND_API_KEY),
					from: setting(env.EMAIL_FROM) || DEFAULT_EMAIL_FROM,
					to: setting(env.CONTACT_TO) || DEFAULT_CONTACT_TO,
					replyTo: fields.email,
					subject: CONTACT_SUBJECT,
					text: contactText(fields),
				},
				{ fetchImpl, timeoutMs }
			)
			if (outcome.ok) {
				console.info('[sendMail] provider=resend sent', {
					status: outcome.status,
				})
				return res.status(200).json({ success: true })
			}
			console.error('[sendMail] provider=resend failed', {
				kind: outcome.kind,
				status: outcome.status,
			})
			return res.status(502).json({ success: false })
		}

		// Mailgun (network: no HTTP response; http: Mailgun answered)
		try {
			await sendWithMailgun(env.MAILGUN_DOMAIN, {
				from: 'My-Makeup <contact@my-makeup.fr>',
				to: 'contact@my-makeup.fr',
				subject: CONTACT_SUBJECT,
				text: contactText(fields),
			})
			console.info('[sendMail] sent')
			return res.status(200).json({ success: true })
		} catch (error) {
			console.error('[sendMail] failed', mailgunErrorSummary(error))
			return res.status(502).json({ success: false })
		}
	}
}
