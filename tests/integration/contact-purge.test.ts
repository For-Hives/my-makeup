import { afterAll, describe, expect, test } from 'bun:test'
import { markImportInProgress } from '@/lib/import-context'
import { purgeContactMessages } from '@/lib/tasks/contact-messages'
import { runDailyTasks } from '@/lib/tasks/daily'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The 12-month purge of the contact messages against the real store (ticket 162), on a simulated clock.
 * The same lines with a double: tests/unit/purge-messages-contact.test.ts.
 */

afterAll(emptyBase)

const NOW = new Date('2026-10-15T10:00:00.000Z')

async function write(createdAt: string) {
	const payload = await testPayload()
	return payload.create({
		collection: 'contact-requests',
		data: {
			type: 'contact',
			status: 'new',
			mailStatus: 'sent',
			firstName: 'Léa',
			lastName: 'Témoin',
			email: `purge-${crypto.randomUUID()}@example.test`,
			phone: '01 99 00 12 34',
			message: 'Un message de test.',
			createdAt,
		},
	})
}

async function ids() {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'contact-requests', depth: 0, limit: 100, pagination: false })
	return docs.map(({ id }) => id)
}

describe('la purge à 12 mois, sur une horloge simulée', () => {
	test('12 mois et un jour : supprimé ; 11 mois : gardé ; une seconde passe ne change rien', async () => {
		const payload = await testPayload()
		const old = await write('2025-10-14T09:59:00.000Z')
		const veryOld = await write('2024-01-01T00:00:00.000Z')
		const elevenMonths = await write('2025-11-15T10:00:00.000Z')
		const recent = await write(NOW.toISOString())

		const first = await runDailyTasks(payload, NOW, [purgeContactMessages])
		expect(first).toEqual([{ nom: 'purge-messages-contact', supprimes: 2 }])
		const remaining = await ids()
		expect(remaining).not.toContain(old.id)
		expect(remaining).not.toContain(veryOld.id)
		expect(remaining).toContain(elevenMonths.id)
		expect(remaining).toContain(recent.id)

		const second = await runDailyTasks(payload, NOW, [purgeContactMessages])
		expect(second).toEqual([{ nom: 'purge-messages-contact', supprimes: 0 }])
	})

	test('pendant un import, rien ne part ; le lendemain de l’import, ce qui est dû part', async () => {
		const payload = await testPayload()
		const old = await write('2024-06-01T00:00:00.000Z')
		const end = markImportInProgress()
		const during = await runDailyTasks(payload, NOW, [purgeContactMessages])
		end()
		expect(during).toEqual([{ nom: 'purge-messages-contact', supprimes: 0 }])
		expect(await ids()).toContain(old.id)
		await runDailyTasks(payload, NOW, [purgeContactMessages])
		expect(await ids()).not.toContain(old.id)
	})
})
