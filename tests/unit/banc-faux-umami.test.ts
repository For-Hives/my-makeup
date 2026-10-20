import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { RefusedBench } from '../support/bench'
import { checkUmami, RefusedEnvironment } from '../support/environment-guard'
import { AGENT_AUTOMATED, AGENT_ORDINARY, fakeUmami, testAgent } from '../support/fake-umami'
import { createFakeUmami } from '../support/fake-umami/provider'

/**
 * The fake Umami of the bench (ticket 111): what it records, what it forgets, and what the guard
 * of the tests refuses in its place.
 */

const fournisseur = createFakeUmami()
let serveur: ReturnType<typeof Bun.serve>
let adresse = ''

beforeAll(() => {
	serveur = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: requete => fournisseur.repondre(requete) })
	adresse = `http://127.0.0.1:${serveur.port}`
})
afterAll(() => serveur.stop(true))

describe('le faux Umami', () => {
	test('il dit qui il est, et sert un traceur', async () => {
		expect(await (await fetch(`${adresse}/_sante`)).json()).toEqual({ service: 'fake-umami' })
		const traceur = await fetch(`${adresse}/script.js`)
		expect(traceur.headers.get('content-type')).toContain('javascript')
		const texte = await traceur.text()
		for (const attribut of ['data-website-id', 'data-host-url', 'data-domains', 'data-tag', 'data-before-send'])
			expect(texte).toContain(attribut)
	})

	test('il note ce qu’il reçoit, sans jamais garder la valeur d’un cookie, et l’oublie sur demande', async () => {
		const outil = fakeUmami({ UMAMI_ORIGIN: adresse })
		await outil.vider()
		await fetch(`${adresse}/api/send`, {
			method: 'POST',
			body: JSON.stringify({ type: 'event', payload: { name: 'cta_click', tag: 'abc1234' } }),
			headers: {
				'Content-Type': 'application/json',
				Cookie: 'session=valeur-secrete',
				Referer: 'https://exemple.test/',
			},
		})
		await fetch(`${adresse}/api/send`, { method: 'POST', body: 'pas du JSON' })

		const recus = await outil.recus()
		expect(recus).toHaveLength(2)
		expect(recus[0]).toMatchObject({ cookie: true, referer: true, autorisation: false, methode: 'POST' })
		expect(JSON.stringify(recus)).not.toContain('valeur-secrete')
		expect(recus[1]?.corps).toBe('pas du JSON')
		expect(await outil.envois('cta_click')).toHaveLength(1)

		await outil.vider()
		expect(await outil.recus()).toEqual([])
	})

	test('un essai ne lit que ce que son navigateur a envoyé : celui d’à côté ne le gêne pas', async () => {
		const outil = fakeUmami({ UMAMI_ORIGIN: adresse })
		const [le, lautre] = [testAgent(), testAgent()]
		const envoyer = (agent: string, name: string) =>
			fetch(`${adresse}/api/send`, {
				method: 'POST',
				body: JSON.stringify({ type: 'event', payload: { name } }),
				headers: { 'Content-Type': 'application/json', 'User-Agent': agent },
			})
		await envoyer(le, 'cta_click')
		await envoyer(lautre, 'cta_click')
		await envoyer(lautre, 'not_found')

		expect(le).not.toBe(lautre)
		expect(le.startsWith(AGENT_ORDINARY)).toBe(true)
		expect(testAgent(AGENT_AUTOMATED)).toContain('HeadlessChrome')
		expect(await outil.pourLAgent(le).envois('cta_click')).toHaveLength(1)
		expect(await outil.pourLAgent(le).recus()).toHaveLength(1)
		expect(await outil.pourLAgent(lautre).recus()).toHaveLength(2)
		expect(await outil.pourLAgent(lautre).envois('not_found')).toHaveLength(1)
		// Without the mark of a test, it would read what every other test sent.
		expect(() => outil.pourLAgent(AGENT_ORDINARY)).toThrow(RefusedBench)
		expect(() => outil.pourLAgent(undefined)).toThrow('agentDeLEssai')
	})

	test('un autre chemin, ou une autre méthode : 404', async () => {
		expect((await fetch(`${adresse}/dashboard`)).status).toBe(404)
		expect((await fetch(`${adresse}/api/send`)).status).toBe(404)
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
