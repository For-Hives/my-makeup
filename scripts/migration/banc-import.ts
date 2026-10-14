/**
 * `bun run banc:import [options]`: the import of the old site, against the bench of this instance
 * (docs/migration/IMPORT.md). It reads the fake Strapi source of the bench and writes into the
 * bench database, with the options of `scripts/migration/import.ts` (`--reel`, `--rapport`).
 *
 * The instance (name and ports) comes from BANC_INSTANCE and BANC_DECALAGE, as for every command of
 * the bench. Started with `--no-env-file`: a working `.env` never reaches the bench.
 */

import { BancRefuse } from '../../tests/outils/banc'
import { bancCourant, exigerBancDebout } from '../banc'

try {
	const banc = bancCourant()
	await exigerBancDebout(banc)
	// Set before the import loads the configuration of Payload: it reads the environment then.
	Object.assign(process.env, banc.environnement)
} catch (erreur) {
	if (!(erreur instanceof BancRefuse)) throw erreur
	console.error(erreur.message)
	process.exit(1)
}

await import('./import')
