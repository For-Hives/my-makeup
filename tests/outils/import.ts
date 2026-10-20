/**
 * The import of the old site, on the bench (docs/migration/IMPORT.md): it reads the fake Strapi
 * source of the bench (docs/tests/source-strapi.md) and writes into the bench database.
 *
 *   await importerSurLeBanc()            a real run, in this process, with the Payload of the tests
 *   await importerSurLeBanc('a-blanc')   a dry run
 *   await commandeDImport(['--reel'])    the command itself, as a person runs it
 *
 * Both read the kept answers of the referential of the communes for the fake source
 * (tests/fixtures/import/referentiel-du-banc.json), offline: no test calls the Internet. A test
 * that asks the referential itself simulates it (`simuler`) and gives `referentiel`. Both adopt the
 * photos of the source in the storage of the bench, where the source put them.
 *
 * The source must exist: a test file creates it (`creerLaSourceStrapi()`) and drops it at the end.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Decisions, lireLesDecisions } from '../../scripts/migration/import/decisions'
import { importer, type OptionsDImport } from '../../scripts/migration/import/importer'
import type { Mode, Rapport } from '../../scripts/migration/import/report'
import { lireLesReponses, type ReferentielGarde, referentielGarde } from '../../scripts/migration/import/reference'
import { ouvrirLaSourceBun } from '../../scripts/migration/import/source-bun'
import { DATE_DE_BASCULE_DU_BANC, RACINE } from './banc'
import { payloadDeTest } from './payload-test'
import { sourceDuBanc } from './source-strapi'

/**
 * The table of decisions of the bench (tests/fixtures/import/decisions-du-banc.json): of the four
 * accounts of the fake source that share one email, account 9 is kept.
 */
export const FICHIER_DES_DECISIONS_DU_BANC = 'tests/fixtures/import/decisions-du-banc.json'

export const DECISIONS_DU_BANC: Decisions = lireLesDecisions(
	readFileSync(path.join(RACINE, FICHIER_DES_DECISIONS_DU_BANC), 'utf8')
)

/**
 * The kept answers of the referential of the communes for every city of the fake source: public
 * reference data of geo.api.gouv.fr (names, INSEE codes, postal codes, centres), never a personal one.
 */
export const FICHIER_DU_REFERENTIEL_DU_BANC = 'tests/fixtures/import/referentiel-du-banc.json'

/** The referential of the bench: its kept answers, offline. A question it does not keep stops the run. */
export const referentielDuBanc = (): ReferentielGarde =>
	referentielGarde(lireLesReponses(readFileSync(path.join(RACINE, FICHIER_DU_REFERENTIEL_DU_BANC), 'utf8')), null)

/**
 * Runs the import in this process, against the source and the database of the bench, with the
 * table of decisions and the referential of the bench unless the test gives others.
 */
export async function importerSurLeBanc(
	mode: Mode = 'reel',
	options: Partial<Omit<OptionsDImport, 'payload' | 'source' | 'mode'>> = {}
): Promise<Rapport> {
	const payload = await payloadDeTest()
	const source = ouvrirLaSourceBun(sourceDuBanc().lecture)
	try {
		return await importer({
			payload,
			source,
			mode,
			cible: 'locale',
			decisions: DECISIONS_DU_BANC,
			referentiel: referentielDuBanc(),
			medias: { base: sourceDuBanc().medias },
			consentiLe: DATE_DE_BASCULE_DU_BANC,
			...options,
		})
	} finally {
		await source.fermer()
	}
}

/**
 * Runs `bun scripts/migration/import.ts` as a person would, under this environment, and gives what
 * it printed. Unless the options name another file, it reads the referential of the bench offline:
 * a child process is out of reach of the simulation of outgoing calls (docs/tests/http-sortant.md).
 */
export async function commandeDImport(
	options: readonly string[],
	environnement: Readonly<Record<string, string | undefined>> = process.env
): Promise<{ code: number; sortie: string }> {
	const communes = options.includes('--communes') ? [] : ['--communes', FICHIER_DU_REFERENTIEL_DU_BANC, '--hors-ligne']
	const bascule = options.includes('--consentement-le') ? [] : ['--consentement-le', DATE_DE_BASCULE_DU_BANC]
	const ligne = [process.execPath, '--no-env-file', 'scripts/migration/import.ts', ...options, ...communes, ...bascule]
	const enfant = Bun.spawn(ligne, {
		cwd: RACINE,
		env: { ...environnement },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, sortie, erreurs] = await Promise.all([
		enfant.exited,
		new Response(enfant.stdout).text(),
		new Response(enfant.stderr).text(),
	])
	return { code, sortie: sortie + erreurs }
}
