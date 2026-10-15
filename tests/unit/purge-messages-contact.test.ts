import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { importEnCours, marquerUnImportEnCours } from '@/lib/contexte-import'
import { purgeDesMessagesDeContact, seuilDePurgeDuContact } from '@/lib/taches/messages-de-contact'
import { lancerLesTachesQuotidiennes, TACHES_QUOTIDIENNES } from '@/lib/taches/quotidiennes'

/** Ticket 162: the 12-month purge of the contact messages. The same lines against the real store: tests/integration/contact-purge.test.ts. */

describe('seuilDePurgeDuContact : douze mois de calendrier, en UTC', () => {
	test('le même jour, un an plus tôt', () => {
		expect(seuilDePurgeDuContact(new Date('2026-10-15T10:00:00.000Z')).toISOString()).toBe('2025-10-15T10:00:00.000Z')
	})

	test('un 29 février ne déborde pas sur mars', () => {
		expect(seuilDePurgeDuContact(new Date('2028-02-29T00:00:00.000Z')).toISOString()).toBe('2027-02-28T00:00:00.000Z')
	})

	test('une horloge sans effet de fuseau : minuit UTC du 1er janvier', () => {
		expect(seuilDePurgeDuContact(new Date('2027-01-01T00:00:00.000Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z')
	})
})

describe('la tâche', () => {
	const MOMENT = new Date('2026-10-15T10:00:00.000Z')

	function payloadEspion() {
		const appels: unknown[] = []
		const journal: string[] = []
		const payload = {
			delete: (args: unknown) => {
				appels.push(args)
				return Promise.resolve({ docs: [{ id: 1 }, { id: 2 }], errors: [] })
			},
			logger: { info: (l: { msg: string }) => journal.push(l.msg), error: (l: { msg: string }) => journal.push(l.msg) },
		} as unknown as Payload
		return { payload, appels, journal }
	}

	test('elle supprime les messages de contact antérieurs au seuil, sur l’horloge donnée, et rend un nombre', async () => {
		const { payload, appels } = payloadEspion()
		expect(await purgeDesMessagesDeContact.executer(payload, MOMENT)).toBe(2)
		expect(appels).toHaveLength(1)
		expect(appels[0]).toMatchObject({
			collection: 'demandes',
			where: {
				and: [{ type: { equals: 'contact' } }, { createdAt: { less_than: '2025-10-15T10:00:00.000Z' } }],
			},
		})
	})

	test('elle ne fait rien pendant un import, et reprend quand il est fini', async () => {
		const { payload, appels } = payloadEspion()
		const fin = marquerUnImportEnCours()
		expect(importEnCours()).toBe(true)
		expect(await purgeDesMessagesDeContact.executer(payload, MOMENT)).toBe(0)
		expect(appels).toHaveLength(0)
		fin()
		fin() // ending twice does not end another import
		expect(importEnCours()).toBe(false)
		expect(await purgeDesMessagesDeContact.executer(payload, MOMENT)).toBe(2)
	})

	test('elle est dans la liste des tâches quotidiennes, et son journal ne dit qu’un nombre', async () => {
		expect(TACHES_QUOTIDIENNES).toContain(purgeDesMessagesDeContact)
		const { payload, journal } = payloadEspion()
		await lancerLesTachesQuotidiennes(payload, MOMENT, [purgeDesMessagesDeContact])
		expect(journal).toEqual(['Tâche quotidienne purge-messages-contact : 2 ligne(s) supprimée(s).'])
	})
})
