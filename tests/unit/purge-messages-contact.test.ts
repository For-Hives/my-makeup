import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { importInProgress, markImportInProgress } from '@/lib/import-context'
import { contactPurgeThreshold, purgeContactMessages } from '@/lib/tasks/contact-messages'
import { DAILY_TASKS, runDailyTasks } from '@/lib/tasks/daily'

/** Ticket 162: the 12-month purge of the contact messages. The same lines against the real store: tests/integration/contact-purge.test.ts. */

describe('seuilDePurgeDuContact : douze mois de calendrier, en UTC', () => {
	test('le même jour, un an plus tôt', () => {
		expect(contactPurgeThreshold(new Date('2026-10-15T10:00:00.000Z')).toISOString()).toBe('2025-10-15T10:00:00.000Z')
	})

	test('un 29 février ne déborde pas sur mars', () => {
		expect(contactPurgeThreshold(new Date('2028-02-29T00:00:00.000Z')).toISOString()).toBe('2027-02-28T00:00:00.000Z')
	})

	test('une horloge sans effet de fuseau : minuit UTC du 1er janvier', () => {
		expect(contactPurgeThreshold(new Date('2027-01-01T00:00:00.000Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z')
	})
})

describe('la tâche', () => {
	const MOMENT = new Date('2026-10-15T10:00:00.000Z')

	function payloadSpy() {
		const calls: unknown[] = []
		const log: string[] = []
		const payload = {
			delete: (args: unknown) => {
				calls.push(args)
				return Promise.resolve({ docs: [{ id: 1 }, { id: 2 }], errors: [] })
			},
			logger: { info: (l: { msg: string }) => log.push(l.msg), error: (l: { msg: string }) => log.push(l.msg) },
		} as unknown as Payload
		return { payload, appels: calls, journal: log }
	}

	test('elle supprime les messages de contact antérieurs au seuil, sur l’horloge donnée, et rend un nombre', async () => {
		const { payload, appels: calls } = payloadSpy()
		expect(await purgeContactMessages.executer(payload, MOMENT)).toBe(2)
		expect(calls).toHaveLength(1)
		expect(calls[0]).toMatchObject({
			collection: 'contact-requests',
			where: {
				and: [{ type: { equals: 'contact' } }, { createdAt: { less_than: '2025-10-15T10:00:00.000Z' } }],
			},
		})
	})

	test('elle ne fait rien pendant un import, et reprend quand il est fini', async () => {
		const { payload, appels: calls } = payloadSpy()
		const end = markImportInProgress()
		expect(importInProgress()).toBe(true)
		expect(await purgeContactMessages.executer(payload, MOMENT)).toBe(0)
		expect(calls).toHaveLength(0)
		end()
		end() // ending twice does not end another import
		expect(importInProgress()).toBe(false)
		expect(await purgeContactMessages.executer(payload, MOMENT)).toBe(2)
	})

	test('elle est dans la liste des tâches quotidiennes, et son journal ne dit qu’un nombre', async () => {
		expect(DAILY_TASKS).toContain(purgeContactMessages)
		const { payload, journal: log } = payloadSpy()
		await runDailyTasks(payload, MOMENT, [purgeContactMessages])
		expect(log).toEqual(['Tâche quotidienne purge-messages-contact : 2 ligne(s) traitée(s).'])
	})
})

describe('l’import marque son passage (importer lui-même)', () => {
	test('importEnCours() est vrai pendant importer(), faux après, même si l’import échoue', async () => {
		const { importer } = await import('../../scripts/migration/import/importer')
		const seen: { pendant: boolean | null } = { pendant: null }
		const source = {
			lire: async () => {
				seen.pendant = importInProgress()
				throw new Error('stop')
			},
		}
		const options = { payload: {}, source, mode: 'essai', cible: 'local' } as unknown as Parameters<typeof importer>[0]

		await expect(importer(options)).rejects.toThrow('stop')
		expect(seen.pendant).toBe(true)
		expect(importInProgress()).toBe(false)
	})
})

describe('la reprise des messages restés en cours d’envoi (ticket 224)', () => {
	test('elle est dans les tâches quotidiennes et ne touche que les messages de contact « en-attente » plus vieux que le délai', async () => {
		const { retryStuckMessages: messagesBlockedRetry, RETRY_DELAY_MS } = await import('@/lib/tasks/stuck-messages')
		expect(DAILY_TASKS).toContain(messagesBlockedRetry)
		const calls: { data: unknown; where: unknown }[] = []
		const payload = {
			update: (args: { data: unknown; where: unknown }) => {
				calls.push(args)
				return Promise.resolve({ docs: [{ id: 1 }], errors: [] })
			},
		} as unknown as Payload
		const now = new Date('2026-10-16T10:00:00.000Z')

		expect(await messagesBlockedRetry.executer(payload, now)).toBe(1)

		expect(RETRY_DELAY_MS).toBe(15 * 60 * 1000)
		expect(calls).toEqual([
			{
				collection: 'contact-requests',
				depth: 0,
				overrideAccess: true,
				select: { mailStatus: true },
				data: { mailStatus: 'failed' },
				where: {
					and: [
						{ type: { equals: 'contact' } },
						{ mailStatus: { equals: 'pending' } },
						{ updatedAt: { less_than: '2026-10-16T09:45:00.000Z' } },
					],
				},
			},
		] as never)
	})
})
