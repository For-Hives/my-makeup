import { describe, expect, test } from 'bun:test'
import { ATTEMPT_LIMIT_SECONDS, ATTEMPTS, attemptCommand, installWithRetries } from '../../scripts/ci/browser-install'

describe('the install of the browser in the CI (ticket 312)', () => {
	test('an attempt that succeeds is the only one', async () => {
		const limits: number[] = []
		const made = await installWithRetries(async limit => {
			limits.push(limit)
			return true
		})

		expect(made).toBe(1)
		expect(limits).toEqual([ATTEMPT_LIMIT_SECONDS])
	})

	test('a stalled attempt is made again, and the third one may be the good one', async () => {
		const said: string[] = []
		let calls = 0
		const made = await installWithRetries(
			async () => {
				calls += 1
				return calls === 3
			},
			{ say: line => said.push(line) }
		)

		expect(made).toBe(3)
		expect(said).toHaveLength(2)
		expect(said[0]).toContain('attempt 1 of 3')
	})

	test('three failed attempts fail the command: no browser never passes', async () => {
		let calls = 0
		const made = await installWithRetries(
			async () => {
				calls += 1
				return false
			},
			{ say: () => undefined }
		)

		expect(made).toBe(0)
		expect(calls).toBe(ATTEMPTS)
	})

	test('one attempt cuts the whole group after its limit, and installs the browser with its libraries', () => {
		const command = attemptCommand(150)

		expect(command.slice(0, 3)).toEqual(['timeout', '--kill-after=10', '150'])
		expect(command.slice(3).join(' ')).toBe('bunx playwright install --with-deps chromium')
		expect(ATTEMPT_LIMIT_SECONDS * ATTEMPTS).toBeLessThan(10 * 60)
	})
})
