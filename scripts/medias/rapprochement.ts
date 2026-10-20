/**
 * `bun run banc:rapprocher [--json] [--hors-import]`: the dry reconciliation of the storage and the database of the
 * bench of this instance (ticket 137, docs/tests/banc.md). It compares the objects of the storage
 * with the media of the database and lists the orphans: objects without a media, media without an
 * object, media without a profile. The bin (`deleted/`) is counted apart.
 *
 * It removes nothing and writes nothing, and has no option that would: it only lists the storage
 * and reads the database. The output is object keys, media identifiers and counts, no personal
 * data. Exit code 0 when there is no orphan, 1 when there is at least one (the CI step that follows
 * the end-to-end tests turns red), 2 when the bench is not there.
 *
 * `--hors-import`: the media the import adopted from the old site (`strapiId`) do not count for the
 * exit code, they are still listed. The end-to-end tests run the import on the fake source, then
 * erase that source: its adopted media have lost their objects on purpose. What the v3 itself wrote
 * stays strict. The full control before a purge runs without the option.
 *
 * The instance (name and ports) comes from BANC_INSTANCE and BANC_DECALAGE, as for every command of
 * the bench. Started with `--no-env-file`: a working `.env` never reaches the bench.
 */

import { BancRefuse } from '../../tests/outils/banc'
import { bancCourant, exigerBancDebout } from '../banc'

try {
	const banc = bancCourant()
	await exigerBancDebout(banc)
	// Set before the configuration of Payload is loaded: it reads the environment then.
	Object.assign(process.env, banc.environnement)
} catch (erreur) {
	if (!(erreur instanceof BancRefuse)) throw erreur
	console.error(erreur.message)
	process.exit(2)
}

const { payloadDeTest } = await import('../../tests/outils/payload-test')
const { serverEnv } = await import('../../src/lib/env')
const { listerLeStockage } = await import('../../src/lib/storage')
const { raconterLeRapprochement } = await import('../../src/lib/reconciliation')
const { rapprocherLeStockageEtLaBase } = await import('../../src/lib/reconciliation-read')

const storage = serverEnv().storage
if (!storage) {
	console.error('Aucun stockage d’objets n’est réglé pour le banc : rien à rapprocher.')
	process.exit(2)
}

// The Payload of the tests: connected to the bench, and never changing its schema.
const payload = await payloadDeTest()
const rapport = await rapprocherLeStockageEtLaBase(payload, () => listerLeStockage(storage))
console.log(process.argv.includes('--json') ? JSON.stringify(rapport, null, 2) : raconterLeRapprochement(rapport))
await payload.destroy()
const propre = process.argv.includes('--hors-import') ? rapport.sansOrphelinHorsImport : rapport.sansOrphelin
process.exit(propre ? 0 : 1)
