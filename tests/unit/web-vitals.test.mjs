import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	DEFAULT_WEB_VITALS_SAMPLE,
	WEB_VITALS_EVENT,
	webVitalData,
	webVitalPage,
	webVitalRating,
	webVitalsSampleRate,
	webVitalsSampled,
} from '../../src/lib/web-vitals.js'
import { looksPersonal, trackWebVital } from '../../src/lib/analytics.js'

const fakeUmami = () => {
	const calls = []
	return {
		calls,
		win: {
			navigator: { webdriver: false },
			umami: { track: (name, data) => calls.push([name, data]) },
		},
	}
}

describe('sampling (NEXT_PUBLIC_WEB_VITALS_SAMPLE)', () => {
	test('10 % by default', () => {
		assert.equal(DEFAULT_WEB_VITALS_SAMPLE, 0.1)
		for (const raw of [undefined, null, '', '  '])
			assert.equal(webVitalsSampleRate(raw), 0.1, String(raw))
	})

	test('a share from 0 to 1, anything else falls back to 10 %', () => {
		assert.equal(webVitalsSampleRate('0.25'), 0.25)
		assert.equal(webVitalsSampleRate('1'), 1)
		assert.equal(webVitalsSampleRate('0'), 0)
		for (const raw of ['10', '-0.1', 'abc', 'Infinity', '10 %'])
			assert.equal(webVitalsSampleRate(raw), 0.1, raw)
	})

	test('one draw decides for the whole page load', () => {
		assert.equal(webVitalsSampled(undefined, 0.05), true)
		assert.equal(webVitalsSampled(undefined, 0.1), false)
		assert.equal(webVitalsSampled(undefined, 0.99), false)
		assert.equal(webVitalsSampled('1', 0.999), true)
		assert.equal(webVitalsSampled('0', 0), false)
	})

	test('about 10 % of page loads over many draws', () => {
		let sampled = 0
		for (let i = 0; i < 10_000; i++)
			if (webVitalsSampled(undefined, i / 10_000)) sampled++
		assert.equal(sampled, 1000)
	})
})

describe('webVitalData', () => {
	test('name, rounded value, rating and page of a metric', () => {
		assert.deepEqual(
			webVitalData({ name: 'LCP', value: 2481.6, rating: 'good' }, '/'),
			{ name: 'LCP', value: 2482, rating: 'good', page: '/' }
		)
		assert.deepEqual(
			webVitalData(
				{ name: 'CLS', value: 0.123456, rating: 'needs-improvement' },
				'/profil/testine-recette'
			),
			{
				name: 'CLS',
				value: 0.123,
				rating: 'needs-improvement',
				page: '/profil/testine-recette',
			}
		)
	})

	test('the rating comes from the thresholds when the metric has none', () => {
		assert.equal(webVitalData({ name: 'INP', value: 180 }, '/').rating, 'good')
		assert.equal(
			webVitalData({ name: 'TTFB', value: 1200, rating: 'meh' }, '/').rating,
			'needs-improvement'
		)
		assert.equal(webVitalData({ name: 'FCP', value: 3001 }, '/').rating, 'poor')
	})

	test('thresholds of web.dev, limits included in the better rating', () => {
		const cases = [
			['LCP', 2500, 'good'],
			['LCP', 4000, 'needs-improvement'],
			['LCP', 4001, 'poor'],
			['CLS', 0.1, 'good'],
			['CLS', 0.25, 'needs-improvement'],
			['CLS', 0.26, 'poor'],
			['INP', 200, 'good'],
			['INP', 500, 'needs-improvement'],
			['FCP', 1800, 'good'],
			['TTFB', 800, 'good'],
			['TTFB', 1801, 'poor'],
		]
		for (const [name, value, rating] of cases)
			assert.equal(webVitalRating(name, value), rating, `${name} ${value}`)
	})

	test('the page is a path, without query string nor hash, 99 characters at most', () => {
		assert.equal(
			webVitalPage('/search?search=mariage&city=Annecy#x'),
			'/search'
		)
		assert.equal(webVitalPage('/' + 'a'.repeat(200)).length, 99)
		assert.equal(webVitalPage('https://my-makeup.fr/'), null)
		assert.equal(webVitalPage(undefined), null)
	})

	test('FID, the Next.js marks and invalid values are not sent', () => {
		for (const metric of [
			{ name: 'FID', value: 12 },
			{ name: 'Next.js-hydration', value: 120 },
			{ name: 'LCP', value: -1 },
			{ name: 'LCP', value: Number.NaN },
			{ name: 'LCP', value: '1200' },
			{ name: 'LCP' },
			null,
			'LCP',
		])
			assert.equal(webVitalData(metric, '/'), null, JSON.stringify(metric))
		assert.equal(webVitalData({ name: 'LCP', value: 1 }, ''), null)
	})

	test('no value can carry an email or a phone number', () => {
		const data = webVitalData(
			{ name: 'LCP', value: 123456789.4, rating: 'poor' },
			'/'
		)
		for (const value of Object.values(data)) {
			if (typeof value === 'string')
				assert.equal(looksPersonal(value), false, value)
		}
	})
})

describe('trackWebVital', () => {
	test('hands a `web-vitals` event to Umami in production', () => {
		const { calls, win } = fakeUmami()
		assert.equal(WEB_VITALS_EVENT, 'web-vitals')
		assert.equal(
			trackWebVital({ name: 'TTFB', value: 312.4, rating: 'good' }, '/blog', {
				win,
				production: true,
			}),
			true
		)
		assert.deepEqual(calls, [
			[
				'web-vitals',
				{ name: 'TTFB', value: 312, rating: 'good', page: '/blog' },
			],
		])
	})

	test('an early metric (FCP, TTFB) waits for the Umami script', () => {
		const attente = []
		const win = {
			navigator: { webdriver: false },
			mmAttenteUmami: (name, data) => attente.push([name, data]) > 0,
		}
		assert.equal(
			trackWebVital({ name: 'FCP', value: 812.6, rating: 'good' }, '/', {
				win,
				production: true,
			}),
			true
		)
		assert.deepEqual(attente, [
			['web-vitals', { name: 'FCP', value: 813, rating: 'good', page: '/' }],
		])
	})

	test('same guards as track: production, Umami, no automated browser', () => {
		const { calls, win } = fakeUmami()
		const metric = { name: 'LCP', value: 1000, rating: 'good' }
		assert.equal(trackWebVital(metric, '/', { win, production: false }), false)
		assert.equal(
			trackWebVital(metric, '/', { win: {}, production: true }),
			false
		)
		win.navigator.webdriver = true
		assert.equal(trackWebVital(metric, '/', { win, production: true }), false)
		assert.deepEqual(calls, [])
	})

	test('a page that looks personal, or a throwing Umami, sends nothing', () => {
		const { calls, win } = fakeUmami()
		const metric = { name: 'LCP', value: 1000, rating: 'good' }
		assert.equal(
			trackWebVital(metric, '/profil/a@b.fr', { win, production: true }),
			false
		)
		assert.equal(
			trackWebVital(metric, '/', {
				win: {
					umami: {
						track: () => {
							throw new Error('boom')
						},
					},
				},
				production: true,
			}),
			false
		)
		assert.deepEqual(calls, [])
		assert.equal(trackWebVital(metric, '/'), false)
	})
})
