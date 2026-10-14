/**
 * The global setup of Playwright: what must hold before the first end-to-end test.
 *
 * 1. The target is checked once more: never production, the pre-production only when the run
 *    declares it.
 * 2. The application answers at that address as a healthy one. Otherwise every test would fail
 *    on a timeout, one after the other, without saying why.
 * 3. On the bench, the Payload of the tests is attached to the database once, here, before the
 *    workers. The application has just built its tables by its versioned migrations; a table
 *    the code has and no migration has yet is then created by one process, not by every worker
 *    at the same moment.
 */

import { BancRefuse } from './banc'
import { CHEMIN_DE_SANTE, cibleDesEssais, messageApplicationMuette, messageSansBanc } from './e2e'

const DELAI_DE_SANTE_MS = 5000

interface Sante {
	saine: boolean
	/** A few words for the message: never the body of the answer. */
	constat: string
	version?: string
}

/** What the health route says, or why nothing was read. */
export async function lireLaSante(adresse: string, demander: typeof fetch = fetch): Promise<Sante> {
	let reponse: Response
	try {
		reponse = await demander(`${adresse}${CHEMIN_DE_SANTE}`, { signal: AbortSignal.timeout(DELAI_DE_SANTE_MS) })
	} catch {
		return { saine: false, constat: 'aucune réponse' }
	}
	const corps: unknown = await reponse.json().catch(() => undefined)
	const lu = typeof corps === 'object' && corps !== null ? (corps as { ok?: unknown; version?: unknown }) : {}
	const saine = reponse.status === 200 && lu.ok === true
	return {
		saine,
		constat: saine ? 'saine' : `réponse ${reponse.status}`,
		version: typeof lu.version === 'string' ? lu.version : undefined,
	}
}

/** Longest wait for the Payload of the tests to attach to the bench: a second or two when the schema is in order. */
export const DELAI_DE_BRANCHEMENT_MS = 30_000

export const MESSAGE_SCHEMA_EN_DESACCORD = [
	'Payload attend une réponse en se branchant sur la base du banc : les migrations versionnées et les collections du code ne s’accordent plus (une table ou une colonne renommée, ou retirée du code).',
	'Mets les migrations à jour (bun run payload:migrate:create), puis relance. Aucun essai n’a tourné.',
].join('\n')

/**
 * Runs `action` with the two ways Payload has of waiting for an answer turned into an error.
 *
 * When its schema push meets a question (a column renamed in the code and not in the
 * migrations), it asks it on the terminal and waits, for ever in a run nobody watches. When the
 * question is about data it could lose, and nobody can answer, it ends the process with the
 * code of a success: a run that passes without a single test.
 */
export async function sansQuestion<Resultat>(
	action: () => Promise<Resultat>,
	delaiMs: number = DELAI_DE_BRANCHEMENT_MS
): Promise<Resultat> {
	const sortir = process.exit
	let minuterie: ReturnType<typeof setTimeout> | undefined
	process.exit = (() => {
		throw new BancRefuse(MESSAGE_SCHEMA_EN_DESACCORD)
	}) as typeof process.exit
	try {
		const delai = new Promise<never>((_resultat, refuser) => {
			minuterie = setTimeout(() => refuser(new BancRefuse(MESSAGE_SCHEMA_EN_DESACCORD)), delaiMs)
		})
		return await Promise.race([action(), delai])
	} finally {
		clearTimeout(minuterie)
		process.exit = sortir
	}
}

export default async function avantLePremierEssai(): Promise<void> {
	const { adresse, environnement } = cibleDesEssais()

	const sante = await lireLaSante(adresse)
	if (!sante.saine) throw new BancRefuse(messageApplicationMuette(adresse, sante.constat))

	if (environnement === 'test') {
		// A local application without the environment of the bench: no test could get an account.
		if (!process.env.DATABASE_URI) throw new BancRefuse(messageSansBanc())
		await sansQuestion(async () => {
			// Loaded here and not at the top: a run against the pre-production has no Payload to load.
			const { payloadDeTest } = await import('./payload-test')
			const payload = await payloadDeTest()
			await payload.destroy()
		})
	}

	console.log(
		`Essais de bout en bout : ${adresse}, version ${sante.version ?? 'inconnue'}, environnement « ${environnement} ».`
	)
}
