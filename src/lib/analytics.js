/**
 * Umami analytics: the closed catalogue of events (plans/04 §3.3) and the only
 * path to `window.umami`.
 *
 * Nothing personal ever leaves through here: every property is a value from a
 * closed list, a boolean, a small integer or a Strapi profile id (`pid`, public
 * and already part of the counted URLs). Typed text, names, emails and phone
 * numbers are never sent. An unknown event, an unknown property or an invalid
 * value drops the whole event instead of sending something half-checked.
 */

export const CONTACT_CHANNELS = [
	'email',
	'phone',
	'instagram',
	'facebook',
	'linkedin',
	'youtube',
	'website',
]

export const DEMANDE_SOURCES = [
	'profil',
	'recherche',
	'talent',
	'article',
	'maeva',
	'partenaire',
	'b2b',
	'ads',
	'bio',
	'autre',
]

export const RESULT_BUCKETS = ['0', '1-5', '6-20', '21+']

const id = { type: 'id', required: true }
const optionalId = { type: 'id', required: false }
const flag = { type: 'boolean', required: true }
const oneOf = values => ({ type: 'enum', values, required: true })
const int = (min, max) => ({ type: 'int', min, max, required: true })

export const EVENTS = {
	contact_click: { pid: id, channel: oneOf(CONTACT_CHANNELS) },
	devis_click: { pid: id, from: oneOf(['profil', 'recherche', 'article']) },
	demande_envoyee: { pid: optionalId, source: oneOf(DEMANDE_SOURCES) },
	search_submit: {
		has_city: flag,
		results: oneOf(RESULT_BUCKETS),
		from: oneOf(['formulaire', 'lien']),
	},
	search_result_click: { rank: int(1, 999), pid: id },
	cta_click: {
		where: oneOf([
			'cta_recherche',
			'cta_inscription',
			'nav_recherche',
			'nav_recherche_mobile',
		]),
	},
	platform_contact_submit: { ok: flag, status: int(0, 599) },
	not_found: { kind: oneOf(['profil', 'talent', 'blog', 'autre']) },
	signup_start: { method: oneOf(['email', 'google']) },
	onboarding_step: {
		step: oneOf(['verification_email', 'compte_cree', 'termine']),
	},
}

/**
 * True when a value looks like personal data: an email address or a phone
 * number (9 digits or more, separators allowed).
 * @param {unknown} value
 * @returns {boolean}
 */
export function looksPersonal(value) {
	const text = String(value)
	return text.includes('@') || /(\d[\s.\-()]*){9,}/.test(text)
}

function normalize(spec, value) {
	switch (spec.type) {
		case 'id': {
			const text = typeof value === 'number' ? String(value) : value
			return typeof text === 'string' && /^[1-9]\d{0,7}$/.test(text)
				? text
				: undefined
		}
		case 'int':
			return Number.isInteger(value) && value >= spec.min && value <= spec.max
				? value
				: undefined
		case 'boolean':
			return typeof value === 'boolean' ? value : undefined
		case 'enum':
			return spec.values.includes(value) ? value : undefined
		default:
			return undefined
	}
}

/**
 * Checks an event against the catalogue and returns its flat, normalized
 * properties, or null when anything is off.
 * @param {string} name - event name, e.g. `contact_click`
 * @param {object} [props]
 * @returns {object|null}
 */
export function eventData(name, props = {}) {
	if (!Object.prototype.hasOwnProperty.call(EVENTS, name)) return null
	if (props === null || typeof props !== 'object') return null
	const catalogue = EVENTS[name]
	const data = {}

	for (const key of Object.keys(props)) {
		if (!Object.prototype.hasOwnProperty.call(catalogue, key)) return null
	}

	for (const [key, spec] of Object.entries(catalogue)) {
		const raw = props[key]
		if (raw === undefined || raw === null) {
			if (spec.required) return null
			continue
		}
		const value = normalize(spec, raw)
		if (value === undefined || looksPersonal(value)) return null
		data[key] = value
	}

	return data
}

/**
 * `data-umami-event` attributes for a link or a button: Umami sends the event
 * on click by itself. Returns an empty object when the event is invalid, so it
 * can always be spread on the element.
 * @param {string} name
 * @param {object} [props]
 * @returns {Object<string, string>}
 */
export function umamiAttributes(name, props = {}) {
	const data = eventData(name, props)
	if (data === null) return {}
	const attributes = { 'data-umami-event': name }
	for (const [key, value] of Object.entries(data)) {
		attributes[`data-umami-event-${key}`] = String(value)
	}
	return attributes
}

function defaultRuntime() {
	return {
		win: typeof window === 'undefined' ? undefined : window,
		production: process.env.NODE_ENV === 'production',
	}
}

/**
 * Sends an event through `window.umami.track`. Never throws. Does nothing
 * outside production, without Umami, or in an automated browser.
 * @param {string} name
 * @param {object} [props]
 * @param {{win?: object, production?: boolean}} [runtime] - for the tests
 * @returns {boolean} true when the event was handed to Umami
 */
export function track(name, props = {}, runtime = defaultRuntime()) {
	try {
		const data = eventData(name, props)
		const { win, production } = runtime
		if (data === null || !production || !win) return false
		if (win.navigator && win.navigator.webdriver) return false
		if (!win.umami || typeof win.umami.track !== 'function') return false
		win.umami.track(name, data)
		return true
	} catch {
		return false
	}
}

/**
 * @param {number} count - number of search results
 * @returns {string} one of RESULT_BUCKETS
 */
export function resultsBucket(count) {
	const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
	if (n === 0) return '0'
	if (n <= 5) return '1-5'
	if (n <= 20) return '6-20'
	return '21+'
}

/**
 * Kind of page behind a 404, for `not_found`.
 * @param {string} pathname
 * @returns {'profil'|'talent'|'blog'|'autre'}
 */
export function notFoundKind(pathname) {
	const first = String(pathname || '')
		.split('/')
		.filter(Boolean)[0]
	return ['profil', 'talent', 'blog'].includes(first) ? first : 'autre'
}

/**
 * True when the same key was already tracked less than `windowMs` ago (the
 * search page can run the same search twice for one submit).
 * @param {{key: string, at: number}|null} previous
 * @param {string} key
 * @param {number} now - ms
 * @param {number} [windowMs]
 * @returns {boolean}
 */
export function isRepeat(previous, key, now, windowMs = 3000) {
	if (!previous || previous.key !== key) return false
	const elapsed = now - previous.at
	return elapsed >= 0 && elapsed < windowMs
}

/**
 * Domain of a referrer URL (never its path or query), or '' when there is none.
 * @param {string} referrer
 * @returns {string}
 */
export function referrerDomain(referrer) {
	try {
		const url = new URL(referrer)
		return url.protocol === 'http:' || url.protocol === 'https:'
			? url.hostname.toLowerCase()
			: ''
	} catch {
		return ''
	}
}

const same = (a, b) =>
	typeof a === 'string' &&
	typeof b === 'string' &&
	a.trim() !== '' &&
	a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Whether a click on a contact link of a public profile should count as a
 * `contact_click`: not when the visitor owns the profile, comes from her own
 * space (/auth/profil) or from a reminder email (utm_campaign=relance).
 * @param {object} context
 * @param {{username?: string, email?: string}} [context.profile]
 * @param {{name?: string, email?: string}} [context.viewer] - session user
 * @param {string} [context.search] - location.search
 * @param {string} [context.referrer] - document.referrer
 * @param {string} [context.origin] - location.origin
 * @returns {boolean}
 */
export function shouldTrackContact({
	profile = {},
	viewer = {},
	search = '',
	referrer = '',
	origin = '',
} = {}) {
	if (same(profile.username, viewer.name) || same(profile.email, viewer.email))
		return false

	if (new URLSearchParams(search).get('utm_campaign') === 'relance')
		return false

	try {
		const from = new URL(referrer)
		if (from.origin === origin && from.pathname.startsWith('/auth/profil'))
			return false
	} catch {
		// no referrer, or not a URL: nothing to exclude
	}

	return true
}

const ONBOARDING_STEPS = { 1: 'verification_email', 3: 'compte_cree', 4: 'termine' }

/**
 * `onboarding_step` value for a step of /auth/init-account, or null.
 * @param {number} step
 * @returns {string|null}
 */
export function onboardingStepName(step) {
	return ONBOARDING_STEPS[step] ?? null
}

/**
 * `demande_envoyee` properties from the query string the external quote form
 * redirects with. Unknown sources become `autre`, an invalid pid is dropped.
 * @param {{pid?: string|string[], source?: string|string[]}} query
 * @returns {{source: string, pid?: string}}
 */
export function demandeEnvoyeeProps(query = {}) {
	const first = value => (Array.isArray(value) ? value[0] : value)
	const source = first(query.source)
	const pid = normalize(id, first(query.pid))
	const props = {
		source: DEMANDE_SOURCES.includes(source) ? source : 'autre',
	}
	if (pid !== undefined) props.pid = pid
	return props
}

export const MEASURE_OPT_OUT_KEY = 'umami.disabled'

/**
 * Whether this browser opted out of the audience measurement (Umami reads the
 * same `umami.disabled` key).
 * @param {Storage} [storage]
 * @returns {boolean}
 */
export function isMeasureDisabled(storage) {
	try {
		return !!storage && storage.getItem(MEASURE_OPT_OUT_KEY) !== null
	} catch {
		return false
	}
}

/**
 * Opts this browser out of (or back into) the audience measurement.
 * @param {Storage} storage
 * @param {boolean} disabled
 * @returns {boolean} the resulting state
 */
export function setMeasureDisabled(storage, disabled) {
	try {
		if (disabled) storage.setItem(MEASURE_OPT_OUT_KEY, '1')
		else storage.removeItem(MEASURE_OPT_OUT_KEY)
	} catch {
		// storage unavailable (private mode, blocked): nothing else to do
	}
	return isMeasureDisabled(storage)
}
