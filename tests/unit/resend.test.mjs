import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	RESEND_EMAILS_URL,
	RESEND_TIMEOUT_MS,
	resendRequest,
	sendWithResend,
} from '../../src/lib/resend.js'

const email = {
	key: 're_cle_factice',
	from: 'My Makeup <contact@send.example.test>',
	to: 'boite@example.test',
	replyTo: 'testine@example.test',
	subject: 'Nouveau message de contact',
	text: 'Bonjour',
}

// fake fetch: records the calls, answers with the given status and body
function faux(status, corps = { id: 'id-factice' }) {
	const appels = []
	const fetchImpl = async (url, init) => {
		appels.push({ url, init })
		return new Response(JSON.stringify(corps), {
			status,
			headers: { 'content-type': 'application/json' },
		})
	}
	return { appels, fetchImpl }
}

// never answers: rejects only when the request is aborted
const muet = (url, init) =>
	new Promise((resolve, reject) => {
		init.signal.addEventListener('abort', () => reject(init.signal.reason))
	})

describe('resendRequest', () => {
	test('POST /emails with the key as a bearer token and a JSON body', () => {
		const { url, init } = resendRequest(email)
		assert.equal(url, 'https://api.resend.com/emails')
		assert.equal(url, RESEND_EMAILS_URL)
		assert.equal(init.method, 'POST')
		assert.deepEqual(init.headers, {
			Authorization: 'Bearer re_cle_factice',
			'Content-Type': 'application/json',
			'User-Agent': 'my-makeup',
		})
		assert.deepEqual(JSON.parse(init.body), {
			from: 'My Makeup <contact@send.example.test>',
			to: 'boite@example.test',
			reply_to: 'testine@example.test',
			subject: 'Nouveau message de contact',
			text: 'Bonjour',
		})
		assert.equal(init.redirect, 'manual')
	})

	test('the key is in the Authorization header only, never in the body', () => {
		const { init } = resendRequest(email)
		assert.equal(init.body.includes('re_cle_factice'), false)
	})
})

describe('sendWithResend', () => {
	test('2xx: sent, with the status only', async () => {
		const { appels, fetchImpl } = faux(200)
		assert.deepEqual(await sendWithResend(email, { fetchImpl }), {
			ok: true,
			status: 200,
		})
		assert.equal(appels.length, 1)
		assert.equal(appels[0].url, RESEND_EMAILS_URL)
		assert.ok(appels[0].init.signal instanceof AbortSignal, 'avec un délai')
	})

	test('4xx and 5xx: kind http and the status, never the answer', async () => {
		for (const status of [400, 401, 403, 422, 429, 500, 503]) {
			const { fetchImpl } = faux(status, {
				statusCode: status,
				name: 'validation_error',
				message: 'Invalid `to` field: testine@example.test',
			})
			assert.deepEqual(
				await sendWithResend(email, { fetchImpl }),
				{ ok: false, kind: 'http', status },
				String(status)
			)
		}
	})

	test('a redirect is not followed: kind http with its status', async () => {
		const appels = []
		const fetchImpl = async (url, init) => {
			appels.push(init.redirect)
			return new Response(null, {
				status: 308,
				headers: { location: 'https://ailleurs.example.test/emails' },
			})
		}
		assert.deepEqual(await sendWithResend(email, { fetchImpl }), {
			ok: false,
			kind: 'http',
			status: 308,
		})
		assert.deepEqual(appels, ['manual'])
	})

	test('no answer within the delay: aborted, kind timeout', async () => {
		const debut = Date.now()
		assert.deepEqual(
			await sendWithResend(email, { fetchImpl: muet, timeoutMs: 50 }),
			{ ok: false, kind: 'timeout', status: 0 }
		)
		const duree = Date.now() - debut
		assert.ok(duree >= 45 && duree < 2000, `${duree} ms`)
	})

	test('the delay is 10 s by default', () => {
		assert.equal(RESEND_TIMEOUT_MS, 10_000)
	})

	test('no HTTP answer (DNS, refused connection): kind network', async () => {
		const enPanne = async () => {
			throw new TypeError('fetch failed', {
				cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), {
					code: 'ENOTFOUND',
				}),
			})
		}
		assert.deepEqual(await sendWithResend(email, { fetchImpl: enPanne }), {
			ok: false,
			kind: 'network',
			status: 0,
		})
	})

	test('the timer is cleared once answered: the request is never aborted afterwards', async () => {
		const { appels, fetchImpl } = faux(200)
		await sendWithResend(email, { fetchImpl, timeoutMs: 30 })
		await new Promise(resolve => setTimeout(resolve, 60))
		assert.equal(appels[0].init.signal.aborted, false)
	})
})
