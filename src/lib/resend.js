/**
 * Contact form through Resend (/api/sendMail): one call to the REST API
 * (POST /emails) with the native fetch, no SDK. The outcome carries a kind
 * and the HTTP status only: never the API key, the answer of Resend or what
 * the visitor typed. `fetchImpl` is injectable for the tests.
 */

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
export const RESEND_TIMEOUT_MS = 10_000
export const DEFAULT_EMAIL_FROM = 'My Makeup <contact@send.my-makeup.fr>'
export const DEFAULT_CONTACT_TO = 'contact@my-makeup.fr'

/**
 * The fetch arguments of one email. Resend refuses a request without a
 * User-Agent (403), hence the explicit one.
 * @param {{key: string, from: string, to: string, replyTo: string, subject: string, text: string}} email
 * @returns {{url: string, init: RequestInit}}
 */
export function resendRequest({ key, from, to, replyTo, subject, text }) {
	return {
		url: RESEND_EMAILS_URL,
		init: {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${key}`,
				'Content-Type': 'application/json',
				'User-Agent': 'my-makeup',
			},
			body: JSON.stringify({ from, to, reply_to: replyTo, subject, text }),
			// a redirect would resend the key and the message elsewhere
			redirect: 'manual',
		},
	}
}

/**
 * Sends one email. A request that gets no HTTP answer within `timeoutMs` is
 * aborted (`kind: 'timeout'`); one that fails without an answer (DNS,
 * refused connection) is `kind: 'network'`; both with status 0. Any answer
 * outside 2xx is `kind: 'http'` with its status. Never throws.
 * @param {{key: string, from: string, to: string, replyTo: string, subject: string, text: string}} email
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [options]
 * @returns {Promise<{ok: true, status: number}|{ok: false, kind: 'http'|'timeout'|'network', status: number}>}
 */
export async function sendWithResend(
	email,
	{ fetchImpl = fetch, timeoutMs = RESEND_TIMEOUT_MS } = {}
) {
	const { url, init } = resendRequest(email)
	// a timer of our own (not AbortSignal.timeout, which does not keep the
	// process alive), cleared once the answer is read
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetchImpl(url, {
			...init,
			signal: controller.signal,
		})
		// read and dropped: frees the connection, never logged
		await response.text().catch(() => '')
		return response.ok
			? { ok: true, status: response.status }
			: { ok: false, kind: 'http', status: response.status }
	} catch {
		return {
			ok: false,
			kind: controller.signal.aborted ? 'timeout' : 'network',
			status: 0,
		}
	} finally {
		clearTimeout(timer)
	}
}
