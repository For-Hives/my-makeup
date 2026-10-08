/**
 * Umami served from the site itself (MES-10, plans/04 §3.1): the browser
 * loads /u/script.js and posts to /u/api/send, next.config.js rewrites both
 * to the Umami instance (UMAMI_ORIGIN) and src/middleware.js cleans the
 * request headers on the way. Blockers that filter the domain of the
 * instance no longer hide real visits, and moving the instance only changes
 * UMAMI_ORIGIN.
 */

// Public: it is in the HTML of every page. Kept when the instance moves with
// its history (pg_dump and restore).
export const UMAMI_WEBSITE_ID = 'e7010ee5-a940-4add-80bf-5483d2c515db'
export const UMAMI_PROXY_PREFIX = '/u'
// The only two paths of the instance the site serves: never its dashboard,
// its login or the rest of its API.
export const UMAMI_PROXY_PATHS = ['/u/script.js', '/u/api/send']
export const BEFORE_SEND_NAME = 'mmAvantEnvoi'
export const DEFAULT_UMAMI_DOMAINS = ['my-makeup.fr', 'www.my-makeup.fr']

const HOSTNAME =
	/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

/**
 * Hostnames Umami counts visits on (data-domains), from
 * NEXT_PUBLIC_UMAMI_DOMAINS (comma separated); empty or invalid: the two
 * hostnames of the production site. Elsewhere (a local build, a copy of the
 * site) the script sends nothing.
 * @param {unknown} [raw]
 * @returns {string[]}
 */
export function umamiDomains(raw) {
	const domains = String(raw ?? '')
		.split(',')
		.map(domain => domain.trim().toLowerCase())
		.filter(domain => HOSTNAME.test(domain))
	return domains.length > 0 ? [...new Set(domains)] : DEFAULT_UMAMI_DOMAINS
}

/**
 * data-tag of the script: the deployed version, at most 50 characters (the
 * size of the column in Umami), without the leading characters Umami refuses
 * (=, +, -, @: it drops the whole event).
 * @param {unknown} version - deployedVersion()
 * @returns {string}
 */
export function umamiTag(version) {
	const tag = String(version ?? '')
		.trim()
		.replace(/^[=+\-@\s]+/, '')
		.slice(0, 50)
	return tag === '' ? 'unknown' : tag
}

/**
 * Attributes of the Umami <script> tag (Umami 3.2: data-website-id,
 * data-host-url, data-domains, data-tag, data-before-send).
 * @param {object} [options]
 * @param {string} [options.tag] - deployedVersion()
 * @param {string} [options.domains] - NEXT_PUBLIC_UMAMI_DOMAINS
 * @returns {Object<string, string>}
 */
export function umamiScriptAttributes({ tag, domains } = {}) {
	return {
		src: `${UMAMI_PROXY_PREFIX}/script.js`,
		'data-website-id': UMAMI_WEBSITE_ID,
		'data-host-url': UMAMI_PROXY_PREFIX,
		'data-domains': umamiDomains(domains).join(','),
		'data-tag': umamiTag(tag),
		'data-before-send': BEFORE_SEND_NAME,
	}
}

/**
 * data-before-send of the Umami script (plans/04 §3.1 and §3.4): Umami calls
 * window.mmAvantEnvoi(type, payload) before every send and sends nothing when
 * it gets a falsy value back. Nothing leaves:
 * - from an automated browser: navigator.webdriver (the headless robots that
 *   inflate the US visitors, audit annex E), a HeadlessChrome user agent, a
 *   page shown inside a frame;
 * - from a browser that opted out (« Ne plus mesurer mes visites », the
 *   umami.disabled key, which Umami also checks itself).
 * What leaves is cleaned: the page URL keeps its utm_* parameters only (no
 * search terms, no codes, no hash) and the referrer loses its query string
 * and its hash. Unlike data-exclude-search, campaigns are still counted.
 * Any error: nothing is sent.
 *
 * Self-contained on purpose: _document inlines its source
 * (beforeSendScript), so it uses nothing outside its own body.
 * @param {string} type - 'event', 'identify' or 'performance'
 * @param {object} payload
 * @param {Window} win
 * @returns {object|false} the payload to send, or false
 */
export function umamiBeforeSend(type, payload, win) {
	try {
		const nav = win.navigator || {}
		if (nav.webdriver) return false
		if (/HeadlessChrome/.test(String(nav.userAgent || ''))) return false
		if (win.top !== win.self) return false
		let storage = null
		try {
			storage = win.localStorage
		} catch {
			storage = null
		}
		if (storage && storage.getItem('umami.disabled') !== null) return false
		if (!payload || typeof payload !== 'object') return false

		const base = String(win.location && win.location.href)
		const clean = (raw, keepCampaign) => {
			if (typeof raw !== 'string' || raw === '') return raw
			const url = new URL(raw, base)
			const kept = new URLSearchParams()
			if (keepCampaign)
				url.searchParams.forEach((value, key) => {
					if (/^utm_[a-z]+$/.test(key)) kept.append(key, value)
				})
			const query = kept.toString()
			return url.origin + url.pathname + (query ? '?' + query : '')
		}

		const copy = Object.assign({}, payload)
		if ('url' in copy) copy.url = clean(copy.url, true)
		if ('referrer' in copy) copy.referrer = clean(copy.referrer, false)
		return copy
	} catch {
		return false
	}
}

/**
 * Inline script that defines window.mmAvantEnvoi before the Umami script
 * runs (_document).
 * @returns {string}
 */
export function beforeSendScript() {
	return `window.${BEFORE_SEND_NAME}=function(type,payload){return(${umamiBeforeSend.toString()})(type,payload,window)};`
}
