import { describe, expect, test } from 'bun:test'
import { readOverview } from '../../src/lib/admin/overview'

/** A Payload that answers each count by the collection and the where it is given, and records what it was asked. */
function fakePayload() {
	const asked: unknown[] = []
	const payload = {
		count: ({ collection, where }: { collection: string; where: Record<string, unknown> }) => {
			asked.push({ collection, where })
			const key = JSON.stringify(where)
			const answers: Record<string, number> = {
				[JSON.stringify({ status: { equals: 'published' } })]: 7,
				[JSON.stringify({ status: { equals: 'draft' } })]: 3,
				[JSON.stringify({ status: { equals: 'hidden' } })]: 1,
				[JSON.stringify({ _verified: { not_equals: true } })]: 4,
				[JSON.stringify({ mailStatus: { equals: 'failed' } })]: 5,
				[JSON.stringify({ status: { equals: 'new' } })]: 6,
			}
			return Promise.resolve({ totalDocs: answers[key] ?? 9 })
		},
		find: ({ collection }: { collection: string }) =>
			Promise.resolve({
				docs:
					collection === 'contact-requests'
						? [{ id: 11, createdAt: '2026-10-23T10:00:00.000Z', status: 'new' }]
						: [{ id: 21, date: '2026-10-23T11:00:00.000Z', action: 'hide', profile: 8, reason: 'ne sort pas' }],
			}),
	}
	return { payload, asked }
}

describe('readOverview (issue 1005)', () => {
	test('un admin reçoit des nombres et des dates, jamais un texte', async () => {
		const { payload, asked } = fakePayload()
		const overview = await readOverview(payload as never, { collection: 'admins', id: 1, role: 'admin' } as never)
		expect(overview?.profiles).toEqual({ published: 7, draft: 3, hidden: 1 })
		expect(overview?.unconfirmedAccounts).toBe(4)
		expect(overview?.alerts.failedMails).toBe(5)
		expect(overview?.alerts.newMessages).toBe(6)
		expect(overview?.lastMessages).toEqual([{ id: 11, date: '2026-10-23T10:00:00.000Z', status: 'new' }])
		expect(overview?.lastModerations).toEqual([
			{ id: 21, date: '2026-10-23T11:00:00.000Z', action: 'hide', profile: 8 },
		])
		expect(asked.length).toBeGreaterThan(5)
	})

	test('la rédaction, une maquilleuse et un visiteur ne reçoivent rien, et rien n’est lu', async () => {
		for (const user of [
			{ collection: 'admins', id: 2, role: 'editor' },
			{ collection: 'pros', id: 3 },
			null,
			undefined,
		]) {
			const { payload, asked } = fakePayload()
			expect(await readOverview(payload as never, user as never)).toBeNull()
			expect(asked).toEqual([])
		}
	})
})
