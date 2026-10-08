/**
 * Contact form plumbing (/api/sendMail, MES-11): Mailgun client options, input
 * checks and log-safe error summaries. Nothing here returns or logs what the
 * visitor typed.
 */

export const MAILGUN_EU_URL = 'https://api.eu.mailgun.net'

/**
 * Options for `mailgun.client()`. The EU endpoint is used only when
 * MAILGUN_REGION is `eu` (the sending domain must live in the EU region);
 * otherwise the library default (US) is kept.
 * @param {{key?: string, region?: string}} env
 * @returns {{username: string, key: string|undefined, url?: string}}
 */
export function mailgunClientOptions({ key, region } = {}) {
	const options = { username: 'api', key }
	if (typeof region === 'string' && region.trim().toLowerCase() === 'eu')
		options.url = MAILGUN_EU_URL
	return options
}

/**
 * Maximum length of each contact form field, counted after trimming. The form
 * schema (src/lib/contactForm.js) uses the same values, so the visitor sees a
 * field error before the server would refuse the message.
 */
export const CONTACT_LIMITS = Object.freeze({
	first_name: 100,
	last_name: 100,
	email: 254,
	phone_number: 30,
	message: 5000,
})

// one bare address: no space, no second @, none of the characters that make
// a header value a name, a list or a group (the email is the Reply-To of the
// Resend message)
const BARE_ADDRESS = /^[^@\s<>()[\]\\,;:"]+@[^@\s<>()[\]\\,;:"]+$/

/**
 * Checks the contact form body: every field is a non-empty string within its
 * limit, the email is one bare address. Unknown fields are ignored.
 * @param {unknown} body
 * @returns {{ok: true, fields: Object<string, string>}|{ok: false, field: string}}
 */
export function contactMessage(body) {
	const source = body !== null && typeof body === 'object' ? body : {}
	const fields = {}
	for (const [name, max] of Object.entries(CONTACT_LIMITS)) {
		const value = typeof source[name] === 'string' ? source[name].trim() : ''
		if (value === '' || value.length > max) return { ok: false, field: name }
		fields[name] = value
	}
	if (!BARE_ADDRESS.test(fields.email)) return { ok: false, field: 'email' }
	return { ok: true, fields }
}

// system and axios codes of a request that never got an HTTP response
const NETWORK_CODE =
	/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ECONNABORTED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE|ERR_NETWORK)\b/

/**
 * What may be logged about a Mailgun failure: a kind and the HTTP status,
 * never the message itself (it can quote the recipient or the API key).
 *
 * mailgun.js reports a request without any HTTP response (DNS, refused or
 * reset connection, timeout) as status 400 with the system code in
 * `message` and `details`: that case is `kind: 'network'` with status 0, so
 * it cannot be read as a request Mailgun rejected.
 * @param {unknown} error
 * @returns {{kind: 'network'|'http'|'unknown', status: number}}
 */
export function mailgunErrorSummary(error) {
	const source = error !== null && typeof error === 'object' ? error : {}
	const texts = [source.code, source.message, source.details, source.statusText]
	if (texts.some(text => typeof text === 'string' && NETWORK_CODE.test(text)))
		return { kind: 'network', status: 0 }
	const status = Number(source.status)
	if (Number.isInteger(status) && status >= 100 && status <= 599)
		return { kind: 'http', status }
	return { kind: 'unknown', status: 0 }
}
