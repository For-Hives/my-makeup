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
 * The instance runs in a container of the bench (compose.test.yml, service « faux-umami », code in
 * tests/outils/faux-umami/). The application is pointed at it by UMAMI_ORIGIN.
 *
 * Nothing of bun here: Playwright loads this file under Node.
 */

import { BancRefuse, type Variables } from './banc'
import type { Recu } from './faux-umami/fournisseur'

export type { Recu } from './faux-umami/fournisseur'

const HOTES_LOCAUX = ['localhost', '127.0.0.1']

/** What a test reads of the fake: the sends it received, all of them or those of one event. */
export interface LectureFauxUmami {
	recus: () => Promise<Recu[]>
	/** The sends of the event given (`payload.name`), or all of them. */
	envois: (nom?: string) => Promise<Recu[]>
}

export interface OutilFauxUmami extends LectureFauxUmami {
	/** Where the fake answers. */
	adresse: string
	/** Forgets everything the fake received, for every test of the run. Never in an end-to-end test. */
	vider: () => Promise<void>
	/** Only what came with this user agent: the sends of one test (`agentDeLEssai`). */
	pourLAgent: (agent: string | undefined) => LectureFauxUmami
}

/** The user agent of an ordinary Chrome: the default one of the headless browser says « HeadlessChrome », which the site does not measure. */
export const AGENT_ORDINAIRE =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** The user agent of the headless browser, which the filter of the site refuses. */
export const AGENT_AUTOMATISE =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36'

/** The mark a test adds to its user agent. */
const MARQUE_DE_L_ESSAI = 'EssaiMyMakeup'

/**
 * A user agent no other test carries: the browser it names, followed by a mark of its own. A browser
 * stays the browser it was (the filter of the site reads « HeadlessChrome », not the end of the line).
 */
export const agentDeLEssai = (base: string = AGENT_ORDINAIRE): string =>
	`${base} ${MARQUE_DE_L_ESSAI}/${crypto.randomUUID()}`

/**
 * What `test.use` takes to give each test of a file its own user agent (`agentDeLEssai`), which the test
 * reads by the `userAgent` fixture:
 *
 *   test.use(unAgentParEssai())
 *   test('…', async ({ page, userAgent }) => { const umami = fauxUmami().pourLAgent(userAgent) })
 */
export const unAgentParEssai = (base: string = AGENT_ORDINAIRE) => ({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this pattern, and this one needs none.
	userAgent: async ({}, use: (agent: string) => Promise<void>) => use(agentDeLEssai(base)),
})

const duNom = (recus: Recu[], nom: string | undefined): Recu[] =>
	nom === undefined
		? recus
		: recus.filter(recu => {
				const corps = recu.corps as { payload?: { name?: unknown } } | null
				return corps?.payload?.name === nom
			})

export function fauxUmami(variables: Variables = process.env): OutilFauxUmami {
	const adresse = variables.UMAMI_ORIGIN
	if (!adresse)
		throw new BancRefuse(
			'Aucun faux Umami n’est réglé (UMAMI_ORIGIN manque). Démarre le banc par « bun run banc:up », puis lance les tests par « bun run test:integration ».'
		)
	const url = URL.canParse(adresse) ? new URL(adresse) : undefined
	if (url?.origin !== adresse || url.protocol !== 'http:' || !HOTES_LOCAUX.includes(url.hostname))
		throw new BancRefuse(
			'UMAMI_ORIGIN ne désigne pas le faux Umami du banc, sur ce poste : rien n’est envoyé. Un test ne parle jamais à la vraie instance.'
		)

	const recus = async (): Promise<Recu[]> => {
		const reponse = await fetch(`${adresse}/_recus`)
		if (!reponse.ok) throw new BancRefuse(`Le faux Umami répond ${reponse.status} à la lecture de ses envois.`)
		return (await reponse.json()) as Recu[]
	}
	return {
		adresse,
		recus,
		vider: async () => {
			await fetch(`${adresse}/_recus`, { method: 'DELETE' })
		},
		envois: async nom => duNom(await recus(), nom),
		pourLAgent: agent => {
			if (!agent?.includes(`${MARQUE_DE_L_ESSAI}/`))
				throw new BancRefuse(
					'pourLAgent attend le user agent d’un essai (agentDeLEssai) : sans lui, l’essai lirait les mesures des autres.'
				)
			const siens = async () => (await recus()).filter(recu => recu.agent === agent)
			return { recus: siens, envois: async nom => duNom(await siens(), nom) }
		},
	}
}
