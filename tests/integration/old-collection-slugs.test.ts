import { afterAll, describe, expect, test } from 'bun:test'
import { createAccount } from '../support/account-factory'
import { emptyBase } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * Ticket 250 (PLAN-ANGLAIS.md §7): the collections of the database have English slugs, and the French
 * ones are gone for good. Their REST addresses answer 404 whoever asks (an admin included), and the
 * new ones answer.
 */

afterAll(emptyBase)

const ANCIENS = ['profils', 'demandes', 'auth-evenements', 'comptes-supprimes'] as const
const NOUVEAUX = ['profiles', 'contact-requests', 'auth-events', 'deleted-accounts'] as const

describe('Les anciennes adresses REST des collections', () => {
	test('répondent 404 à une visiteuse comme à un admin, en liste comme sur un identifiant', async () => {
		const { session } = await createAccount('admin')
		for (const slug of ANCIENS) {
			for (const enTetes of [{}, session.enTetes]) {
				expect((await callRest('GET', `/api/${slug}`, { enTetes })).statut, slug).toBe(404)
				expect((await callRest('GET', `/api/${slug}/1`, { enTetes })).statut, slug).toBe(404)
			}
		}
	})

	test('les nouvelles existent : une visiteuse n’y entre pas par la porte des anciennes, un admin lit la liste', async () => {
		const { session } = await createAccount('admin')
		for (const slug of NOUVEAUX) {
			expect((await callRest('GET', `/api/${slug}`, { enTetes: session.enTetes })).statut, slug).toBe(200)
		}
	})

	test('le renvoi d’un email vit sous le nouveau slug : l’ancien n’existe plus', async () => {
		const { session } = await createAccount('admin')
		expect((await callRest('POST', '/api/demandes/1/resend', { enTetes: session.enTetes })).statut).toBe(404)
		expect((await callRest('POST', '/api/contact-requests/1/resend', { enTetes: session.enTetes })).statut).toBe(404)
	})
})
