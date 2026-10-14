/**
 * The import of the old site, on the bench (docs/migration/IMPORT.md): it reads the fake Strapi
 * source of the bench (docs/tests/source-strapi.md) and writes into the bench database.
 *
 *   await importerSurLeBanc()            a real run, in this process, with the Payload of the tests
 *   await importerSurLeBanc('a-blanc')   a dry run
 *   await commandeDImport(['--reel'])    the command itself, as a person runs it
 *
 * The source must exist: a test file creates it (`creerLaSourceStrapi()`) and drops it at the end.
 */

import { importer, type OptionsDImport } from '../../scripts/migration/import/importer'
import type { Mode, Rapport } from '../../scripts/migration/import/rapport'
import { ouvrirLaSourceBun } from '../../scripts/migration/import/source-bun'
import { RACINE } from './banc'
import { payloadDeTest } from './payload-test'
import { sourceDuBanc } from './source-strapi'

/** Runs the import in this process, against the source and the database of the bench. */
export async function importerSurLeBanc(
	mode: Mode = 'reel',
	options: Partial<Omit<OptionsDImport, 'payload' | 'source' | 'mode'>> = {}
): Promise<Rapport> {
	const payload = await payloadDeTest()
	const source = ouvrirLaSourceBun(sourceDuBanc().lecture)
	try {
		return await importer({ payload, source, mode, cible: 'locale', ...options })
	} finally {
		await source.fermer()
	}
}

/** Runs `bun scripts/migration/import.ts` as a person would, under this environment, and gives what it printed. */
export async function commandeDImport(
	options: readonly string[],
	environnement: Readonly<Record<string, string | undefined>> = process.env
): Promise<{ code: number; sortie: string }> {
	const enfant = Bun.spawn([process.execPath, '--no-env-file', 'scripts/migration/import.ts', ...options], {
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
