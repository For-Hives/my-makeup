/**
 * What the two HTTP clients of the bench share (tests/support/mailpit.ts and tests/support/s3.ts):
 *
 * - the check that this process was started for the bench instance it is about to read or to
 *   empty, as `exigerBanc` does for the database (tests/support/payload-test.ts);
 * - one request with a deadline, which turns a service that does not answer into a sentence:
 *   which service, where, and the command that starts it.
 *
 * Only `fetch` and Node's own modules: these clients must also load in a test runner that is not bun.
 */

import {
	benchEnvironment,
	benchSilentMessage,
	commandPrefix,
	type Environment,
	type Instance,
	RefusedBench,
	readInstance,
	type Variables,
} from './bench'

/**
 * Longest wait for one answer of a service of the bench. A stopped service refuses the
 * connection at once; one that accepts it and says nothing is given up after this long.
 */
export const REQUEST_DELAY_MS = 2000

/** A service of one bench instance, as the messages name it. */
export interface BenchService {
	/** « capteur de mails », « stockage d’objets » : written after « le », in the middle of a sentence. */
	service: string
	instance: Instance
}

/** What a service of the bench answered, read to its end. */
export interface BenchResponse {
	statut: number
	entetes: Headers
	octets: Uint8Array
}

/**
 * The environment of the bench instance this process works on, once each of these variables
 * holds exactly the value of that instance. Throws `BancRefuse` otherwise: no bench at all (a
 * test started by hand), or another one (a working `.env`, the bench of a neighbour).
 *
 * The message names the variable and never repeats a value.
 */
export function requireBenchVariables(
	service: string,
	noms: readonly string[],
	variables: Variables = process.env
): { instance: Instance; environnement: Environment } {
	const instance = readInstance(variables)
	const environment = benchEnvironment(instance)
	const missing = noms.find(nom => !variables[nom])
	const foreign = noms.find(nom => variables[nom] !== environment[nom])
	if (missing === undefined && foreign === undefined) return { instance, environnement: environment }
	const prefix = commandPrefix(instance)
	throw new RefusedBench(
		[
			missing
				? `Aucun banc de test n’est réglé (${missing} manque) : le ${service} n’est ni lu ni vidé.`
				: `${foreign} ne désigne pas le ${service} du banc de test : il n’est ni lu ni vidé.`,
			`Démarre le banc par « ${prefix}bun run bench:up », puis lance les tests par « ${prefix}bun run test:integration ».`,
		].join(' ')
	)
}

/**
 * One request to a service of the bench, answer read to its end. Throws `BancRefuse` when the
 * service does not answer: connection refused, or nothing within `DELAI_D_UNE_REQUETE_MS`.
 *
 * A redirection is an error: a client of the bench never follows a service somewhere else.
 */
export async function requestBench(
	cible: BenchService,
	adresse: string,
	requete: RequestInit = {}
): Promise<BenchResponse> {
	// A controller and a timer, not `AbortSignal.timeout`: under `bun test`, the global `fetch` is
	// MSW's (tests/support/outgoing-http.ts), and a request it lets through to the bench ignores a
	// timeout signal (bun 1.3.14, MSW 2.15.0). An explicit abort is honoured.
	const controller = new AbortController()
	const delay = setTimeout(() => controller.abort(), REQUEST_DELAY_MS)
	try {
		const response = await fetch(adresse, { ...requete, redirect: 'error', signal: controller.signal })
		return { statut: response.status, entetes: response.headers, octets: new Uint8Array(await response.arrayBuffer()) }
	} catch (cause) {
		throw new RefusedBench(
			benchSilentMessage(cible.instance, [{ service: cible.service, adresse: new URL(adresse).host }]),
			{ cause }
		)
	} finally {
		clearTimeout(delay)
	}
}

/** The error of an answer the client does not know what to do with. `demande` is a few words, never an address. */
export function unexpectedResponse(cible: BenchService, demande: string, reponse: BenchResponse): Error {
	return new Error(
		`Le ${cible.service} du banc « ${cible.instance.nom} » a répondu ${reponse.statut} à la demande « ${demande} ».`
	)
}

/** The body of an answer, read as UTF-8 text. */
export const inText = (reponse: BenchResponse): string => new TextDecoder().decode(reponse.octets)
