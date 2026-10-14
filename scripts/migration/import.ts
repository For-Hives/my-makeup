/**
 * Command line of the import of the old site (docs/migration/IMPORT.md).
 *
 *   bun scripts/migration/import.ts                    dry run: what it would write, nothing written
 *   bun scripts/migration/import.ts --reel             writes, then reads the target again (parity)
 *   bun scripts/migration/import.ts --rapport r.json   also writes the report as JSON
 *
 * It reads the Strapi database of STRAPI_SOURCE_URI, read-only, and writes into the database of
 * Payload that DATABASE_URI names, through the Local API. A database that is not on this machine
 * is refused unless the command says `--cible-distante`, before Payload is even loaded.
 *
 * Exit codes: 0 done; 1 refused (an environment variable); 2 command line not understood;
 * 4 the source changed during the run, or the parity of a real run is incomplete.
 *
 * What it prints, and the JSON report, hold numbers, identifiers of the old base and
 * fingerprints only: no name, no email, no hash.
 */

import { writeFileSync } from 'node:fs'
import { lireLesArguments, USAGE } from './import/arguments'
import { ImportRefuse, verifierLaCible } from './import/cible'
import { importer } from './import/importer'
import { importReussi, rapportEnTexte } from './import/rapport'
import { ouvrirLaSourceBun } from './import/source-bun'

async function principal(argumentsDeLaCommande: string[]): Promise<number> {
	const options = lireLesArguments(argumentsDeLaCommande)
	if (!options) {
		console.error(USAGE)
		return 2
	}
	// Before anything is loaded: the configuration of Payload connects to whatever DATABASE_URI names.
	const cible = verifierLaCible(process.env.DATABASE_URI, options)
	const adresseDeLaSource = process.env.STRAPI_SOURCE_URI
	if (!adresseDeLaSource)
		throw new ImportRefuse('STRAPI_SOURCE_URI manque : l’import ne sait pas quelle base Strapi lire. Rien n’est écrit.')

	const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
	const payload = await getPayload({ config })
	const source = ouvrirLaSourceBun(adresseDeLaSource)
	try {
		const rapport = await importer({ payload, source, mode: options.mode, cible })
		console.log(rapportEnTexte(rapport))
		// Read by its owner only: it lists identifiers of the old base.
		if (options.rapport) writeFileSync(options.rapport, `${JSON.stringify(rapport, null, '\t')}\n`, { mode: 0o600 })
		return importReussi(rapport) ? 0 : 4
	} finally {
		await source.fermer()
	}
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (erreur) {
	if (!(erreur instanceof ImportRefuse)) throw erreur
	console.error(erreur.message)
	process.exit(1)
}
