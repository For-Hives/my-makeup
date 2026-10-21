/**
 * Command line of the end-to-end tests (docs/tests/e2e.md).
 *
 *   bun run test:e2e                              every test of tests/e2e, at both screen sizes
 *   bun run test:e2e tests/e2e/shell.spec.ts   one file
 *   bun run test:e2e --project=mobile --headed    any option of `playwright test`
 *
 * One run, in this order:
 *   1. refuses a target that is not the application of the bench, a bench that does not answer,
 *      and a port that is already taken;
 *   2. empties the bench database: the application builds its tables itself, by its migrations, and
 *      what lives beside it (the mail catcher, the object storage, the fake Strapi source), which the
 *      integration tests leave behind, and the data cache of Next that a former run left on the disk
 *      (.next/cache/fetch-cache);
 *   3. builds the application for production, with no database, no secret and no `.env`;
 *   4. runs Playwright under Node with the environment of the bench. Playwright starts the
 *      application on the port of the instance, waits until it is healthy, refuses a database
 *      its migrations did not build as the code describes it (tests/support/e2e-server.ts), runs
 *      the tests and stops it (tests/support/e2e.ts). It runs twice, in one process each: every
 *      test but one, then the real import of the fake source, which empties the bench and so
 *      must not meet any other test (`phasesDePlaywright`, ticket 225).
 *
 * The instance (name and ports) comes from BENCH_INSTANCE and BENCH_OFFSET, like the bench.
 * Started with `--no-env-file`: a working `.env` never reaches the tests.
 */

import { existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { portOpen, RefusedBench, ROOT } from '../tests/support/bench'
import {
	applicationPort,
	buildEnvironment,
	playwrightEnvironment,
	playwrightPhases,
	portTakenMessage,
	REPORT_FOLDER,
	requireBenchTarget,
	TRACES_FINAL_FOLDER,
	TRACES_FOLDER,
	testTarget,
} from '../tests/support/e2e'
import { RefusedEnvironment } from '../tests/support/environment-guard'
import { currentBench, emptyUnknownContent, eraseSchema, requireRunningBench } from './bench'

/** Playwright runs under Node: its test runner does not support bun. */
const NODE = 'node'
const PLAYWRIGHT_CLI = path.join(ROOT, 'node_modules/@playwright/test/cli.js')

/** The signals that stop a run: Ctrl+C, and what a tool sends to end a command. */
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

/** Set when a stop was asked for: the run that follows the interrupted one does not start. */
let stopRequested = false

const notFound = (commande: string) =>
	new RefusedBench(`La commande « ${commande} » est introuvable sur ce poste : les essais en ont besoin.`)

const isNotFound = (erreur: unknown) => erreur instanceof Error && 'code' in erreur && erreur.code === 'ENOENT'

/** The pages that Next rendered at a visit and kept on the disk (ticket 269): the profiles, the talents, the articles, the home page. */
function forgetRenderedPages(): void {
	const cache = path.join(ROOT, '.next/server/route-cache/APP_PAGE')
	if (!existsSync(cache)) return
	for (const hash of readdirSync(cache))
		for (const family of ['profil', 'talent', 'blog', 'home-cached'])
			rmSync(path.join(cache, hash, '$', family), { recursive: true, force: true })
}

/** Runs a command in the repository, shows what it prints, and gives back its exit code. */
async function run(commande: string[], env: Record<string, string>): Promise<number> {
	try {
		return await Bun.spawn(commande, { cwd: ROOT, env, stdio: ['inherit', 'inherit', 'inherit'] }).exited
	} catch (error) {
		if (isNotFound(error)) throw notFound(commande[0] ?? '')
		throw error
	}
}

/**
 * Runs Playwright in a process group of its own, and passes every stop on to that group as an
 * interruption.
 *
 * Interrupted, Playwright stops its tests, then the application it started. Ended any other
 * way, it would leave that application running on the port, and the next run would find the
 * port taken. The whole group is signalled: on some machines `node` is a small launcher that
 * starts the real Node as its child, and passes nothing on to it. If this command is killed
 * outright, Playwright, alone in its group, finishes and stops the application by itself.
 */
async function runPlaywright(argumentsDuTest: string[], env: Record<string, string>): Promise<number> {
	let playwright: Bun.Subprocess
	try {
		playwright = Bun.spawn([NODE, PLAYWRIGHT_CLI, ...argumentsDuTest], {
			cwd: ROOT,
			env,
			stdio: ['ignore', 'inherit', 'inherit'],
			detached: true,
		})
	} catch (error) {
		if (isNotFound(error)) throw notFound(NODE)
		throw error
	}
	const interrupt = () => {
		stopRequested = true
		if (playwright.exitCode === null) process.kill(-playwright.pid, 'SIGINT')
	}
	for (const signal of STOP_SIGNALS) process.on(signal, interrupt)
	try {
		return await playwright.exited
	} finally {
		for (const signal of STOP_SIGNALS) process.off(signal, interrupt)
	}
}

async function principal(demandes: string[]): Promise<number> {
	const bench = currentBench()
	const address = requireBenchTarget(process.env, bench.environnement)
	// The guard of the tests, asked here before anything is built or emptied.
	testTarget({ ...process.env, BASE_URL: address })

	await requireRunningBench(bench)
	const port = applicationPort(address)
	if (await portOpen(port)) throw new RefusedBench(portTakenMessage(port))
	await eraseSchema(bench)
	await emptyUnknownContent(bench)

	// The data cache of Next (`unstable_cache`, tickets 097 and 098) lives on the disk, in .next/cache, and
	// outlives a build: an entry of the last run, made before its data existed, would answer this run's pages.
	rmSync(path.join(ROOT, '.next/cache/fetch-cache'), { recursive: true, force: true })

	console.log(`Essais de bout en bout sur le banc « ${bench.instance.nom} » : build de l’application, puis ${address}.`)
	const build = await run(
		[process.execPath, '--no-env-file', 'run', 'build'],
		buildEnvironment(process.env, bench.environnement)
	)
	if (build !== 0)
		throw new RefusedBench(
			'Le build de l’application a échoué : le message de Next est ci-dessus. Aucun essai n’a tourné.'
		)

	// Two runs, one after the other (ticket 225): everything, then the one test that needs the bench to itself.
	// The second one runs even when the first one failed, so that one run shows every red test.
	const environment = playwrightEnvironment(process.env, bench.instance, bench.environnement)
	const { principale: main, finale } = playwrightPhases(demandes)
	let code = 0
	for (const testArguments of [main, finale]) {
		if (!testArguments || stopRequested) continue
		// The pages of the first run (« zoe-lefevre » of the set, for one) must not answer the second one, which writes
		// its own data without going through the application: the cache on the disk is emptied again.
		rmSync(path.join(ROOT, '.next/cache/fetch-cache'), { recursive: true, force: true })
		// The HTML the first run left in the cache of Next (ticket 269) is on the disk too, and would answer the second.
		forgetRenderedPages()
		const end = await runPlaywright(testArguments, environment)
		if (code === 0) code = end
	}
	if (code !== 0)
		console.error(
			[
				'',
				`Pour chaque essai en échec, sa trace, sa vidéo et sa capture sont dans ${TRACES_FOLDER}/ (le dernier essai, celui de l’import réel : ${TRACES_FINAL_FOLDER}/).`,
				`Le rapport se lit par : bunx playwright show-report ${REPORT_FOLDER}`,
			].join('\n')
		)
	return code
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (error) {
	if (!(error instanceof RefusedBench) && !(error instanceof RefusedEnvironment)) throw error
	console.error(error.message)
	process.exit(1)
}
