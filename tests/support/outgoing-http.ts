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
 * Two layers, started once per run by the preload (tests/support/preload-outgoing-http.ts):
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
import { BENCH_HOSTS } from './environment-guard'

// What a declaration is written with. `delay('infinite')` is a service that never answers.
export { delay, HttpResponse, http } from 'msw'

const GUIDE = 'docs/tests/http-sortant.md'

/** An outgoing request that nothing simulated: refused, and kept for the verdict of the test. */
export interface Refusal {
	/** `GET`, `POST`… or `CONNECT`, when the net only saw an encrypted connection being opened. */
	methode: string
	/** The host the request was going to, without its port. */
	hote: string
	/** Origin and path. Never the query string: it may carry a token. */
	adresse: string
	/** The layer that refused it. */
	vuePar: 'simulation' | 'filet'
}

const UNREADABLE = '(illisible)'

/** A host as the bench compares it: in lower case, without the brackets of an IPv6 literal. */
const hostName = (hote: string): string => hote.replace(/^\[|\]$/g, '').toLowerCase()

/** True for a host of the bench: a request to it is never refused. */
export const isBenchHost = (hote: string): boolean => BENCH_HOSTS.includes(hostName(hote))

const requestRefusal = (requete: Request): Refusal => {
	const url = new URL(requete.url)
	return {
		methode: requete.method,
		hote: hostName(url.hostname),
		adresse: `${url.origin}${url.pathname}`,
		vuePar: 'simulation',
	}
}

/**
 * What the net reads on the first line a client sends to a proxy: `GET http://hôte/chemin HTTP/1.1`,
 * or `CONNECT hôte:443 HTTP/1.1` for https, where the path and the real method stay inside the
 * encrypted connection.
 */
export function lineRefusal(ligne: string): Refusal {
	const [method = '', target = ''] = ligne.trim().split(' ')
	const address = method === 'CONNECT' ? `https://${target}` : target
	const url = /^https?:\/\//.test(address) && URL.canParse(address) ? new URL(address) : undefined
	if (!url?.hostname) return { methode: method || '?', hote: UNREADABLE, adresse: UNREADABLE, vuePar: 'filet' }
	return {
		methode: method,
		hote: hostName(url.hostname),
		adresse: method === 'CONNECT' ? url.origin : `${url.origin}${url.pathname}`,
		vuePar: 'filet',
	}
}

const describe = ({ methode: method, adresse: address, hote }: Refusal): string =>
	`${method} ${address} (hôte « ${hote} »)`

/** The message of a refusal: what was asked, of which host, and how to simulate it. */
export function refusalMessage(refus: readonly Refusal[], moment = ''): string {
	const title = refus.length === 1 ? 'Requête sortante non simulée' : `${refus.length} requêtes sortantes non simulées`
	const lines = [
		`${title}${moment} : ${refus.map(describe).join(' ; ')}.`,
		'Aucun test n’appelle Internet : simule ce service dans le test, par simuler(http.get(adresse, () => HttpResponse.json(…))).',
	]
	if (refus.some(({ vuePar }) => vuePar === 'filet'))
		lines.push(
			'Sous bun, seul fetch se simule : une requête faite par node:http, undici ou Bun.fetch, ou qu’une déclaration laisse passer, finit dans le filet.'
		)
	return [...lines, `Guide : ${GUIDE}`].join('\n')
}

/**
 * Thrown to the caller of a request nothing simulated, and by the verdict after a test.
 *
 * `code` and `errno` give it the shape of a network error of Node: MSW hands such an error to
 * the caller as it is, where any other one would come back as a mocked 500 response.
 */
export class UnmockedRequest extends Error {
	override name = 'RequeteNonSimulee'
	readonly code = 'ERR_REQUETE_NON_SIMULEE'
	readonly errno = 0

	constructor(
		readonly refus: readonly Refusal[],
		moment = ''
	) {
		super(refusalMessage(refus, moment))
	}
}

/** The refusals since the last verdict. bun runs the tests of a run one after the other. */
const refusalNotes: Refusal[] = []

/**
 * Reads the refusals noted so far, and forgets them: the verdict that follows no longer sees
 * them. Reserved to the tests of this bench, which make a request be refused on purpose.
 */
export function collectRefusal(): Refusal[] {
	return refusalNotes.splice(0)
}

/** The verdict: throws when a request was refused since the last one. */
export function requireNoRefusal(moment: string): void {
	const refusal = collectRefusal()
	if (refusal.length > 0) throw new UnmockedRequest(refusal, moment)
}

/** The variables bun's native client reads before it opens a connection, under both spellings. */
const PROXY_VARIABLES = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'] as const
const VARIABLES_WITHOUT_PROXY = ['NO_PROXY', 'no_proxy'] as const

/**
 * The net: a server of this process that takes the place of a proxy. It reads the first line of
 * each request, notes where it was going, and hangs up without an answer: the caller gets a
 * connection error, never a response it could take for the service's.
 */
function openNet(): Promise<number> {
	const net = createServer(prise => {
		let startedAt = ''
		// A client that gives up first is not an error of the net.
		prise.on('error', () => undefined)
		prise.on('data', morceau => {
			startedAt += morceau.toString('latin1')
			const end = startedAt.indexOf('\r\n')
			if (end === -1 && startedAt.length < 8192) return
			refusalNotes.push(lineRefusal(end === -1 ? startedAt : startedAt.slice(0, end)))
			prise.destroy()
		})
	})
	return new Promise((resolve, reject) => {
		net.once('error', reject)
		net.listen(0, '127.0.0.1', () => {
			// The run ends with its last test, net open or not.
			net.unref()
			resolve((net.address() as AddressInfo).port)
		})
	})
}

let server: SetupServer | undefined
let startup: Promise<void> | undefined

async function start(): Promise<void> {
	const net = `http://127.0.0.1:${await openNet()}`
	for (const name of PROXY_VARIABLES) process.env[name] = net
	// Both spellings of the IPv6 loopback: the variable is matched against the host as written in the address.
	for (const name of VARIABLES_WITHOUT_PROXY) process.env[name] = [...BENCH_HOSTS, '[::1]'].join(',')

	server = setupServer()
	server.listen({
		// A function, not 'error': MSW's own strategy lets a request for a picture or a stylesheet out.
		onUnhandledRequest(requete) {
			const refusal = requestRefusal(requete)
			if (isBenchHost(refusal.hote)) return
			refusalNotes.push(refusal)
			throw new UnmockedRequest([refusal])
		},
	})
}

/**
 * Starts both layers, once. Called by the preload, before any test file: from then on, and
 * until the process ends, nothing leaves this machine over HTTP.
 */
export function startHttpOutgoing(): Promise<void> {
	startup ??= start()
	return startup
}

/**
 * Simulates a service: from now to the end of the current test, MSW answers the requests the
 * declarations match. The last declaration made wins; in one call, the first one given wins.
 * To simulate a service for every test of a file, declare it in a `beforeEach`.
 */
export function simulate(...declarations: Parameters<SetupServer['use']>): void {
	if (!server)
		throw new Error(
			'Le banc du HTTP sortant n’est pas démarré. Lance les tests depuis la racine du dépôt : bunfig.toml y charge tests/support/preload-outgoing-http.ts avant tout fichier de test.'
		)
	server.use(...declarations)
}

/** Forgets every declaration: the next test starts with none. */
export function forgetSimulations(): void {
	server?.resetHandlers()
}
