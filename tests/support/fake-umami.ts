/**
 * The fake Umami of the bench, seen from a test: read what it received, forget it.
 *
 *   const umami = fauxUmami()
 *   await umami.vider()
 *   // ... the application relays a measure ...
 *   const recus = await umami.recus()
 *
 * In the end-to-end tests the fake is one instance for every worker of the run: a test never empties
 * it and never reads all of it, or it would lose or count the measures of a test running beside it.
 * Its browser carries a user agent of its own (`agentDeLEssai`), which the site relays, and the test
 * reads only what came with it:
 *
 *   test.use(unAgentParEssai())
 *   // in the test, with the `userAgent` fixture:
 *   const umami = fauxUmami().pourLAgent(userAgent)
 *
 * The instance runs in a container of the bench (compose.test.yml, service « fake-umami », code in
 * tests/support/fake-umami/). The application is pointed at it by UMAMI_ORIGIN.
 *
 * Nothing of bun here: Playwright loads this file under Node.
 */

import { RefusedBench, type Variables } from './bench'
import type { Received } from './fake-umami/provider'

export type { Received as Recu } from './fake-umami/provider'

const HOST_LOCAL = ['localhost', '127.0.0.1']

/** What a test reads of the fake: the sends it received, all of them or those of one event. */
export interface ReadingFakeUmami {
	recus: () => Promise<Received[]>
	/** The sends of the event given (`payload.name`), or all of them. */
	envois: (nom?: string) => Promise<Received[]>
}

export interface ToolFakeUmami extends ReadingFakeUmami {
	/** Where the fake answers. */
	adresse: string
	/** Forgets everything the fake received, for every test of the run. Never in an end-to-end test. */
	vider: () => Promise<void>
	/** Only what came with this user agent: the sends of one test (`agentDeLEssai`). */
	pourLAgent: (agent: string | undefined) => ReadingFakeUmami
}

/** The user agent of an ordinary Chrome: the default one of the headless browser says « HeadlessChrome », which the site does not measure. */
export const AGENT_ORDINARY =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** The user agent of the headless browser, which the filter of the site refuses. */
export const AGENT_AUTOMATED =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36'

/** The mark a test adds to its user agent. */
const TEST_MARK = 'EssaiMyMakeup'

/**
 * A user agent no other test carries: the browser it names, followed by a mark of its own. A browser
 * stays the browser it was (the filter of the site reads « HeadlessChrome », not the end of the line).
 */
export const testAgent = (base: string = AGENT_ORDINARY): string => `${base} ${TEST_MARK}/${crypto.randomUUID()}`

/**
 * What `test.use` takes to give each test of a file its own user agent (`agentDeLEssai`), which the test
 * reads by the `userAgent` fixture:
 *
 *   test.use(unAgentParEssai())
 *   test('…', async ({ page, userAgent }) => { const umami = fauxUmami().pourLAgent(userAgent) })
 */
export const agentByTest = (base: string = AGENT_ORDINARY) => ({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
	userAgent: async ({}, use: (agent: string) => Promise<void>) => use(testAgent(base)),
})

const name = (recus: Received[], nom: string | undefined): Received[] =>
	nom === undefined
		? recus
		: recus.filter(recu => {
				const corps = recu.corps as { payload?: { name?: unknown } } | null
				return corps?.payload?.name === nom
			})

export function fakeUmami(variables: Variables = process.env): ToolFakeUmami {
	const address = variables.UMAMI_ORIGIN
	if (!address)
		throw new RefusedBench(
			'Aucun faux Umami n’est réglé (UMAMI_ORIGIN manque). Démarre le banc par « bun run bench:up », puis lance les tests par « bun run test:integration ».'
		)
	const url = URL.canParse(address) ? new URL(address) : undefined
	if (url?.origin !== address || url.protocol !== 'http:' || !HOST_LOCAL.includes(url.hostname))
		throw new RefusedBench(
			'UMAMI_ORIGIN ne désigne pas le faux Umami du banc, sur ce poste : rien n’est envoyé. Un test ne parle jamais à la vraie instance.'
		)

	const received = async (): Promise<Received[]> => {
		const response = await fetch(`${address}/_recus`)
		if (!response.ok) throw new RefusedBench(`Le faux Umami répond ${response.status} à la lecture de ses envois.`)
		return (await response.json()) as Received[]
	}
	return {
		adresse: address,
		recus: received,
		vider: async () => {
			await fetch(`${address}/_recus`, { method: 'DELETE' })
		},
		envois: async nom => name(await received(), nom),
		pourLAgent: agent => {
			if (!agent?.includes(`${TEST_MARK}/`))
				throw new RefusedBench(
					'pourLAgent attend le user agent d’un essai (agentDeLEssai) : sans lui, l’essai lirait les mesures des autres.'
				)
			const own = async () => (await received()).filter(recu => recu.agent === agent)
			return { recus: own, envois: async nom => name(await own(), nom) }
		},
	}
}
