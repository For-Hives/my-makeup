/**
 * What Payload runs once it has started and played its migrations (`onInit`, src/payload.config.ts):
 * on the pre-production, the start of ticket 027 (./tranche.ts, docs/preprod.md); anywhere else,
 * nothing, and nothing more is loaded.
 *
 * The start never stops the application: an error is written in the log by its type and its code,
 * never by its text, which may carry values of the database, and the site keeps serving. The
 * check of the CI then finds the page of the fictional profile missing.
 */

import type { Payload } from 'payload'
import type { ServerEnv } from '../lib/env'

/** The environment the hook reads: where it runs, and the database of Payload. */
export type EnvDuDemarrage = Pick<ServerEnv, 'databaseUri' | 'preprod'>

/** Lines of the start log, as Coolify shows them: one prefix, to find them. */
const journal = (ligne: string): void => console.log(`[preprod] ${ligne}`)

/** The message of an error, when the import or this task wrote it; else its type and its code only. */
async function messageDeLErreur(erreur: unknown): Promise<string> {
	const [{ ImportRefuse }, { ImportInterrompu, messageDUneErreurInattendue }, { PreprodRefusee }] = await Promise.all([
		import('../../scripts/migration/import/cible'),
		import('../../scripts/migration/import/moteur'),
		import('./tranche'),
	])
	if (erreur instanceof ImportRefuse || erreur instanceof ImportInterrompu || erreur instanceof PreprodRefusee)
		return erreur.message
	return messageDUneErreurInattendue(erreur)
}

/**
 * The hook. `migrationEnCours` is Payload's own switch, set by `payload migrate` and by the
 * command of the import (`PAYLOAD_MIGRATING`): such a process must not change the database
 * behind the person who runs it.
 */
export async function auDemarrage(
	payload: Payload,
	env: EnvDuDemarrage,
	migrationEnCours = process.env.PAYLOAD_MIGRATING === 'true'
): Promise<void> {
	if (!env.preprod || migrationEnCours) return
	try {
		const { demarrerLaPreprod } = await import('./tranche')
		await demarrerLaPreprod(payload, { preprod: env.preprod, databaseUri: env.databaseUri, journal })
	} catch (erreur) {
		journal(`Démarrage de la préprod interrompu. ${await messageDeLErreur(erreur)}`)
	}
}
