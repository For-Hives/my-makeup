import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { DAILY_TASKS, runDailyTasks } from '@/lib/tasks/daily'
import {
	MODERATION_RETENTION_MONTHS,
	moderationPurgeThreshold,
	purgeModerationEvents,
} from '@/lib/tasks/moderation-events'

/** Issue 1005 (decision of 23/10/2026): the moderation journal is kept 60 calendar months. The same lines against the real store: tests/integration/moderation-purge.test.ts. */

describe('moderationPurgeThreshold: sixty calendar months, in UTC', () => {
	test('the retention is five years', () => {
		expect(MODERATION_RETENTION_MONTHS).toBe(60)
	})

	test('the same day, five years earlier', () => {
		expect(moderationPurgeThreshold(new Date('2026-10-15T10:00:00.000Z')).toISOString()).toBe(
			'2021-10-15T10:00:00.000Z'
		)
	})

	test('a 29 February does not spill over into March', () => {
		expect(moderationPurgeThreshold(new Date('2028-02-29T00:00:00.000Z')).toISOString()).toBe(
			'2023-02-28T00:00:00.000Z'
		)
	})
})

describe('the task', () => {
	const NOW = new Date('2026-10-15T10:00:00.000Z')

	function payloadSpy() {
		const calls: unknown[] = []
		const log: string[] = []
		const payload = {
			delete: (args: unknown) => {
				calls.push(args)
				return Promise.resolve({ docs: [{ id: 1 }, { id: 2 }, { id: 3 }], errors: [] })
			},
			logger: { info: (l: { msg: string }) => log.push(l.msg), error: (l: { msg: string }) => log.push(l.msg) },
		} as unknown as Payload
		return { payload, calls, log }
	}

	test('it deletes the lines dated before the threshold, on the given clock, and returns a number', async () => {
		const { payload, calls } = payloadSpy()
		expect(await purgeModerationEvents.executer(payload, NOW)).toBe(3)
		expect(calls).toHaveLength(1)
		expect(calls[0]).toMatchObject({
			collection: 'moderation-events',
			overrideAccess: true,
			where: { date: { less_than: '2021-10-15T10:00:00.000Z' } },
		})
	})

	test('it is in the daily tasks, and its log says a number only', async () => {
		expect(DAILY_TASKS).toContain(purgeModerationEvents)
		const { payload, log } = payloadSpy()
		await runDailyTasks(payload, NOW, [purgeModerationEvents])
		expect(log).toEqual(['Tâche quotidienne purge-moderation-events : 3 ligne(s) traitée(s).'])
	})
})
