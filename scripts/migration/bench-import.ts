/**
 * `bun run banc:import [options]`: the import of the old site, against the bench of this instance
 * (docs/migration/IMPORT.md). It reads the fake Strapi source of the bench and writes into the
 * bench database, with the options of `scripts/migration/import.ts` (`--real`, `--report`). The
 * table of decisions of the bench is given unless the command names another one, and so are the
 * kept answers of the referential of the communes, offline: the bench never asks the Internet.
 *
 * The instance (name and ports) comes from BANC_INSTANCE and BANC_DECALAGE, as for every command of
 * the bench. Started with `--no-env-file`: a working `.env` never reaches the bench.
 */

import { BancRefuse, DATE_DE_BASCULE_DU_BANC } from '../../tests/support/bench'
import { bancCourant, exigerBancDebout } from '../bench'

try {
	const bench = bancCourant()
	await exigerBancDebout(bench)
	// Set before the import loads the configuration of Payload: it reads the environment then.
	Object.assign(process.env, bench.environnement)
} catch (error) {
	if (!(error instanceof BancRefuse)) throw error
	console.error(error.message)
	process.exit(1)
}

/** The table of decisions of the bench: of the four accounts of the fake source that share one email, 9 is kept. */
const BENCH_DECISIONS = 'tests/fixtures/import/decisions-du-banc.json'
if (!process.argv.includes('--decisions')) process.argv.push('--decisions', BENCH_DECISIONS)

/** The answers of the referential of the communes for the cities of the fake source, read offline. */
const BENCH_REFERENCE = 'tests/fixtures/import/referentiel-du-banc.json'
if (!process.argv.includes('--cities')) process.argv.push('--cities', BENCH_REFERENCE, '--offline')

/** The date of the switch of the bench: the consent date of the fictional profiles that show contact details. */
if (!process.argv.includes('--consent-date')) process.argv.push('--consent-date', DATE_DE_BASCULE_DU_BANC)

await import('./import')
