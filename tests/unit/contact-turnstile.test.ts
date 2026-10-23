import { describe, expect, test } from 'bun:test'
import type { ContactMessage } from '@/lib/contact/message'
import { type RequestStorage, saveContactMessage } from '@/lib/contact/payload-send'
import { createContactRateLimits } from '@/lib/contact/rate-limit'
import {
	createUnverifiedLimits,
	TURNSTILE_TOKEN_FIELD,
	TURNSTILE_UNAVAILABLE_FIELD,
	TURNSTILE_VERIFY_URL,
	verifyTurnstile,
} from '@/lib/contact/turnstile'
import { delay, HttpResponse, http, simulate } from '../support/outgoing-http'

/**
 * Turnstile on the contact form (ticket 1000). The verification is simulated at the HTTP level: the
 * code calls the service by `fetch`, as in production. Made-up values only.
 */

const SECRET = 'secret-de-test-pas-un-vrai'
const form = (extra: Record<string, unknown> = {}) => {
	const values: Record<string, unknown> = {
		prenom: 'Camille',
		nom: 'Exemple',
		email: 'camille@example.test',
		telephone: '',
		message: 'Un message de test',
		...extra,
	}
	return { get: (name: string) => values[name] }
}

function bench(options: { delayMs?: number } = {}) {
	const created: ContactMessage[] = []
	const jobs: Promise<void>[] = []
	const storage: RequestStorage = {
		creer: async message => {
			created.push(message)
			return created.length
		},
		marquer: async () => {},
	}
	const limits = createContactRateLimits(crypto.randomUUID())
	const unverified = createUnverifiedLimits(crypto.randomUUID())
	return {
		created,
		unverified,
		send: (extra: Record<string, unknown> = {}, client = '203.0.113.9') =>
			saveContactMessage({
				formulaire: form(extra),
				stockage: storage,
				envoyer: async () => {},
				destinataire: 'equipe@example.test',
				client,
				freins: limits,
				apres: travail => void jobs.push(travail()),
				journal: { info: () => {}, erreur: () => {} },
				turnstile: {
					secret: SECRET,
					unverified,
					...(options.delayMs !== undefined && { deadlineMs: options.delayMs }),
				},
			}),
	}
}

const answers = (success: boolean) => http.post(TURNSTILE_VERIFY_URL, () => HttpResponse.json({ success }))

describe('verifyTurnstile', () => {
	test('a token Cloudflare accepts passes, and the secret and the token go in the body', async () => {
		let body = ''
		simulate(
			http.post(TURNSTILE_VERIFY_URL, async ({ request }) => {
				body = await request.text()
				return HttpResponse.json({ success: true })
			})
		)
		expect(await verifyTurnstile(SECRET, 'jeton-1')).toBe('passed')
		const sent = new URLSearchParams(body)
		expect(sent.get('secret')).toBe(SECRET)
		expect(sent.get('response')).toBe('jeton-1')
		expect(sent.has('remoteip')).toBe(false)
	})

	test('a token Cloudflare refuses (or one already spent) is rejected', async () => {
		simulate(
			http.post(TURNSTILE_VERIFY_URL, () =>
				HttpResponse.json({ success: false, 'error-codes': ['timeout-or-duplicate'] })
			)
		)
		expect(await verifyTurnstile(SECRET, 'jeton-rejoue')).toBe('rejected')
	})

	test.each([
		['a 500', () => simulate(http.post(TURNSTILE_VERIFY_URL, () => new HttpResponse(null, { status: 500 })))],
		['a cut network', () => simulate(http.post(TURNSTILE_VERIFY_URL, () => HttpResponse.error()))],
		['an unreadable answer', () => simulate(http.post(TURNSTILE_VERIFY_URL, () => new HttpResponse('<html>')))],
		[
			'a silent service',
			() =>
				simulate(
					http.post(TURNSTILE_VERIFY_URL, async () => {
						await delay('infinite')
						return HttpResponse.json({ success: true })
					})
				),
		],
	])('%s is « unavailable », never an error', async (_name, declare) => {
		declare()
		expect(await verifyTurnstile(SECRET, 'jeton', 50)).toBe('unavailable')
	})

	test('an invalid secret reported by Cloudflare is « unavailable » (our fault, not the visitor’s)', async () => {
		simulate(
			http.post(TURNSTILE_VERIFY_URL, () =>
				HttpResponse.json({ success: false, 'error-codes': ['invalid-input-secret'] })
			)
		)
		expect(await verifyTurnstile(SECRET, 'jeton')).toBe('unavailable')
	})
})

describe('the contact flow with Turnstile', () => {
	test('a verified token stores the message', async () => {
		simulate(answers(true))
		const b = bench()
		expect(await b.send({ [TURNSTILE_TOKEN_FIELD]: 'jeton-ok' })).toEqual({ ok: true })
		expect(b.created).toHaveLength(1)
	})

	test('a rejected token stores nothing and says the check failed', async () => {
		simulate(answers(false))
		const b = bench()
		expect(await b.send({ [TURNSTILE_TOKEN_FIELD]: 'jeton-refuse' })).toEqual({
			ok: false,
			code: 'verification-echouee',
		})
		expect(b.created).toHaveLength(0)
	})

	test('no token and no word about an outage stores nothing, and never calls Cloudflare', async () => {
		let calls = 0
		simulate(
			http.post(TURNSTILE_VERIFY_URL, () => {
				calls++
				return HttpResponse.json({ success: true })
			})
		)
		const b = bench()
		expect(await b.send()).toEqual({ ok: false, code: 'verification-echouee' })
		expect(b.created).toHaveLength(0)
		expect(calls).toBe(0)
	})

	test('a message with errors is answered with its errors, before the token is spent', async () => {
		let calls = 0
		simulate(
			http.post(TURNSTILE_VERIFY_URL, () => {
				calls++
				return HttpResponse.json({ success: true })
			})
		)
		const b = bench()
		const result = await b.send({ email: 'pas-une-adresse', [TURNSTILE_TOKEN_FIELD]: 'jeton' })
		expect(result).toMatchObject({ ok: false, code: 'donnees-invalides' })
		expect(calls).toBe(0)
	})

	test('the trap field still wins: nothing is verified, stored or sent', async () => {
		let calls = 0
		simulate(
			http.post(TURNSTILE_VERIFY_URL, () => {
				calls++
				return HttpResponse.json({ success: true })
			})
		)
		const b = bench()
		expect(await b.send({ commentaire: 'http://spam.example.test' })).toEqual({ ok: true })
		expect(calls).toBe(0)
		expect(b.created).toHaveLength(0)
	})

	test('Cloudflare down with a token: the message passes, under the tight brake (2 an hour by address)', async () => {
		simulate(http.post(TURNSTILE_VERIFY_URL, () => new HttpResponse(null, { status: 503 })))
		const b = bench()
		expect(await b.send({ [TURNSTILE_TOKEN_FIELD]: 'jeton' })).toEqual({ ok: true })
		expect(await b.send({ [TURNSTILE_TOKEN_FIELD]: 'jeton', email: 'autre@example.test' })).toEqual({ ok: true })
		const third = await b.send({ [TURNSTILE_TOKEN_FIELD]: 'jeton', email: 'encore@example.test' })
		expect(third).toMatchObject({ ok: false, code: 'trop-de-messages' })
		expect(b.created).toHaveLength(2)
	})

	test('a widget that could not load (outage claimed, no token) passes under the same tight brake', async () => {
		let calls = 0
		simulate(
			http.post(TURNSTILE_VERIFY_URL, () => {
				calls++
				return HttpResponse.json({ success: true })
			})
		)
		const b = bench()
		expect(await b.send({ [TURNSTILE_UNAVAILABLE_FIELD]: '1' })).toEqual({ ok: true })
		expect(await b.send({ [TURNSTILE_UNAVAILABLE_FIELD]: '1', email: 'autre@example.test' })).toEqual({ ok: true })
		expect(await b.send({ [TURNSTILE_UNAVAILABLE_FIELD]: '1', email: 'encore@example.test' })).toMatchObject({
			ok: false,
			code: 'trop-de-messages',
		})
		expect(calls).toBe(0)
	})

	test('the unverified path has a global ceiling too, so many addresses cannot flood it', async () => {
		const b = bench()
		let passed = 0
		for (let i = 0; i < 40; i++) {
			const result = await b.send(
				{ [TURNSTILE_UNAVAILABLE_FIELD]: '1', email: `p${i}@example.test` },
				`198.51.100.${i}`
			)
			if (result.ok) passed++
		}
		expect(passed).toBe(30)
	})

	test('a silent Cloudflare does not hold the visitor: the answer comes within the deadline', async () => {
		simulate(
			http.post(TURNSTILE_VERIFY_URL, async () => {
				await delay('infinite')
				return HttpResponse.json({ success: true })
			})
		)
		const b = bench({ delayMs: 50 })
		const started = Date.now()
		expect(await b.send({ [TURNSTILE_TOKEN_FIELD]: 'jeton' })).toEqual({ ok: true })
		expect(Date.now() - started).toBeLessThan(1500)
	})
})
