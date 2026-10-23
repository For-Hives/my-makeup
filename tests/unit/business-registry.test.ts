/**
 * The service that asks the public business registry whether an establishment is active (issue 1004). Every answer
 * is simulated: nothing here reaches the real registry. The decision is « active » only when the establishment
 * exists and is active, and anything unclear is « no answer », never a verdict.
 */
import { describe, expect, test } from 'bun:test'
import { createBusinessRegistry, REGISTRY_URL } from '@/lib/activity/registry'
import { body, reply, SIRET_ACTIVE, SIRET_CEASED, SIRET_UNKNOWN } from '../fixtures/business-registry'
import { delay, http, simulate } from '../support/outgoing-http'

const registry = (extra: Parameters<typeof createBusinessRegistry>[0] = {}) =>
	createBusinessRegistry({ sleep: async () => {}, ...extra })

describe('1004 : ce que l’annuaire répond, ce que le service décide', () => {
	test('établissement existant et actif : activité en cours', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.active())))
		expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'active' })
	})

	test('entreprise cessée : cessée', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.ceased())))
		expect(await registry().lookup(SIRET_CEASED)).toEqual({ kind: 'ceased' })
	})

	test('établissement fermé dans une entreprise qui vit : cessée', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.closedEstablishment())))
		expect(await registry().lookup(SIRET_CEASED)).toEqual({ kind: 'ceased' })
	})

	test('établissement ouvert dans une entreprise cessée : cessée', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.ceasedUnit())))
		expect(await registry().lookup(SIRET_CEASED)).toEqual({ kind: 'ceased' })
	})

	test('introuvable : aucun résultat, ou aucun résultat qui porte ce numéro', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.notFound())))
		expect(await registry().lookup(SIRET_UNKNOWN)).toEqual({ kind: 'not-found' })
		simulate(http.get(REGISTRY_URL, () => reply.json(body.severalWithout())))
		expect(await registry().lookup(SIRET_UNKNOWN)).toEqual({ kind: 'not-found' })
	})

	test('plusieurs résultats : seul celui qui porte exactement ce numéro compte', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.several())))
		expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'active' })
	})

	test('deux lignes qui se contredisent, ou un état inconnu : illisible, aucun verdict', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.contradictory())))
		expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'unreadable' })
		simulate(http.get(REGISTRY_URL, () => reply.json(body.unknownState())))
		expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'unreadable' })
	})

	test('JSON invalide, page HTML, forme inattendue : illisible', async () => {
		for (const answer of [reply.invalidJson(), reply.html(), reply.json({ results: 'oui' }), reply.json([])]) {
			simulate(http.get(REGISTRY_URL, () => answer.clone()))
			expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'unreadable' })
		}
	})

	test('code 500 ou 503 : indisponible', async () => {
		for (const code of [500, 503]) {
			simulate(http.get(REGISTRY_URL, () => reply.status(code)))
			expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'unavailable' })
		}
	})

	test('code 429 : trop de demandes, à dire pour que la tâche s’arrête', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.tooMany()))
		expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'rate-limited' })
	})

	test('réseau coupé : indisponible', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.error()))
		expect(await registry().lookup(SIRET_ACTIVE)).toEqual({ kind: 'unavailable' })
	})

	test('délai dépassé : indisponible, sans attendre la fin du silence', async () => {
		simulate(
			http.get(REGISTRY_URL, async () => {
				await delay('infinite')
				return reply.json(body.active())
			})
		)
		const started = Date.now()
		expect(await registry({ timeoutMs: 50 }).lookup(SIRET_ACTIVE)).toEqual({ kind: 'unavailable' })
		expect(Date.now() - started).toBeLessThan(2000)
	})
})

describe('1004 : la demande, et la politesse', () => {
	test('la demande ne porte que le numéro, sans clé, et le SIRET mal formé n’est jamais envoyé', async () => {
		let seen: URL | undefined
		let headers: Headers | undefined
		simulate(
			http.get(REGISTRY_URL, ({ request }) => {
				seen = new URL(request.url)
				headers = request.headers
				return reply.json(body.active())
			})
		)
		await registry().lookup(SIRET_ACTIVE)
		expect(seen?.searchParams.get('q')).toBe(SIRET_ACTIVE)
		expect(headers?.get('authorization')).toBeNull()
		expect(headers?.get('cookie')).toBeNull()
		expect(await registry().lookup('pas un siret')).toEqual({ kind: 'unreadable' })
	})

	test('une demande par seconde au plus : le service attend avant la deuxième', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.json(body.active())))
		const waits: number[] = []
		let clock = 10_000
		const spaced = createBusinessRegistry({
			now: () => clock,
			sleep: async ms => {
				waits.push(ms)
				clock += ms
			},
		})
		await spaced.lookup(SIRET_ACTIVE)
		clock += 300
		await spaced.lookup(SIRET_ACTIVE)
		expect(waits).toEqual([700])
	})

	test('l’erreur ne porte jamais le numéro demandé', async () => {
		simulate(http.get(REGISTRY_URL, () => reply.error()))
		const answer = await registry().lookup(SIRET_ACTIVE)
		expect(JSON.stringify(answer)).not.toContain(SIRET_ACTIVE)
	})
})
