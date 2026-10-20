import { afterAll, describe, expect, test } from 'bun:test'
import { markImportInProgress } from '@/lib/import-context'
import { purgeContactMessages } from '@/lib/tasks/contact-messages'
import { runDailyTasks } from '@/lib/tasks/daily'
import { payloadDeTest, viderLaBase } from '../support/payload-test'

/**
 * The 12-month purge of the contact messages against the real store (ticket 162), on a simulated clock.
 * The same lines with a double: tests/unit/purge-messages-contact.test.ts.
 */

afterAll(viderLaBase)

const MAINTENANT = new Date('2026-10-15T10:00:00.000Z')

async function ecrire(createdAt: string) {
	const payload = await payloadDeTest()
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
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'contact-requests', depth: 0, limit: 100, pagination: false })
	return docs.map(({ id }) => id)
}

describe('la purge à 12 mois, sur une horloge simulée', () => {
	test('12 mois et un jour : supprimé ; 11 mois : gardé ; une seconde passe ne change rien', async () => {
		const payload = await payloadDeTest()
		const vieux = await ecrire('2025-10-14T09:59:00.000Z')
		const tresVieux = await ecrire('2024-01-01T00:00:00.000Z')
		const onzeMois = await ecrire('2025-11-15T10:00:00.000Z')
		const recent = await ecrire(MAINTENANT.toISOString())

		const premiere = await runDailyTasks(payload, MAINTENANT, [purgeContactMessages])
		expect(premiere).toEqual([{ nom: 'purge-messages-contact', supprimes: 2 }])
		const restants = await ids()
		expect(restants).not.toContain(vieux.id)
		expect(restants).not.toContain(tresVieux.id)
		expect(restants).toContain(onzeMois.id)
		expect(restants).toContain(recent.id)

		const seconde = await runDailyTasks(payload, MAINTENANT, [purgeContactMessages])
		expect(seconde).toEqual([{ nom: 'purge-messages-contact', supprimes: 0 }])
	})

	test('pendant un import, rien ne part ; le lendemain de l’import, ce qui est dû part', async () => {
		const payload = await payloadDeTest()
		const vieux = await ecrire('2024-06-01T00:00:00.000Z')
		const fin = markImportInProgress()
		const pendant = await runDailyTasks(payload, MAINTENANT, [purgeContactMessages])
		fin()
		expect(pendant).toEqual([{ nom: 'purge-messages-contact', supprimes: 0 }])
		expect(await ids()).toContain(vieux.id)
		await runDailyTasks(payload, MAINTENANT, [purgeContactMessages])
		expect(await ids()).not.toContain(vieux.id)
	})
})
