/**
 * The import of the old site, on the bench (docs/migration/IMPORT.md): it reads the fake Strapi
 * source of the bench (docs/tests/source-strapi.md) and writes into the bench database.
 *
 *   await importerSurLeBanc()            a real run, in this process, with the Payload of the tests
 *   await importerSurLeBanc('dry-run')   a dry run
 *   await commandeDImport(['--real'])    the command itself, as a person runs it
 *
 * Both read the kept answers of the referential of the communes for the fake source
 * (tests/fixtures/import/bench-reference.json), offline: no test calls the Internet. A test
 * that asks the referential itself simulates it (`simuler`) and gives `referentiel`. Both adopt the
 * photos of the source in the storage of the bench, where the source put them.
 *
 * The source must exist: a test file creates it (`creerLaSourceStrapi()`) and drops it at the end.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Decisions, readDecisions } from '../../scripts/migration/import/decisions'
import { importer, type RunOptions } from '../../scripts/migration/import/importer'
import { type KeptReference, keptReference, readAnswers } from '../../scripts/migration/import/reference'
import type { Mode, Report } from '../../scripts/migration/import/report'
import { openSourceBun } from '../../scripts/migration/import/source-bun'
import { BENCH_CUTOVER_DATE, ROOT } from './bench'
import { testPayload } from './payload-test'
import { benchSource } from './source-strapi'

/**
 * The table of decisions of the bench (tests/fixtures/import/bench-decisions.json): of the four
 * accounts of the fake source that share one email, account 9 is kept.
 */
export const BENCH_DECISION_FILE = 'tests/fixtures/import/bench-decisions.json'

export const BENCH_DECISIONS: Decisions = readDecisions(readFileSync(path.join(ROOT, BENCH_DECISION_FILE), 'utf8'))

/**
 * The kept answers of the referential of the communes for every city of the fake source: public
 * reference data of geo.api.gouv.fr (names, INSEE codes, postal codes, centres), never a personal one.
 */
export const BENCH_REFERENCE_FILE = 'tests/fixtures/import/bench-reference.json'

/** The referential of the bench: its kept answers, offline. A question it does not keep stops the run. */
export const benchReference = (): KeptReference =>
	keptReference(readAnswers(readFileSync(path.join(ROOT, BENCH_REFERENCE_FILE), 'utf8')), null)

/**
 * Runs the import in this process, against the source and the database of the bench, with the
 * table of decisions and the referential of the bench unless the test gives others.
 */
export async function importOnBench(
	mode: Mode = 'real',
	options: Partial<Omit<RunOptions, 'payload' | 'source' | 'mode'>> = {}
): Promise<Report> {
	const payload = await testPayload()
	const source = openSourceBun(benchSource().lecture)
	try {
		return await importer({
			payload,
			source,
			mode,
			target: 'local',
			decisions: BENCH_DECISIONS,
			reference: benchReference(),
			media: { base: benchSource().medias },
			consentDate: BENCH_CUTOVER_DATE,
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
export async function importCommand(
	options: readonly string[],
	environnement: Readonly<Record<string, string | undefined>> = process.env
): Promise<{ code: number; sortie: string }> {
	const cities = options.includes('--cities') ? [] : ['--cities', BENCH_REFERENCE_FILE, '--offline']
	const cutover = options.includes('--consent-date') ? [] : ['--consent-date', BENCH_CUTOVER_DATE]
	const line = [process.execPath, '--no-env-file', 'scripts/migration/import.ts', ...options, ...cities, ...cutover]
	const child = Bun.spawn(line, {
		cwd: ROOT,
		env: { ...environnement },
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, output, errors] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	return { code, sortie: output + errors }
}
