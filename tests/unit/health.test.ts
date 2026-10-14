import { describe, expect, test } from 'bun:test'
import { HEALTH_DATABASE_TIMEOUT_MS, healthPayload, healthResponse } from '../../src/lib/health'
import { deployedVersion } from '../../src/lib/version'

const COMMIT = 'f'.repeat(40)
const VERSIONS = { commit: COMMIT, packageVersion: '1.0.0' }

/** A database error as node-postgres raises it: a code, and a message that names the server. */
function connectionRefused(): Error {
	return Object.assign(new Error('connect ECONNREFUSED 10.0.0.12:5432'), { code: 'ECONNREFUSED' })
}

function expectNeitherCachedNorIndexed(response: Response): void {
	expect(response.headers.get('cache-control')).toBe('no-store')
	expect(response.headers.get('x-robots-tag')).toBe('noindex')
}

describe('healthPayload', () => {
	test('keeps the keys of the live site: ok and version', () => {
		expect(healthPayload({ buildVersion: 'abc1234', commit: COMMIT, packageVersion: '1.0.0' })).toEqual({
			ok: true,
			version: 'abc1234',
		})
		expect(healthPayload()).toEqual({ ok: true, version: 'unknown' })
	})

	test('shows the version of deployedVersion, the short sha of the commit', () => {
		expect(healthPayload(VERSIONS).version).toBe(deployedVersion(VERSIONS))
		expect(healthPayload(VERSIONS).version).toBe('fffffff')
	})
})

describe('healthResponse', () => {
	test('the database answers: 200 with ok and the version, neither cached nor indexed', async () => {
		const lines: string[] = []
		const response = await healthResponse({
			ping: async () => undefined,
			versions: VERSIONS,
			log: line => lines.push(line),
		})

		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('application/json')
		expectNeitherCachedNorIndexed(response)
		expect(await response.json()).toEqual({ ok: true, version: 'fffffff' })
		expect(lines).toEqual([])
	})

	test('the database refuses the connection: 503, a body without any technical detail', async () => {
		const lines: string[] = []
		const response = await healthResponse({
			ping: () => Promise.reject(connectionRefused()),
			versions: VERSIONS,
			log: line => lines.push(line),
		})

		expect(response.status).toBe(503)
		expectNeitherCachedNorIndexed(response)
		// The exact text: no message, no host, no stack, and no version either.
		expect(await response.text()).toBe('{"ok":false}')
		// The server log gets the error code, never the message with its host and port.
		expect(lines).toEqual(['[health] check failed: ECONNREFUSED'])
	})

	test('an error without a usable code is logged as « error », nothing more', async () => {
		const lines: string[] = []
		const failures = [
			new Error('password authentication failed for user "someone"'),
			Object.assign(new Error('odd'), { code: 'host=10.0.0.12 user=someone' }),
			Object.assign(new Error('odd'), { code: 42 }),
			'a string, not an error',
		]
		for (const failure of failures) {
			const response = await healthResponse({ ping: () => Promise.reject(failure), log: line => lines.push(line) })
			expect(response.status).toBe(503)
		}

		expect(lines).toEqual(failures.map(() => '[health] check failed: error'))
	})

	test('a ping that throws before returning a promise is a failure too', async () => {
		const response = await healthResponse({
			ping: () => {
				throw connectionRefused()
			},
			log: () => undefined,
		})

		expect(response.status).toBe(503)
		expect(await response.json()).toEqual({ ok: false })
	})

	test('the database stays silent: 503 at the deadline, without waiting for it', async () => {
		const lines: string[] = []
		const started = performance.now()
		const response = await healthResponse({
			ping: () => new Promise(() => undefined),
			timeoutMs: 50,
			log: line => lines.push(line),
		})
		const elapsed = performance.now() - started

		expect(response.status).toBe(503)
		expectNeitherCachedNorIndexed(response)
		expect(await response.json()).toEqual({ ok: false })
		expect(lines).toEqual(['[health] check failed: timeout'])
		expect(elapsed).toBeLessThan(1000)
		// The deadline of the route itself leaves room to answer in less than 3 seconds.
		expect(HEALTH_DATABASE_TIMEOUT_MS).toBeLessThanOrEqual(2500)
	})

	test('a failure that comes after the deadline changes nothing: one answer, one log line', async () => {
		const lines: string[] = []
		let failLate: (error: Error) => void = () => undefined
		const pending = new Promise<never>((_, reject) => {
			failLate = reject
		})
		const response = await healthResponse({ ping: () => pending, timeoutMs: 20, log: line => lines.push(line) })

		failLate(connectionRefused())
		await pending.catch(() => undefined)
		// One more turn of the event loop: a rejection left unhandled would be reported here.
		await new Promise(resolve => setImmediate(resolve))

		expect(response.status).toBe(503)
		expect(lines).toEqual(['[health] check failed: timeout'])
	})

	test('an answer that comes after the deadline does not turn the 503 into a 200', async () => {
		let answerLate: () => void = () => undefined
		const pending = new Promise<void>(resolve => {
			answerLate = resolve
		})
		const response = await healthResponse({ ping: () => pending, timeoutMs: 20, log: () => undefined })

		answerLate()
		await pending

		expect(response.status).toBe(503)
		expect(await response.json()).toEqual({ ok: false })
	})
})
