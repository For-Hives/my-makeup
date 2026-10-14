/**
 * Outgoing HTTP, simulated: no test calls the Internet.
 *
 *     import { HttpResponse, http, simuler } from '../outils/http-sortant'
 *
 *     test('the town is found', async () => {
 *         simuler(http.get('https://referentiel.example.test/communes', () => HttpResponse.json([…])))
 *         expect(await chercherCommunes('Annecy')).toEqual(…)
 *     })
 *
 * One declaration simulates a service, for the test that makes it. A request to a host that
 * nothing declared is refused, and the test that made it fails with a message that names the
 * host, even when the code under test swallowed the error.
 *
 * Two layers, started once per run by the preload (tests/outils/precharge-http-sortant.ts):
 *
 *  1. The simulation. MSW answers the global `fetch` in place of the declared service. Without
 *     a declaration, the request is refused on the spot: `fetch` rejects with `RequeteNonSimulee`.
 *  2. The net. Under bun, MSW sees the global `fetch` and nothing else: `Bun.fetch`, `undici`,
 *     `node:http` and `node:https` end in bun's native client, out of its reach. That client
 *     obeys the proxy variables, so they point at a server of this process that reads where the
 *     request was going, notes it and hangs up. A request MSW lets through to an outside host
 *     (`passthrough()`, `bypass()`) ends there too.
 *
 * The bench itself is not intercepted: a request to a host of `HOTES_DU_BANC` (this machine, the
 * services of the test stack) reaches the real service, through both layers.
 *
 * Not covered: a raw socket (`node:net`, `node:tls`, `Bun.connect`), so SMTP and PostgreSQL,
 * which the environment guard keeps on the bench, and a child process: bun does not list the
 * proxy variables set here among the keys of `process.env`, so a child that is given a copy of
 * the environment does not get them. A child `bun test` starts its own bench.
 */

import { type AddressInfo, createServer } from 'node:net'
import { type SetupServer, setupServer } from 'msw/node'
import { HOTES_DU_BANC } from './garde-environnement'

// What a declaration is written with. `delay('infinite')` is a service that never answers.
export { delay, HttpResponse, http } from 'msw'

const GUIDE = 'docs/tests/http-sortant.md'

/** An outgoing request that nothing simulated: refused, and kept for the verdict of the test. */
export interface Refus {
	/** `GET`, `POST`… or `CONNECT`, when the net only saw an encrypted connection being opened. */
	methode: string
	/** The host the request was going to, without its port. */
	hote: string
	/** Origin and path. Never the query string: it may carry a token. */
	adresse: string
	/** The layer that refused it. */
	vuePar: 'simulation' | 'filet'
}

const ILLISIBLE = '(illisible)'

/** A host as the bench compares it: in lower case, without the brackets of an IPv6 literal. */
const nomDHote = (hote: string): string => hote.replace(/^\[|\]$/g, '').toLowerCase()

/** True for a host of the bench: a request to it is never refused. */
export const estHoteDuBanc = (hote: string): boolean => HOTES_DU_BANC.includes(nomDHote(hote))

const refusDeRequete = (requete: Request): Refus => {
	const url = new URL(requete.url)
	return {
		methode: requete.method,
		hote: nomDHote(url.hostname),
		adresse: `${url.origin}${url.pathname}`,
		vuePar: 'simulation',
	}
}

/**
 * What the net reads on the first line a client sends to a proxy: `GET http://hôte/chemin HTTP/1.1`,
 * or `CONNECT hôte:443 HTTP/1.1` for https, where the path and the real method stay inside the
 * encrypted connection.
 */
export function refusDeLigne(ligne: string): Refus {
	const [methode = '', cible = ''] = ligne.trim().split(' ')
	const adresse = methode === 'CONNECT' ? `https://${cible}` : cible
	const url = /^https?:\/\//.test(adresse) && URL.canParse(adresse) ? new URL(adresse) : undefined
	if (!url?.hostname) return { methode: methode || '?', hote: ILLISIBLE, adresse: ILLISIBLE, vuePar: 'filet' }
	return {
		methode,
		hote: nomDHote(url.hostname),
		adresse: methode === 'CONNECT' ? url.origin : `${url.origin}${url.pathname}`,
		vuePar: 'filet',
	}
}

const decrire = ({ methode, adresse, hote }: Refus): string => `${methode} ${adresse} (hôte « ${hote} »)`

/** The message of a refusal: what was asked, of which host, and how to simulate it. */
export function messageDesRefus(refus: readonly Refus[], moment = ''): string {
	const titre = refus.length === 1 ? 'Requête sortante non simulée' : `${refus.length} requêtes sortantes non simulées`
	const lignes = [
		`${titre}${moment} : ${refus.map(decrire).join(' ; ')}.`,
		'Aucun test n’appelle Internet : simule ce service dans le test, par simuler(http.get(adresse, () => HttpResponse.json(…))).',
	]
	if (refus.some(({ vuePar }) => vuePar === 'filet'))
		lignes.push(
			'Sous bun, seul fetch se simule : une requête faite par node:http, undici ou Bun.fetch, ou qu’une déclaration laisse passer, finit dans le filet.'
		)
	return [...lignes, `Guide : ${GUIDE}`].join('\n')
}

/**
 * Thrown to the caller of a request nothing simulated, and by the verdict after a test.
 *
 * `code` and `errno` give it the shape of a network error of Node: MSW hands such an error to
 * the caller as it is, where any other one would come back as a mocked 500 response.
 */
export class RequeteNonSimulee extends Error {
	override name = 'RequeteNonSimulee'
	readonly code = 'ERR_REQUETE_NON_SIMULEE'
	readonly errno = 0

	constructor(
		readonly refus: readonly Refus[],
		moment = ''
	) {
		super(messageDesRefus(refus, moment))
	}
}

/** The refusals since the last verdict. bun runs the tests of a run one after the other. */
const refusNotes: Refus[] = []

/**
 * Reads the refusals noted so far, and forgets them: the verdict that follows no longer sees
 * them. Reserved to the tests of this bench, which make a request be refused on purpose.
 */
export function releverLesRefus(): Refus[] {
	return refusNotes.splice(0)
}

/** The verdict: throws when a request was refused since the last one. */
export function exigerAucunRefus(moment: string): void {
	const refus = releverLesRefus()
	if (refus.length > 0) throw new RequeteNonSimulee(refus, moment)
}

/** The variables bun's native client reads before it opens a connection, under both spellings. */
const VARIABLES_DE_PROXY = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'] as const
const VARIABLES_SANS_PROXY = ['NO_PROXY', 'no_proxy'] as const

/**
 * The net: a server of this process that takes the place of a proxy. It reads the first line of
 * each request, notes where it was going, and hangs up without an answer: the caller gets a
 * connection error, never a response it could take for the service's.
 */
function ouvrirLeFilet(): Promise<number> {
	const filet = createServer(prise => {
		let debut = ''
		// A client that gives up first is not an error of the net.
		prise.on('error', () => undefined)
		prise.on('data', morceau => {
			debut += morceau.toString('latin1')
			const fin = debut.indexOf('\r\n')
			if (fin === -1 && debut.length < 8192) return
			refusNotes.push(refusDeLigne(fin === -1 ? debut : debut.slice(0, fin)))
			prise.destroy()
		})
	})
	return new Promise((resolve, reject) => {
		filet.once('error', reject)
		filet.listen(0, '127.0.0.1', () => {
			// The run ends with its last test, net open or not.
			filet.unref()
			resolve((filet.address() as AddressInfo).port)
		})
	})
}

let serveur: SetupServer | undefined
let demarrage: Promise<void> | undefined

async function demarrer(): Promise<void> {
	const filet = `http://127.0.0.1:${await ouvrirLeFilet()}`
	for (const nom of VARIABLES_DE_PROXY) process.env[nom] = filet
	// Both spellings of the IPv6 loopback: the variable is matched against the host as written in the address.
	for (const nom of VARIABLES_SANS_PROXY) process.env[nom] = [...HOTES_DU_BANC, '[::1]'].join(',')

	serveur = setupServer()
	serveur.listen({
		// A function, not 'error': MSW's own strategy lets a request for a picture or a stylesheet out.
		onUnhandledRequest(requete) {
			const refus = refusDeRequete(requete)
			if (estHoteDuBanc(refus.hote)) return
			refusNotes.push(refus)
			throw new RequeteNonSimulee([refus])
		},
	})
}

/**
 * Starts both layers, once. Called by the preload, before any test file: from then on, and
 * until the process ends, nothing leaves this machine over HTTP.
 */
export function demarrerHttpSortant(): Promise<void> {
	demarrage ??= demarrer()
	return demarrage
}

/**
 * Simulates a service: from now to the end of the current test, MSW answers the requests the
 * declarations match. The last declaration made wins; in one call, the first one given wins.
 * To simulate a service for every test of a file, declare it in a `beforeEach`.
 */
export function simuler(...declarations: Parameters<SetupServer['use']>): void {
	if (!serveur)
		throw new Error(
			'Le banc du HTTP sortant n’est pas démarré. Lance les tests depuis la racine du dépôt : bunfig.toml y charge tests/outils/precharge-http-sortant.ts avant tout fichier de test.'
		)
	serveur.use(...declarations)
}

/** Forgets every declaration: the next test starts with none. */
export function oublierLesSimulations(): void {
	serveur?.resetHandlers()
}
