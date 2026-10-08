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

const LIMITS = {
	first_name: 100,
	last_name: 100,
	email: 254,
	phone_number: 30,
	message: 5000,
}

/**
 * Checks the contact form body: every field is a non-empty string within its
 * limit, the email has an @. Unknown fields are ignored.
 * @param {unknown} body
 * @returns {{ok: true, fields: Object<string, string>}|{ok: false, field: string}}
 */
export function contactMessage(body) {
	const source = body !== null && typeof body === 'object' ? body : {}
	const fields = {}
	for (const [name, max] of Object.entries(LIMITS)) {
		const value = typeof source[name] === 'string' ? source[name].trim() : ''
		if (value === '' || value.length > max) return { ok: false, field: name }
		fields[name] = value
	}
	if (!/^[^@\s]+@[^@\s]+$/.test(fields.email))
		return { ok: false, field: 'email' }
	return { ok: true, fields }
}

/**
 * What may be logged about a Mailgun failure: the HTTP status only.
 * @param {unknown} error
 * @returns {{status: number}}
 */
export function mailgunErrorSummary(error) {
	const status = Number(error && typeof error === 'object' ? error.status : NaN)
	return { status: Number.isInteger(status) ? status : 0 }
}
