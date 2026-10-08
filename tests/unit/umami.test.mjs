import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
	BEFORE_SEND_NAME,
	DEFAULT_UMAMI_DOMAINS,
	UMAMI_PROXY_PATHS,
	UMAMI_WEBSITE_ID,
	WAITING_ROOM_MAX,
	WAITING_ROOM_NAME,
	beforeSendScript,
	umamiBeforeSend,
	umamiDomains,
	umamiProxyHeaders,
	umamiScriptAttributes,
	umamiLoader,
	umamiLoaderScript,
	umamiTag,
	visitorIp,
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

	test('ad click ids are dropped on purpose, the utm_medium of a paid campaign stays', () => {
		const sent = umamiBeforeSend(
			'event',
			pageView({
				url: 'https://my-makeup.fr/?gclid=a&fbclid=b&msclkid=c&ttclid=d&li_fat_id=e&twclid=f&utm_source=google&utm_medium=cpc&utm_campaign=exp-010',
			}),
			fenetre()
		)
		assert.equal(
			sent.url,
			'https://my-makeup.fr/?utm_source=google&utm_medium=cpc&utm_campaign=exp-010'
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

	// What Umami 3.2.0 makes of the referrer it receives: its domain
	// (src/app/api/send/route.ts) and the search channel
	// (getChannelMetrics.ts, SEARCH_DOMAINS from src/lib/constants.ts).
	const SEARCH_DOMAINS = [
		'baidu.com',
		'bing.com',
		'duckduckgo.com',
		'ecosia.org',
		'google.',
		'msn.com',
		'search.brave.com',
		'yandex.',
	]
	const vuParUmami = ({ hostname, referrer }) => {
		const domain = new URL(referrer, `https://${hostname}`).hostname.replace(
			/^www\./,
			''
		)
		return { domain, search: SEARCH_DOMAINS.some(d => domain.includes(d)) }
	}

	test('an Android app referrer keeps its app id: the Google app stays organic search', () => {
		const google = 'android-app://com.google.android.googlequicksearchbox/'
		assert.deepEqual(
			vuParUmami(
				umamiBeforeSend('event', pageView({ referrer: google }), fenetre())
			),
			{ domain: 'com.google.android.googlequicksearchbox', search: true }
		)
		for (const [referrer, sentReferrer] of [
			[google, google],
			[
				'android-app://com.google.android.gm/',
				'android-app://com.google.android.gm/',
			],
			[
				'android-app://com.google.android.googlequicksearchbox/https/www.google.com?q=x#y',
				google,
			],
		]) {
			const sent = umamiBeforeSend(
				'event',
				pageView({ referrer }),
				fenetre({ href: 'https://my-makeup.fr/maquilleuse/x' })
			)
			assert.equal(sent.referrer, sentReferrer, referrer)
			// Umami classifies the visit as it did before the filter existed
			assert.deepEqual(
				vuParUmami(sent),
				vuParUmami({ hostname: 'my-makeup.fr', referrer }),
				referrer
			)
		}
	})

	test('a web referrer keeps its domain for Umami, never the site itself', () => {
		const sent = umamiBeforeSend(
			'event',
			pageView({ referrer: 'https://www.google.fr/search?q=maquilleuse' }),
			fenetre()
		)
		assert.deepEqual(vuParUmami(sent), { domain: 'google.fr', search: true })
	})

	test('a referrer without host (file:) is dropped, with its path', () => {
		const sent = umamiBeforeSend(
			'event',
			pageView({ referrer: 'file:///C:/Users/prenom/Documents/devis.html' }),
			fenetre()
		)
		assert.equal(sent.referrer, '')
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

describe('beforeSendScript (inlined by _document, umamiLoaderScript)', () => {
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
		assert.equal(
			visitor(
				'event',
				pageView({
					referrer: 'android-app://com.google.android.googlequicksearchbox/',
				})
			).referrer,
			'android-app://com.google.android.googlequicksearchbox/'
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

// a document where the loader adds the Umami script: the tag keeps its
// attributes and its listeners, to play its load or its error
function documentFactice() {
	const ajoutes = []
	const balise = () => {
		const ecouteurs = {}
		return {
			attributs: {},
			async: false,
			setAttribute(nom, valeur) {
				this.attributs[nom] = String(valeur)
			},
			addEventListener: (type, ecouteur) =>
				(ecouteurs[type] ??= []).push(ecouteur),
			emettre: type => (ecouteurs[type] ?? []).forEach(e => e({ type })),
		}
	}
	return {
		ajoutes,
		createElement: tag => (tag === 'script' ? balise() : null),
		head: { appendChild: el => ajoutes.push(el) },
	}
}

// a window whose Umami script has not run yet
function fenetreEnAttente() {
	const envois = []
	const win = { document: documentFactice() }
	const script = () => win.document.ajoutes[0]
	const arrivee = () => {
		win.umami = { track: (name, data) => envois.push([name, data]) }
		script().emettre('load')
	}
	return { win, envois, arrivee, script }
}

const ATTRIBUTS = umamiScriptAttributes({ tag: 'abc1234' })

describe('umamiLoader: the Umami script, async, and the events tracked before it ran', () => {
	test('adds one async script to the <head>, with the attributes given', () => {
		const { win, script } = fenetreEnAttente()
		umamiLoader(win, ATTRIBUTS, 20)
		assert.equal(win.document.ajoutes.length, 1)
		assert.equal(script().async, true)
		assert.deepEqual(script().attributs, ATTRIBUTS)
	})

	test('the events wait, then go to window.umami.track in order once it has run', () => {
		const { win, envois, arrivee } = fenetreEnAttente()
		const attendre = umamiLoader(win, ATTRIBUTS, 20)
		assert.equal(attendre('not_found', { kind: 'autre' }), true)
		assert.equal(attendre('web-vitals', { name: 'FCP', value: 320 }), true)
		assert.deepEqual(envois, [])
		arrivee()
		assert.deepEqual(envois, [
			['not_found', { kind: 'autre' }],
			['web-vitals', { name: 'FCP', value: 320 }],
		])
	})

	test('once the script has run, nothing waits: track() calls Umami itself', () => {
		const { win, envois, arrivee } = fenetreEnAttente()
		const attendre = umamiLoader(win, ATTRIBUTS, 20)
		arrivee()
		assert.equal(attendre('not_found', { kind: 'autre' }), false)
		assert.deepEqual(envois, [])
	})

	test('a script that fails to load (blocker, Umami down): the events are dropped, no more are kept', () => {
		const { win, envois, script } = fenetreEnAttente()
		const attendre = umamiLoader(win, ATTRIBUTS, 20)
		attendre('not_found', { kind: 'autre' })
		script().emettre('error')
		assert.equal(attendre('not_found', { kind: 'blog' }), false)
		win.umami = { track: (name, data) => envois.push([name, data]) }
		script().emettre('load')
		assert.deepEqual(envois, [])
	})

	test(`at most ${WAITING_ROOM_MAX} events wait`, () => {
		const { win, envois, arrivee } = fenetreEnAttente()
		const attendre = umamiLoader(win, ATTRIBUTS, WAITING_ROOM_MAX)
		const gardes = Array.from({ length: WAITING_ROOM_MAX + 5 }, (_, i) =>
			attendre('search_result_click', { rank: i + 1 })
		)
		assert.equal(gardes.filter(Boolean).length, WAITING_ROOM_MAX)
		assert.equal(gardes[WAITING_ROOM_MAX], false)
		arrivee()
		assert.equal(envois.length, WAITING_ROOM_MAX)
		assert.deepEqual(envois[0], ['search_result_click', { rank: 1 }])
	})

	test('a failing event never stops the others, a script without umami throws nothing', () => {
		const { win, script } = fenetreEnAttente()
		const attendre = umamiLoader(win, ATTRIBUTS, 20)
		attendre('a', {})
		attendre('b', {})
		const envois = []
		win.umami = {
			track: name => {
				envois.push(name)
				if (name === 'a') throw new Error('boom')
			},
		}
		script().emettre('load')
		assert.deepEqual(envois, ['a', 'b'])

		const sansUmami = fenetreEnAttente()
		umamiLoader(sansUmami.win, ATTRIBUTS, 20)('a', {})
		assert.doesNotThrow(() => sansUmami.script().emettre('load'))
	})
})

describe('umamiLoaderScript (inlined by _document)', () => {
	const run = (attributs = ATTRIBUTS) => {
		const attente = fenetreEnAttente()
		vm.runInNewContext(umamiLoaderScript(attributs), { window: attente.win })
		return attente
	}

	test('defines the filter and the waiting room, then adds the Umami script', () => {
		const { win, envois, arrivee, script } = run()
		assert.equal(typeof win[BEFORE_SEND_NAME], 'function')
		assert.equal(WAITING_ROOM_NAME, 'mmAttenteUmami')
		assert.deepEqual(script().attributs, ATTRIBUTS)
		assert.equal(script().async, true)
		assert.equal(win[WAITING_ROOM_NAME]('not_found', { kind: 'autre' }), true)
		arrivee()
		assert.deepEqual(envois, [['not_found', { kind: 'autre' }]])
		assert.equal(win[WAITING_ROOM_NAME]('not_found', { kind: 'autre' }), false)
	})

	test(`keeps ${WAITING_ROOM_MAX} events at most`, () => {
		const { win } = run()
		const gardes = Array.from({ length: 30 }, () =>
			win[WAITING_ROOM_NAME]('a', {})
		)
		assert.equal(gardes.filter(Boolean).length, WAITING_ROOM_MAX)
	})

	test('no value can close the inline <script> it lives in', () => {
		const tag = '</script><script>alert(1)//'
		const source = umamiLoaderScript({ ...ATTRIBUTS, 'data-tag': tag })
		assert.doesNotMatch(source, /<\/script/i)
		assert.equal(
			run({ ...ATTRIBUTS, 'data-tag': tag }).script().attributs['data-tag'],
			tag
		)
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

describe('proxy headers (src/middleware.js)', () => {
	const fromTraefik = (extra = {}) =>
		new Headers({
			host: 'my-makeup.fr',
			'user-agent': CHROME,
			'content-type': 'application/json',
			'x-umami-cache': 'jeton-cache',
			'x-forwarded-for': '203.0.113.7',
			'x-real-ip': '203.0.113.7',
			cookie: '__Secure-next-auth.session-token=jeton-de-session',
			referer: 'https://my-makeup.fr/search?search=mariage',
			...extra,
		})

	test('the two proxied paths, never the rest of the instance', () => {
		assert.deepEqual(UMAMI_PROXY_PATHS, ['/u/script.js', '/u/api/send'])
	})

	test('no cookie, no credentials, no Referer go to Umami', () => {
		const headers = umamiProxyHeaders(
			fromTraefik({ authorization: 'Bearer x', 'proxy-authorization': 'y' })
		)
		for (const name of [
			'cookie',
			'authorization',
			'proxy-authorization',
			'referer',
		])
			assert.equal(headers.has(name), false, name)
	})

	test('what Umami needs goes along: user agent, body type, cache token', () => {
		const headers = umamiProxyHeaders(fromTraefik())
		assert.equal(headers.get('user-agent'), CHROME)
		assert.equal(headers.get('content-type'), 'application/json')
		assert.equal(headers.get('x-umami-cache'), 'jeton-cache')
		assert.equal(headers.get('host'), 'my-makeup.fr')
	})

	test("the visitor's IP in True-Client-IP, read by Umami before X-Real-IP", () => {
		const headers = umamiProxyHeaders(fromTraefik())
		assert.equal(headers.get('true-client-ip'), '203.0.113.7')
		// Umami does not need it a second time
		assert.equal(headers.has('x-forwarded-for'), false)
		assert.equal(headers.has('x-real-ip'), false)
	})

	test('addresses and countries sent by the browser itself are dropped', () => {
		const headers = umamiProxyHeaders(
			fromTraefik({
				'x-forwarded-for': '198.51.100.1, 203.0.113.7',
				'true-client-ip': '198.51.100.1',
				'cf-connecting-ip': '198.51.100.1',
				'x-client-ip': '198.51.100.1',
				forwarded: 'for=198.51.100.1',
				'cf-ipcountry': 'US',
				'x-vercel-ip-country': 'US',
			})
		)
		assert.equal(headers.get('true-client-ip'), '203.0.113.7')
		for (const name of [
			'x-forwarded-for',
			'cf-connecting-ip',
			'x-client-ip',
			'forwarded',
			'cf-ipcountry',
			'x-vercel-ip-country',
		])
			assert.equal(headers.has(name), false, name)
	})

	test('without a usable address, no IP header at all', () => {
		const headers = umamiProxyHeaders(
			new Headers({ 'x-forwarded-for': 'unknown', 'x-real-ip': '<script>' })
		)
		assert.equal(headers.has('true-client-ip'), false)
		assert.equal(headers.has('x-forwarded-for'), false)
	})

	test('visitorIp: last X-Forwarded-For entry, else X-Real-IP', () => {
		assert.equal(
			visitorIp(
				new Headers({ 'x-forwarded-for': '198.51.100.1, 2001:db8::1' })
			),
			'2001:db8::1'
		)
		assert.equal(
			visitorIp(new Headers({ 'x-real-ip': '::ffff:127.0.0.1' })),
			'::ffff:127.0.0.1'
		)
		assert.equal(visitorIp(new Headers()), null)
	})
})
