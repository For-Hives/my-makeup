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
 * Attributes of the Umami script (Umami 3.2: data-website-id,
 * data-host-url, data-domains, data-tag, data-before-send), set by
 * umamiLoader.
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
 * Ad click ids (gclid, fbclid, msclkid…) are dropped on purpose: they are
 * identifiers of the ad network, campaigns are attributed with utm_*
 * (Umami counts utm_medium=cpc, paid or paid_social as paid ads), and
 * Facebook adds fbclid to every outbound link, which would move organic
 * social visits into the paid ads channel.
 * A referrer that is not a web page keeps its scheme and app id only
 * (android-app://com.google.android.googlequicksearchbox/, the Google app):
 * Umami takes that id as the referrer domain, and « google. » in it counts
 * the visit as organic search (D2).
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
			// url.origin is "null" outside http(s)
			if (url.protocol !== 'http:' && url.protocol !== 'https:')
				return url.host ? url.protocol + '//' + url.host + '/' : ''
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
 * Inline script that defines window.mmAvantEnvoi (umamiLoaderScript).
 * @returns {string}
 */
export function beforeSendScript() {
	return `window.${BEFORE_SEND_NAME}=function(type,payload){return(${umamiBeforeSend.toString()})(type,payload,window)};`
}

export const WAITING_ROOM_NAME = 'mmAttenteUmami'
export const WAITING_ROOM_MAX = 20

/**
 * Adds the Umami script to the page, async, and keeps the events tracked
 * before it ran (MES-10). Run by the inline script of the <head>
 * (umamiLoaderScript), so the filter and the waiting room exist before the
 * Umami script does.
 * - Async and added from here, never a <script> tag of _document: the
 *   scripts of Next are deferred, and a deferred Umami would keep every page
 *   from hydrating while Umami is slow or silent; React 19 would move an
 *   async <script src> tag to the top of the <head>, before the filter.
 * - An event tracked before the script ran (not_found or demande_envoyee as
 *   soon as their page mounts, an early Web Vital) waits here and goes to
 *   window.umami.track, in order, once it has run. At most `max` events
 *   wait. If the script fails to load (a blocker, Umami down, the proxy
 *   timeout), they are dropped and no more are kept.
 *
 * Self-contained on purpose: _document inlines its source, so it uses
 * nothing outside its own body.
 * @param {Window} win
 * @param {Object<string, string>} attributes - umamiScriptAttributes()
 * @param {number} max
 * @returns {(name: string, data: object) => boolean} keeps an event until
 *   the script has run: false once it has run or failed, or when full
 */
export function umamiLoader(win, attributes, max) {
	const waiting = []
	let state = 'loading'
	const script = win.document.createElement('script')
	Object.keys(attributes).forEach(name => {
		script.setAttribute(name, attributes[name])
	})
	script.async = true
	script.addEventListener('load', () => {
		state = 'loaded'
		const umami = win.umami
		waiting.splice(0).forEach(item => {
			try {
				umami.track(item.name, item.data)
			} catch {
				// one failing event never stops the others
			}
		})
	})
	script.addEventListener('error', () => {
		state = 'failed'
		waiting.length = 0
	})
	;(win.document.head || win.document.documentElement).appendChild(script)
	return (name, data) => {
		if (state !== 'loading' || waiting.length >= max) return false
		waiting.push({ name: name, data: data })
		return true
	}
}

/**
 * Inline script of the <head> (_document): defines window.mmAvantEnvoi and
 * window.mmAttenteUmami, then adds the Umami script.
 * @param {Object<string, string>} attributes - umamiScriptAttributes()
 * @returns {string}
 */
export function umamiLoaderScript(attributes) {
	// \u003c: no value can close the inline <script>
	const json = JSON.stringify(attributes).replace(/</g, '\\u003c')
	return `${beforeSendScript()}window.${WAITING_ROOM_NAME}=(${umamiLoader.toString()})(window,${json},${WAITING_ROOM_MAX});`
}

// Headers Umami 3.2 reads the visitor's IP and location from (src/lib/ip.ts
// and src/lib/detect.ts), in its order of preference: X-Real-IP comes before
// X-Forwarded-For, so behind the proxy Umami would see the server of the
// site, unless True-Client-IP (read first) carries the visitor's address.
// Umami takes the first one present: True-Client-IP alone is enough, none of
// the others is sent.
const IP_HEADERS = [
	'x-umami-client-ip',
	'true-client-ip',
	'cf-connecting-ip',
	'fastly-client-ip',
	'x-nf-client-connection-ip',
	'do-connecting-ip',
	'x-real-ip',
	'x-appengine-user-ip',
	'x-forwarded-for',
	'forwarded',
	'x-client-ip',
	'x-cluster-client-ip',
	'x-forwarded',
]
const LOCATION_HEADERS = [
	'x-umami-client-country',
	'x-umami-client-region',
	'x-umami-client-city',
	'cf-ipcountry',
	'cf-region-code',
	'cf-ipcity',
	'x-vercel-ip-country',
	'x-vercel-ip-country-region',
	'x-vercel-ip-city',
	'cloudfront-viewer-country',
	'cloudfront-viewer-country-region',
	'cloudfront-viewer-city',
	'eo-ipcountry',
	'eo-region-code',
	'eo-ipcity',
]
// Never forwarded: the session cookie of the artist's space, credentials,
// and the full address of the page (Referer), which Umami does not need.
const DROPPED_HEADERS = [
	'cookie',
	'authorization',
	'proxy-authorization',
	'referer',
]

const looksLikeIp = value =>
	typeof value === 'string' &&
	/^[0-9a-f:.]{2,45}$/i.test(value) &&
	/[.:]/.test(value)

/**
 * Address of the visitor as the reverse proxy in front of Next (Traefik)
 * saw it: the last X-Forwarded-For entry (the one the closest proxy added),
 * else X-Real-IP, else null.
 * @param {Headers} headers
 * @returns {string|null}
 */
export function visitorIp(headers) {
	const forwarded = String(headers.get('x-forwarded-for') ?? '')
		.split(',')
		.map(entry => entry.trim())
		.filter(Boolean)
	const last = forwarded[forwarded.length - 1]
	if (looksLikeIp(last)) return last
	const real = String(headers.get('x-real-ip') ?? '').trim()
	return looksLikeIp(real) ? real : null
}

/**
 * Request headers sent on to Umami for /u/script.js and /u/api/send: no
 * cookie, no credentials, no Referer; the visitor's IP only, once, in
 * True-Client-IP, never an address or a location sent by the browser
 * itself. Umami needs the IP to find the country (D1 counts
 * French visitors) and to tell visitors apart (session hash); it does not
 * store it. This is what Umami received before the proxy, when the browser
 * called it directly.
 * @param {Headers} incoming
 * @returns {Headers}
 */
export function umamiProxyHeaders(incoming) {
	const headers = new Headers(incoming)
	const ip = visitorIp(incoming)
	for (const name of [...DROPPED_HEADERS, ...IP_HEADERS, ...LOCATION_HEADERS])
		headers.delete(name)
	if (ip !== null) headers.set('true-client-ip', ip)
	return headers
}
