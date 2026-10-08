import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
	BEFORE_SEND_NAME,
	DEFAULT_UMAMI_DOMAINS,
	UMAMI_WEBSITE_ID,
	beforeSendScript,
	umamiBeforeSend,
	umamiDomains,
	umamiScriptAttributes,
	umamiTag,
} from '../../src/lib/umami.js'

const CHROME =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const HEADLESS =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.0.0 Safari/537.36'

function storage(values = {}) {
	const map = new Map(Object.entries(values))
	return { getItem: key => (map.has(key) ? map.get(key) : null) }
}

// a browser window as Umami sees it, a real visitor by default
function fenetre({
	webdriver = false,
	userAgent = CHROME,
	framed = false,
	localStorage = storage(),
	href = 'https://my-makeup.fr/',
} = {}) {
	const win = {
		navigator: { webdriver, userAgent },
		location: { href },
		localStorage,
	}
	win.self = win
	win.top = framed ? {} : win
	return win
}

const pageView = (extra = {}) => ({
	website: UMAMI_WEBSITE_ID,
	hostname: 'my-makeup.fr',
	screen: '1440x900',
	language: 'fr-FR',
	title: 'My Makeup',
	url: 'https://my-makeup.fr/',
	referrer: '',
	tag: 'abc1234',
	...extra,
})

describe('umamiBeforeSend: who is measured (plans/04 §3.1, §3.4)', () => {
	test('a real visitor is sent, unchanged when there is nothing to clean', () => {
		assert.deepEqual(
			umamiBeforeSend('event', pageView(), fenetre()),
			pageView()
		)
	})

	test('nothing leaves an automated browser (navigator.webdriver)', () => {
		assert.equal(
			umamiBeforeSend('event', pageView(), fenetre({ webdriver: true })),
			false
		)
	})

	test('nothing leaves a HeadlessChrome user agent', () => {
		assert.equal(
			umamiBeforeSend('event', pageView(), fenetre({ userAgent: HEADLESS })),
			false
		)
	})

	test('nothing leaves a page shown inside a frame', () => {
		assert.equal(
			umamiBeforeSend('event', pageView(), fenetre({ framed: true })),
			false
		)
	})

	test('nothing leaves a browser that chose « Ne plus mesurer mes visites »', () => {
		const optedOut = fenetre({
			localStorage: storage({ 'umami.disabled': '1' }),
		})
		assert.equal(umamiBeforeSend('event', pageView(), optedOut), false)
		assert.equal(
			umamiBeforeSend('performance', pageView({ lcp: 1200 }), optedOut),
			false
		)
	})

	test('a storage that cannot be read does not block a real visitor', () => {
		const win = fenetre()
		Object.defineProperty(win, 'localStorage', {
			get() {
				throw new Error('SecurityError')
			},
		})
		assert.deepEqual(umamiBeforeSend('event', pageView(), win), pageView())
	})

	test('every kind of send goes through the same filter', () => {
		for (const type of ['event', 'identify', 'performance'])
			assert.equal(
				umamiBeforeSend(type, pageView(), fenetre({ webdriver: true })),
				false
			)
	})

	test('no payload, or any error, sends nothing', () => {
		assert.equal(umamiBeforeSend('event', null, fenetre()), false)
		assert.equal(umamiBeforeSend('event', pageView(), undefined), false)
		assert.equal(
			umamiBeforeSend(
				'event',
				pageView({ url: 'http://[bad' }),
				fenetre({ href: 'not a url' })
			),
			false
		)
	})
})

describe('umamiBeforeSend: what leaves', () => {
	test('the page keeps its utm_* parameters only, without hash', () => {
		const sent = umamiBeforeSend(
			'event',
			pageView({
				url: 'https://my-makeup.fr/search?search=mariage&city=Annecy&utm_source=instagram&utm_campaign=bio-12#resultats',
			}),
			fenetre()
		)
		assert.equal(
			sent.url,
			'https://my-makeup.fr/search?utm_source=instagram&utm_campaign=bio-12'
		)
	})

	test('a page without campaign loses its whole query string', () => {
		const sent = umamiBeforeSend(
			'event',
			pageView({ url: 'https://my-makeup.fr/auth/signin?error=Callback' }),
			fenetre()
		)
		assert.equal(sent.url, 'https://my-makeup.fr/auth/signin')
	})

	test('the referrer keeps its origin and path only', () => {
		const sent = umamiBeforeSend(
			'event',
			pageView({
				referrer: 'https://www.google.com/search?q=maquilleuse+annecy#x',
			}),
			fenetre()
		)
		assert.equal(sent.referrer, 'https://www.google.com/search')
		assert.equal(
			umamiBeforeSend('event', pageView({ referrer: '' }), fenetre()).referrer,
			''
		)
	})

	test('events keep their name, data and tag; the payload given is not modified', () => {
		const payload = pageView({
			url: 'https://my-makeup.fr/profil/x?utm_medium=email&id=4',
			name: 'contact_click',
			data: { pid: '4', channel: 'email' },
		})
		const avant = structuredClone(payload)
		const sent = umamiBeforeSend('event', payload, fenetre())
		assert.deepEqual(payload, avant)
		assert.equal(sent.url, 'https://my-makeup.fr/profil/x?utm_medium=email')
		assert.equal(sent.name, 'contact_click')
		assert.deepEqual(sent.data, { pid: '4', channel: 'email' })
		assert.equal(sent.tag, 'abc1234')
		assert.equal(sent.website, UMAMI_WEBSITE_ID)
	})

	test('a payload without url nor referrer gets none', () => {
		const sent = umamiBeforeSend('event', { website: 'x' }, fenetre())
		assert.deepEqual(sent, { website: 'x' })
	})
})

describe('beforeSendScript (inlined by _document)', () => {
	const run = win => {
		const context = { window: win, URL, URLSearchParams }
		vm.runInNewContext(beforeSendScript(), context)
		return context.window[BEFORE_SEND_NAME]
	}

	test('defines window.mmAvantEnvoi with the same rules', () => {
		const visitor = run(fenetre())
		assert.equal(typeof visitor, 'function')
		assert.equal(
			visitor('event', pageView({ url: 'https://my-makeup.fr/?a=1' })).url,
			'https://my-makeup.fr/'
		)
		assert.equal(run(fenetre({ webdriver: true }))('event', pageView()), false)
		assert.equal(
			run(fenetre({ localStorage: storage({ 'umami.disabled': '1' }) }))(
				'event',
				pageView()
			),
			false
		)
	})

	test('cannot close the inline <script> it lives in', () => {
		assert.doesNotMatch(beforeSendScript(), /<\/script/i)
	})
})

describe('script attributes', () => {
	test('loaded from /u with the website, the domains, the tag and the filter', () => {
		assert.deepEqual(umamiScriptAttributes({ tag: 'abc1234' }), {
			src: '/u/script.js',
			'data-website-id': UMAMI_WEBSITE_ID,
			'data-host-url': '/u',
			'data-domains': 'my-makeup.fr,www.my-makeup.fr',
			'data-tag': 'abc1234',
			'data-before-send': 'mmAvantEnvoi',
		})
	})

	test('never points to the Umami instance itself', () => {
		for (const value of Object.values(umamiScriptAttributes()))
			assert.doesNotMatch(value, /wadefade|https?:/)
	})

	test('umamiDomains: the list given, else the production site', () => {
		assert.deepEqual(umamiDomains('localhost'), ['localhost'])
		assert.deepEqual(
			umamiDomains(' My-Makeup.fr , www.my-makeup.fr,my-makeup.fr'),
			['my-makeup.fr', 'www.my-makeup.fr']
		)
		assert.deepEqual(umamiDomains(''), DEFAULT_UMAMI_DOMAINS)
		assert.deepEqual(umamiDomains(undefined), DEFAULT_UMAMI_DOMAINS)
		assert.deepEqual(
			umamiDomains('https://my-makeup.fr/, "x"'),
			DEFAULT_UMAMI_DOMAINS
		)
	})

	test('umamiTag: 50 characters, nothing Umami would refuse', () => {
		assert.equal(umamiTag(' abc1234 '), 'abc1234')
		assert.equal(umamiTag('=1+1'), '1+1')
		assert.equal(umamiTag('-rc.1'), 'rc.1')
		assert.equal(umamiTag('a'.repeat(60)), 'a'.repeat(50))
		assert.equal(umamiTag(''), 'unknown')
		assert.equal(umamiTag(undefined), 'unknown')
	})
})
