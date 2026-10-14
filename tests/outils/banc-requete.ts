/**
 * What the two HTTP clients of the bench share (tests/outils/mailpit.ts and tests/outils/s3.ts):
 *
 * - the check that this process was started for the bench instance it is about to read or to
 *   empty, as `exigerBanc` does for the database (tests/outils/payload-test.ts);
 * - one request with a deadline, which turns a service that does not answer into a sentence:
 *   which service, where, and the command that starts it.
 *
 * Only `fetch` and Node's own modules: these clients must also load in a test runner that is not bun.
 */

import {
	BancRefuse,
	type Environnement,
	environnementDuBanc,
	type Instance,
	lireInstance,
	messageBancMuet,
	prefixeDeCommande,
	type Variables,
} from './banc'

/**
 * Longest wait for one answer of a service of the bench. A stopped service refuses the
 * connection at once; one that accepts it and says nothing is given up after this long.
 */
export const DELAI_D_UNE_REQUETE_MS = 2000

/** A service of one bench instance, as the messages name it. */
export interface ServiceDuBanc {
	/** « capteur de mails », « stockage d’objets » : written after « le », in the middle of a sentence. */
	service: string
	instance: Instance
}

/** What a service of the bench answered, read to its end. */
export interface ReponseDuBanc {
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
export function exigerVariablesDuBanc(
	service: string,
	noms: readonly string[],
	variables: Variables = process.env
): { instance: Instance; environnement: Environnement } {
	const instance = lireInstance(variables)
	const environnement = environnementDuBanc(instance)
	const manquante = noms.find(nom => !variables[nom])
	const etrangere = noms.find(nom => variables[nom] !== environnement[nom])
	if (manquante === undefined && etrangere === undefined) return { instance, environnement }
	const prefixe = prefixeDeCommande(instance)
	throw new BancRefuse(
		[
			manquante
				? `Aucun banc de test n’est réglé (${manquante} manque) : le ${service} n’est ni lu ni vidé.`
				: `${etrangere} ne désigne pas le ${service} du banc de test : il n’est ni lu ni vidé.`,
			`Démarre le banc par « ${prefixe}bun run banc:up », puis lance les tests par « ${prefixe}bun run test:integration ».`,
		].join(' ')
	)
}

/**
 * One request to a service of the bench, answer read to its end. Throws `BancRefuse` when the
 * service does not answer: connection refused, or nothing within `DELAI_D_UNE_REQUETE_MS`.
 *
 * A redirection is an error: a client of the bench never follows a service somewhere else.
 */
export async function demanderAuBanc(
	cible: ServiceDuBanc,
	adresse: string,
	requete: RequestInit = {}
): Promise<ReponseDuBanc> {
	try {
		const reponse = await fetch(adresse, {
			...requete,
			redirect: 'error',
			signal: AbortSignal.timeout(DELAI_D_UNE_REQUETE_MS),
		})
		return { statut: reponse.status, entetes: reponse.headers, octets: new Uint8Array(await reponse.arrayBuffer()) }
	} catch (cause) {
		throw new BancRefuse(
			messageBancMuet(cible.instance, [{ service: cible.service, adresse: new URL(adresse).host }]),
			{ cause }
		)
	}
}

/** The error of an answer the client does not know what to do with. `demande` is a few words, never an address. */
export function reponseInattendue(cible: ServiceDuBanc, demande: string, reponse: ReponseDuBanc): Error {
	return new Error(
		`Le ${cible.service} du banc « ${cible.instance.nom} » a répondu ${reponse.statut} à la demande « ${demande} ».`
	)
}

/** The body of an answer, read as UTF-8 text. */
export const enTexte = (reponse: ReponseDuBanc): string => new TextDecoder().decode(reponse.octets)
