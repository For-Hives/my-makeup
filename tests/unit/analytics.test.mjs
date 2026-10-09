import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	CONTACT_CHANNELS,
	EVENTS,
	SOURCES_ORIGINE,
	demandeEnvoyeeProps,
	eventData,
	isMeasureDisabled,
	isRepeat,
	looksPersonal,
	notFoundKind,
	onboardingStepName,
	referrerDomain,
	resultsBucket,
	setMeasureDisabled,
	shouldTrackContact,
	track,
	umamiAttributes,
} from '../../src/lib/analytics.js'

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

const fakeStorage = () => {
	const map = new Map()
	return {
		getItem: key => (map.has(key) ? map.get(key) : null),
		setItem: (key, value) => map.set(key, String(value)),
		removeItem: key => map.delete(key),
	}
}

describe('catalogue (plans/04 §3.3)', () => {
	test('event names are snake_case and at most 50 characters', () => {
		for (const name of Object.keys(EVENTS)) {
			assert.match(name, /^[a-z]+(_[a-z]+)*$/)
			assert.ok(name.length <= 50)
		}
	})

	test('contact channels match the plan', () => {
		assert.deepEqual(CONTACT_CHANNELS, [
			'email',
			'phone',
			'instagram',
			'facebook',
			'linkedin',
			'youtube',
			'website',
		])
	})

	test('unknown event or unknown property drops the event', () => {
		assert.equal(eventData('page_view', {}), null)
		assert.equal(
			eventData('contact_click', { pid: 4, channel: 'email', name: 'x' }),
			null
		)
	})

	test('missing required property drops the event', () => {
		assert.equal(eventData('contact_click', { channel: 'email' }), null)
		assert.equal(
			eventData('search_submit', { has_city: true, from: 'lien' }),
			null
		)
	})

	test('value outside the closed list drops the event', () => {
		assert.equal(
			eventData('contact_click', { pid: 4, channel: 'whatsapp' }),
			null
		)
		assert.equal(eventData('not_found', { kind: 'admin' }), null)
	})

	test('pid is a Strapi id, normalized to a string, never an email or a phone', () => {
		assert.deepEqual(
			eventData('contact_click', { pid: 42, channel: 'phone' }),
			{
				pid: '42',
				channel: 'phone',
			}
		)
		assert.deepEqual(
			eventData('contact_click', { pid: '42', channel: 'email' }),
			{
				pid: '42',
				channel: 'email',
			}
		)
		for (const pid of [
			'a@b.fr',
			'0612345678',
			'-1',
			'0',
			'abc',
			1.5,
			'123456789',
		]) {
			assert.equal(
				eventData('contact_click', { pid, channel: 'email' }),
				null,
				String(pid)
			)
		}
	})

	test('integers and booleans are type-checked', () => {
		assert.deepEqual(
			eventData('platform_contact_submit', { ok: false, status: 500 }),
			{
				ok: false,
				status: 500,
			}
		)
		assert.equal(
			eventData('platform_contact_submit', { ok: 'true', status: 200 }),
			null
		)
		assert.equal(
			eventData('platform_contact_submit', { ok: true, status: 700 }),
			null
		)
		assert.equal(eventData('search_result_click', { rank: 0, pid: 3 }), null)
	})

	test('optional pid of demande_envoyee may be absent', () => {
		assert.deepEqual(eventData('demande_envoyee', { source: 'b2b' }), {
			source: 'b2b',
		})
	})
})

describe('looksPersonal', () => {
	test('flags emails and phone numbers, with or without separators', () => {
		for (const value of [
			'a@b.fr',
			'0612345678',
			'06 12 34 56 78',
			'+33 6.12.34.56.78',
		]) {
			assert.equal(looksPersonal(value), true, value)
		}
	})

	test('lets ids, buckets and closed values through', () => {
		for (const value of [
			'42',
			'12345678',
			'21+',
			'6-20',
			'instagram',
			true,
			404,
		]) {
			assert.equal(looksPersonal(value), false, String(value))
		}
	})
})

describe('umamiAttributes', () => {
	test('builds data-umami-event attributes with string values', () => {
		assert.deepEqual(
			umamiAttributes('contact_click', { pid: 7, channel: 'website' }),
			{
				'data-umami-event': 'contact_click',
				'data-umami-event-pid': '7',
				'data-umami-event-channel': 'website',
			}
		)
	})

	test('returns nothing to spread when the event is invalid', () => {
		assert.deepEqual(
			umamiAttributes('contact_click', { pid: 'x@y.fr', channel: 'email' }),
			{}
		)
	})

	test('no attribute value of any channel can carry an email or a phone', () => {
		for (const channel of CONTACT_CHANNELS) {
			const values = Object.values(
				umamiAttributes('contact_click', { pid: 12, channel })
			)
			assert.ok(values.length === 3)
			for (const value of values) assert.equal(looksPersonal(value), false)
		}
	})
})

describe('track', () => {
	test('hands a valid event to Umami in production', () => {
		const { calls, win } = fakeUmami()
		assert.equal(
			track(
				'search_submit',
				{ has_city: true, results: '1-5', from: 'lien' },
				{ win, production: true }
			),
			true
		)
		assert.deepEqual(calls, [
			['search_submit', { has_city: true, results: '1-5', from: 'lien' }],
		])
	})

	test('does nothing outside production, without Umami, or in an automated browser', () => {
		const { calls, win } = fakeUmami()
		assert.equal(
			track('not_found', { kind: 'profil' }, { win, production: false }),
			false
		)
		assert.equal(
			track('not_found', { kind: 'profil' }, { win: {}, production: true }),
			false
		)
		assert.equal(
			track(
				'not_found',
				{ kind: 'profil' },
				{ win: undefined, production: true }
			),
			false
		)
		win.navigator.webdriver = true
		assert.equal(
			track('not_found', { kind: 'profil' }, { win, production: true }),
			false
		)
		assert.deepEqual(calls, [])
	})

	test('before the Umami script ran, the event waits for it (mmAttenteUmami)', () => {
		const attente = []
		const win = {
			navigator: { webdriver: false },
			mmAttenteUmami: (name, data) => attente.push([name, data]) > 0,
		}
		assert.equal(
			track('not_found', { kind: 'autre' }, { win, production: true }),
			true
		)
		assert.deepEqual(attente, [['not_found', { kind: 'autre' }]])
		// once Umami is there, it gets the event itself
		const { calls, win: avecUmami } = fakeUmami()
		avecUmami.mmAttenteUmami = (name, data) => attente.push([name, data]) > 0
		track('not_found', { kind: 'blog' }, { win: avecUmami, production: true })
		assert.deepEqual(calls, [['not_found', { kind: 'blog' }]])
		assert.equal(attente.length, 1)
	})

	test('a full or closed waiting room, an automated browser: nothing waits', () => {
		const attente = []
		const refuse = { navigator: {}, mmAttenteUmami: () => false }
		assert.equal(
			track('not_found', { kind: 'autre' }, { win: refuse, production: true }),
			false
		)
		const win = {
			navigator: { webdriver: true },
			mmAttenteUmami: (name, data) => attente.push([name, data]) > 0,
		}
		assert.equal(
			track('not_found', { kind: 'autre' }, { win, production: true }),
			false
		)
		win.navigator.webdriver = false
		assert.equal(
			track('not_found', { kind: 'autre' }, { win, production: false }),
			false
		)
		assert.equal(
			track('not_found', { kind: 'x@y.fr' }, { win, production: true }),
			false
		)
		assert.deepEqual(attente, [])
	})

	test('never sends an invalid event and never throws', () => {
		const { calls, win } = fakeUmami()
		assert.equal(
			track(
				'contact_click',
				{ pid: 'a@b.fr', channel: 'email' },
				{ win, production: true }
			),
			false
		)
		const throwing = {
			umami: {
				track: () => {
					throw new Error('boom')
				},
			},
		}
		assert.equal(
			track('not_found', { kind: 'blog' }, { win: throwing, production: true }),
			false
		)
		assert.deepEqual(calls, [])
	})

	test('runs without window (server side)', () => {
		assert.equal(track('not_found', { kind: 'blog' }), false)
	})
})

describe('helpers', () => {
	test('resultsBucket', () => {
		assert.equal(resultsBucket(0), '0')
		assert.equal(resultsBucket(undefined), '0')
		assert.equal(resultsBucket(1), '1-5')
		assert.equal(resultsBucket(5), '1-5')
		assert.equal(resultsBucket(6), '6-20')
		assert.equal(resultsBucket(20), '6-20')
		assert.equal(resultsBucket(21), '21+')
		assert.equal(resultsBucket(500), '21+')
	})

	test('notFoundKind', () => {
		assert.equal(notFoundKind('/profil/zz-inexistant'), 'profil')
		assert.equal(notFoundKind('/talent/x'), 'talent')
		assert.equal(notFoundKind('/blog/x'), 'blog')
		assert.equal(notFoundKind('//profil/x'), 'profil')
		assert.equal(notFoundKind('/wp-login.php'), 'autre')
		assert.equal(notFoundKind(undefined), 'autre')
	})

	test('isRepeat', () => {
		assert.equal(isRepeat(null, 'a', 1000), false)
		assert.equal(isRepeat({ key: 'a', at: 1000 }, 'a', 2000), true)
		assert.equal(isRepeat({ key: 'a', at: 1000 }, 'a', 4000), false)
		assert.equal(isRepeat({ key: 'a', at: 1000 }, 'b', 1500), false)
	})

	test('referrerDomain keeps the host only', () => {
		assert.equal(
			referrerDomain('https://www.Instagram.com/p/abc?x=1'),
			'www.instagram.com'
		)
		assert.equal(
			referrerDomain('http://localhost:3000/search?search=x'),
			'localhost'
		)
		assert.equal(referrerDomain(''), '')
		assert.equal(referrerDomain('android-app://com.google'), '')
		assert.equal(referrerDomain(undefined), '')
	})

	test('onboardingStepName', () => {
		assert.equal(onboardingStepName(1), 'verification_email')
		assert.equal(onboardingStepName(2), null)
		assert.equal(onboardingStepName(3), 'compte_cree')
		assert.equal(onboardingStepName(4), 'termine')
	})

	test('demandeEnvoyeeProps sanitizes the redirect query', () => {
		assert.deepEqual(demandeEnvoyeeProps({ pid: '12', source: 'profil' }), {
			source: 'profil',
			pid: '12',
		})
		assert.deepEqual(
			demandeEnvoyeeProps({ pid: 'a@b.fr', source: '<script>' }),
			{ source: 'autre' }
		)
		assert.deepEqual(
			demandeEnvoyeeProps({ pid: ['3', '4'], source: ['b2b'] }),
			{ source: 'b2b', pid: '3' }
		)
		assert.deepEqual(demandeEnvoyeeProps(), { source: 'autre' })
		assert.notEqual(
			eventData(
				'demande_envoyee',
				demandeEnvoyeeProps({ pid: '5', source: 'x' })
			),
			null
		)
	})
})

describe('shouldTrackContact (U84)', () => {
	const origin = 'https://my-makeup.fr'
	const profile = { username: 'test-maq', email: 'pro@example.test' }

	test('an anonymous visitor is counted', () => {
		assert.equal(
			shouldTrackContact({ profile, origin, search: '?utm_source=instagram' }),
			true
		)
	})

	test('the owner of the profile is not counted', () => {
		assert.equal(
			shouldTrackContact({ profile, viewer: { name: 'Test-Maq ' }, origin }),
			false
		)
		assert.equal(
			shouldTrackContact({
				profile,
				viewer: { email: 'PRO@example.test' },
				origin,
			}),
			false
		)
	})

	test('another signed-in maquilleuse is counted', () => {
		assert.equal(
			shouldTrackContact({
				profile,
				viewer: { name: 'autre', email: 'autre@example.test' },
				origin,
			}),
			true
		)
	})

	test('a visit coming from /auth/profil is not counted', () => {
		assert.equal(
			shouldTrackContact({
				profile,
				origin,
				referrer: 'https://my-makeup.fr/auth/profil',
			}),
			false
		)
		assert.equal(
			shouldTrackContact({
				profile,
				origin,
				referrer: 'https://other.example/auth/profil',
			}),
			true
		)
	})

	test('a visit from a reminder email is not counted', () => {
		assert.equal(
			shouldTrackContact({ profile, origin, search: '?utm_campaign=relance' }),
			false
		)
	})

	test('empty identities never match', () => {
		assert.equal(
			shouldTrackContact({
				profile: { username: '' },
				viewer: { name: '' },
				origin,
			}),
			true
		)
		assert.equal(shouldTrackContact(), true)
	})
})

describe('measure opt-out (umami.disabled)', () => {
	test('toggles the key Umami reads', () => {
		const storage = fakeStorage()
		assert.equal(isMeasureDisabled(storage), false)
		assert.equal(setMeasureDisabled(storage, true), true)
		assert.equal(storage.getItem('umami.disabled'), '1')
		assert.equal(setMeasureDisabled(storage, false), false)
		assert.equal(storage.getItem('umami.disabled'), null)
	})

	test('survives a missing or throwing storage', () => {
		const broken = {
			getItem: () => {
				throw new Error('denied')
			},
			setItem: () => {
				throw new Error('denied')
			},
			removeItem: () => {},
		}
		assert.equal(isMeasureDisabled(undefined), false)
		assert.equal(setMeasureDisabled(broken, true), false)
	})
})

describe('auth events (A3, A4)', () => {
	test('login_result: method, ok and a code of the closed list', () => {
		assert.deepEqual(
			eventData('login_result', {
				method: 'email',
				ok: false,
				code: 'identifiants-invalides',
			}),
			{ method: 'email', ok: false, code: 'identifiants-invalides' }
		)
		assert.deepEqual(
			eventData('login_result', { method: 'email', ok: true, code: 'ok' }),
			{
				method: 'email',
				ok: true,
				code: 'ok',
			}
		)
		assert.equal(
			eventData('login_result', {
				method: 'email',
				ok: false,
				code: 'Invalid identifier or password',
			}),
			null
		)
		assert.equal(
			eventData('login_result', { method: 'facebook', ok: true, code: 'ok' }),
			null
		)
	})

	test('auth_error: our codes only, never a raw message', () => {
		assert.deepEqual(
			eventData('auth_error', { code: 'email-deja-avec-mot-de-passe' }),
			{
				code: 'email-deja-avec-mot-de-passe',
			}
		)
		assert.equal(eventData('auth_error', { code: 'ok' }), null)
		assert.equal(
			eventData('auth_error', {
				code: "Cannot read properties of undefined (reading 'id')",
			}),
			null
		)
	})

	test('session_expired: where it was detected', () => {
		for (const where of ['api_401', 'jwt_expire', 'middleware'])
			assert.deepEqual(eventData('session_expired', { where }), { where })
		assert.equal(eventData('session_expired', { where: 'ailleurs' }), null)
	})
})

describe('artist space events (UI-01, UI-03, UI-05, MES-12)', () => {
	test('profile_save: a section of the closed list and the outcome', () => {
		assert.deepEqual(
			eventData('profile_save', { section: 'description', ok: true }),
			{ section: 'description', ok: true }
		)
		assert.deepEqual(
			eventData('profile_save', { section: 'onboarding', ok: false }),
			{ section: 'onboarding', ok: false }
		)
		assert.equal(eventData('profile_save', { section: 'bio', ok: true }), null)
		assert.equal(eventData('profile_save', { section: 'description' }), null)
		assert.equal(
			eventData('profile_save', {
				section: 'description',
				ok: true,
				texte: 'Marie',
			}),
			null
		)
	})

	test('upload_error: size, type or server', () => {
		for (const kind of ['size', 'type', 'server'])
			assert.deepEqual(eventData('upload_error', { kind }), { kind })
		assert.equal(eventData('upload_error', { kind: 'IMG_0001.HEIC' }), null)
	})

	test('profile_visibility: the view she switched to, a boolean only (MES-12)', () => {
		assert.deepEqual(eventData('profile_visibility', { visible: true }), {
			visible: true,
		})
		assert.deepEqual(eventData('profile_visibility', { visible: false }), {
			visible: false,
		})
		for (const visible of ['true', 1, 0, null, 'public'])
			assert.equal(
				eventData('profile_visibility', { visible }),
				null,
				String(visible)
			)
		assert.equal(eventData('profile_visibility'), null)
		// nothing about her: no id, no name, no city
		for (const extra of [
			{ pid: '12' },
			{ username: 'testine-recette' },
			{ city: 'Annecy' },
		])
			assert.equal(
				eventData('profile_visibility', { visible: true, ...extra }),
				null
			)
	})

	test('profile_publiable: the new state, a boolean only (MES-12)', () => {
		assert.deepEqual(eventData('profile_publiable', { publiable: true }), {
			publiable: true,
		})
		assert.deepEqual(eventData('profile_publiable', { publiable: false }), {
			publiable: false,
		})
		for (const publiable of ['true', 1, null, 'oui'])
			assert.equal(
				eventData('profile_publiable', { publiable }),
				null,
				String(publiable)
			)
		assert.equal(eventData('profile_publiable'), null)
		for (const extra of [
			{ pid: '12' },
			{ username: 'testine-recette' },
			{ city: 'Annecy' },
			{ score: 13 },
		])
			assert.equal(
				eventData('profile_publiable', { publiable: true, ...extra }),
				null
			)
	})

	test('MES-12 events go through track() with their data only', () => {
		const { calls, win } = fakeUmami()
		assert.equal(
			track('profile_visibility', { visible: true }, { win, production: true }),
			true
		)
		assert.equal(
			track(
				'profile_publiable',
				{ publiable: false },
				{ win, production: true }
			),
			true
		)
		assert.equal(
			track(
				'profile_publiable',
				{ publiable: true, pid: '12' },
				{ win, production: true }
			),
			false
		)
		assert.deepEqual(calls, [
			['profile_visibility', { visible: true }],
			['profile_publiable', { publiable: false }],
		])
	})

	test('account_delete: no property at all', () => {
		assert.deepEqual(eventData('account_delete'), {})
		assert.equal(eventData('account_delete', { email: 'a@b.fr' }), null)
	})

	test('onboarding_source: one answer of the closed list, nothing else', () => {
		// plans/04 §3.3 row 17 without 'maeva' (decisions.md, 09/10)
		assert.deepEqual(SOURCES_ORIGINE, [
			'instagram',
			'google',
			'bouche-a-oreille',
			'ecole',
			'autre',
		])
		assert.deepEqual(eventData('onboarding_source', { source: 'instagram' }), {
			source: 'instagram',
		})
		for (const source of SOURCES_ORIGINE)
			assert.deepEqual(eventData('onboarding_source', { source }), { source })
		assert.equal(eventData('onboarding_source', { source: 'tiktok' }), null)
		assert.equal(eventData('onboarding_source', { source: 'maeva' }), null)
		assert.equal(eventData('onboarding_source', { source: 'Instagram' }), null)
		assert.equal(eventData('onboarding_source', { source: '' }), null)
		assert.equal(eventData('onboarding_source', { source: 'a@b.fr' }), null)
		assert.equal(eventData('onboarding_source', { source: '@maeva' }), null)
		assert.equal(eventData('onboarding_source'), null)
		assert.equal(
			eventData('onboarding_source', { source: 'instagram', pid: '12' }),
			null
		)
		assert.equal(
			eventData('onboarding_source', {
				source: 'autre',
				texte: 'une amie',
			}),
			null
		)
	})
})
