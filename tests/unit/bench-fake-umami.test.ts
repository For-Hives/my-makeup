import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { RefusedBench } from '../support/bench'
import { checkUmami, RefusedEnvironment } from '../support/environment-guard'
import { AGENT_AUTOMATED, AGENT_ORDINARY, fakeUmami, testAgent } from '../support/fake-umami'
import { createFakeUmami } from '../support/fake-umami/provider'

/**
 * The fake Umami of the bench (ticket 111): what it records, what it forgets, and what the guard
 * of the tests refuses in its place.
 */

const provider = createFakeUmami()
let server: ReturnType<typeof Bun.serve>
let url = ''

beforeAll(() => {
	server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: requete => provider.repondre(requete) })
	url = `http://127.0.0.1:${server.port}`
})
afterAll(() => server.stop(true))

describe('le faux Umami', () => {
	test('il dit qui il est, et sert un traceur', async () => {
		expect(await (await fetch(`${url}/_sante`)).json()).toEqual({ service: 'fake-umami' })
		const tracer = await fetch(`${url}/script.js`)
		expect(tracer.headers.get('content-type')).toContain('javascript')
		const text = await tracer.text()
		for (const attribute of ['data-website-id', 'data-host-url', 'data-domains', 'data-tag', 'data-before-send'])
			expect(text).toContain(attribute)
	})

	test('il note ce qu’il reçoit, sans jamais garder la valeur d’un cookie, et l’oublie sur demande', async () => {
		const tool = fakeUmami({ UMAMI_ORIGIN: url })
		await tool.vider()
		await fetch(`${url}/api/send`, {
			method: 'POST',
			body: JSON.stringify({ type: 'event', payload: { name: 'cta_click', tag: 'abc1234' } }),
			headers: {
				'Content-Type': 'application/json',
				Cookie: 'session=valeur-secrete',
				Referer: 'https://exemple.test/',
			},
		})
		await fetch(`${url}/api/send`, { method: 'POST', body: 'pas du JSON' })

		const received = await tool.recus()
		expect(received).toHaveLength(2)
		expect(received[0]).toMatchObject({ cookie: true, referer: true, autorisation: false, methode: 'POST' })
		expect(JSON.stringify(received)).not.toContain('valeur-secrete')
		expect(received[1]?.corps).toBe('pas du JSON')
		expect(await tool.envois('cta_click')).toHaveLength(1)

		await tool.vider()
		expect(await tool.recus()).toEqual([])
	})

	test('un essai ne lit que ce que son navigateur a envoyé : celui d’à côté ne le gêne pas', async () => {
		const tool = fakeUmami({ UMAMI_ORIGIN: url })
		const [theOne, lautre] = [testAgent(), testAgent()]
		const send = (agent: string, name: string) =>
			fetch(`${url}/api/send`, {
				method: 'POST',
				body: JSON.stringify({ type: 'event', payload: { name } }),
				headers: { 'Content-Type': 'application/json', 'User-Agent': agent },
			})
		await send(theOne, 'cta_click')
		await send(lautre, 'cta_click')
		await send(lautre, 'not_found')

		expect(theOne).not.toBe(lautre)
		expect(theOne.startsWith(AGENT_ORDINARY)).toBe(true)
		expect(testAgent(AGENT_AUTOMATED)).toContain('HeadlessChrome')
		expect(await tool.pourLAgent(theOne).envois('cta_click')).toHaveLength(1)
		expect(await tool.pourLAgent(theOne).recus()).toHaveLength(1)
		expect(await tool.pourLAgent(lautre).recus()).toHaveLength(2)
		expect(await tool.pourLAgent(lautre).envois('not_found')).toHaveLength(1)
		// Without the mark of a test, it would read what every other test sent.
		expect(() => tool.pourLAgent(AGENT_ORDINARY)).toThrow(RefusedBench)
		expect(() => tool.pourLAgent(undefined)).toThrow('agentDeLEssai')
	})

	test('un autre chemin, ou une autre méthode : 404', async () => {
		expect((await fetch(`${url}/dashboard`)).status).toBe(404)
		expect((await fetch(`${url}/api/send`)).status).toBe(404)
	})
})

describe('l’outil et la garde ne parlent qu’au faux Umami de ce poste', () => {
	test('sans UMAMI_ORIGIN, l’outil s’arrête et dit quoi lancer', () => {
		expect(() => fakeUmami({})).toThrow(RefusedBench)
		expect(() => fakeUmami({})).toThrow('bun run bench:up')
	})

	test.each([
		'https://umami.wadefade.fr',
		'https://127.0.0.1:4200',
		'http://192.168.1.20:4200',
		'http://127.0.0.1:4200/',
		'pas une adresse',
	])('l’outil refuse %s', origine => {
		expect(() => fakeUmami({ UMAMI_ORIGIN: origine })).toThrow('rien n’est envoyé')
	})

	test('la garde refuse une instance qui n’est pas de ce poste, et laisse passer le faux et l’absence', () => {
		expect(() => checkUmami({})).not.toThrow()
		expect(() => checkUmami({ UMAMI_ORIGIN: 'http://127.0.0.1:4200' })).not.toThrow()
		expect(() => checkUmami({ UMAMI_ORIGIN: 'http://fake-umami:4200' })).not.toThrow()
		expect(() => checkUmami({ UMAMI_ORIGIN: 'https://umami.wadefade.fr' })).toThrow(RefusedEnvironment)
		expect(() => checkUmami({ UMAMI_ORIGIN: 'https://umami.wadefade.fr' })).toThrow('jamais à la vraie instance')
		expect(() => checkUmami({ UMAMI_ORIGIN: 'illisible' })).toThrow(RefusedEnvironment)
	})
})
