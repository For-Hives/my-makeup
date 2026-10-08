/**
 * « Demander un devis » (F3a, plans/05 §3.1): link from a public profile to
 * the external quote form (concierge mode), with hidden fields the form keeps:
 * profile slug and id, source, utm parameters and referrer domain.
 *
 * The button only exists when NEXT_PUBLIC_DEVIS_FORM_URL holds a valid https
 * URL (decision D4 pending): no URL, no button.
 */

import { looksPersonal, referrerDomain } from './analytics.js'

export const UTM_PARAMS = [
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
]

const MAX_PARAM_LENGTH = 100

/**
 * Validated form URL, or null when the variable is empty or not a plain https
 * URL (no credentials).
 * @param {string|undefined} raw - NEXT_PUBLIC_DEVIS_FORM_URL
 * @returns {string|null}
 */
export function devisFormUrl(raw) {
	if (typeof raw !== 'string' || raw.trim() === '') return null
	try {
		const url = new URL(raw.trim())
		if (url.protocol !== 'https:' || url.username || url.password) return null
		return url.toString()
	} catch {
		return null
	}
}

/**
 * Link to the quote form for one profile.
 * @param {object} options
 * @param {string|undefined} options.formUrl - NEXT_PUBLIC_DEVIS_FORM_URL
 * @param {string} options.slug - profile username, as in /profil/<slug>
 * @param {number|string} [options.pid] - Strapi id of the profile
 * @param {string} [options.search] - location.search of the profile page
 * @param {string} [options.referrer] - document.referrer
 * @returns {string|null} null when the form is not configured
 */
export function buildDevisHref({
	formUrl,
	slug,
	pid,
	search = '',
	referrer = '',
}) {
	const base = devisFormUrl(formUrl)
	if (base === null || typeof slug !== 'string' || slug.trim() === '')
		return null

	const url = new URL(base)
	url.searchParams.set('profil', slug)
	const id = String(pid ?? '')
	if (/^[1-9]\d{0,7}$/.test(id)) url.searchParams.set('pid', id)
	url.searchParams.set('source', 'profil')

	const current = new URLSearchParams(search)
	for (const key of UTM_PARAMS) {
		const value = (current.get(key) || '').trim().slice(0, MAX_PARAM_LENGTH)
		if (value !== '' && !looksPersonal(value)) url.searchParams.set(key, value)
	}

	const domain = referrerDomain(referrer)
	if (domain !== '') url.searchParams.set('referent', domain)

	return url.toString()
}
