/**
 * Command line of the end-to-end tests (docs/tests/e2e.md).
 *
 *   bun run test:e2e                              every test of tests/e2e, at both screen sizes
 *   bun run test:e2e tests/e2e/coquille.spec.ts   one file
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
 *      its migrations did not build as the code describes it (tests/outils/serveur-e2e.ts), runs
 *      the tests and stops it (tests/outils/e2e.ts). It runs twice, in one process each: every
 *      test but one, then the real import of the fake source, which empties the bench and so
 *      must not meet any other test (`phasesDePlaywright`, ticket 225).
 *
 * The instance (name and ports) comes from BANC_INSTANCE and BANC_DECALAGE, like the bench.
 * Started with `--no-env-file`: a working `.env` never reaches the tests.
 */

import { rmSync } from 'node:fs'
import path from 'node:path'
import { BancRefuse, portOuvert, RACINE } from '../tests/outils/banc'
import {
	cibleDesEssais,
	DOSSIER_DES_TRACES,
	DOSSIER_DES_TRACES_FINALES,
	DOSSIER_DU_RAPPORT,
	environnementDePlaywright,
	environnementDuBuild,
	exigerCibleDuBanc,
	messagePortPris,
	phasesDePlaywright,
	portDeLApplication,
} from '../tests/outils/e2e'
import { EnvironnementRefuse } from '../tests/outils/garde-environnement'
import { bancCourant, effacerLeSchema, exigerBancDebout, viderCeQueLaBaseNeContientPas } from './banc'

/** Playwright runs under Node: its test runner does not support bun. */
const NODE = 'node'
const CLI_DE_PLAYWRIGHT = path.join(RACINE, 'node_modules/@playwright/test/cli.js')

/** The signals that stop a run: Ctrl+C, and what a tool sends to end a command. */
const ARRETS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

/** Set when a stop was asked for: the run that follows the interrupted one does not start. */
let arretDemande = false

const introuvable = (commande: string) =>
	new BancRefuse(`La commande « ${commande} » est introuvable sur ce poste : les essais en ont besoin.`)

const estIntrouvable = (erreur: unknown) => erreur instanceof Error && 'code' in erreur && erreur.code === 'ENOENT'

/** Runs a command in the repository, shows what it prints, and gives back its exit code. */
async function lancer(commande: string[], env: Record<string, string>): Promise<number> {
	try {
		return await Bun.spawn(commande, { cwd: RACINE, env, stdio: ['inherit', 'inherit', 'inherit'] }).exited
	} catch (erreur) {
		if (estIntrouvable(erreur)) throw introuvable(commande[0] ?? '')
		throw erreur
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
async function lancerPlaywright(argumentsDuTest: string[], env: Record<string, string>): Promise<number> {
	let playwright: Bun.Subprocess
	try {
		playwright = Bun.spawn([NODE, CLI_DE_PLAYWRIGHT, ...argumentsDuTest], {
			cwd: RACINE,
			env,
			stdio: ['ignore', 'inherit', 'inherit'],
			detached: true,
		})
	} catch (erreur) {
		if (estIntrouvable(erreur)) throw introuvable(NODE)
		throw erreur
	}
	const interrompre = () => {
		arretDemande = true
		if (playwright.exitCode === null) process.kill(-playwright.pid, 'SIGINT')
	}
	for (const signal of ARRETS) process.on(signal, interrompre)
	try {
		return await playwright.exited
	} finally {
		for (const signal of ARRETS) process.off(signal, interrompre)
	}
}

async function principal(demandes: string[]): Promise<number> {
	const banc = bancCourant()
	const adresse = exigerCibleDuBanc(process.env, banc.environnement)
	// The guard of the tests, asked here before anything is built or emptied.
	cibleDesEssais({ ...process.env, BASE_URL: adresse })

	await exigerBancDebout(banc)
	const port = portDeLApplication(adresse)
	if (await portOuvert(port)) throw new BancRefuse(messagePortPris(port))
	await effacerLeSchema(banc)
	await viderCeQueLaBaseNeContientPas(banc)

	// The data cache of Next (`unstable_cache`, tickets 097 and 098) lives on the disk, in .next/cache, and
	// outlives a build: an entry of the last run, made before its data existed, would answer this run's pages.
	rmSync(path.join(RACINE, '.next/cache/fetch-cache'), { recursive: true, force: true })

	console.log(`Essais de bout en bout sur le banc « ${banc.instance.nom} » : build de l’application, puis ${adresse}.`)
	const build = await lancer(
		[process.execPath, '--no-env-file', 'run', 'build'],
		environnementDuBuild(process.env, banc.environnement)
	)
	if (build !== 0)
		throw new BancRefuse(
			'Le build de l’application a échoué : le message de Next est ci-dessus. Aucun essai n’a tourné.'
		)

	// Two runs, one after the other (ticket 225): everything, then the one test that needs the bench to itself.
	// The second one runs even when the first one failed, so that one run shows every red test.
	const environnement = environnementDePlaywright(process.env, banc.instance, banc.environnement)
	const { principale, finale } = phasesDePlaywright(demandes)
	let code = 0
	for (const argumentsDuTest of [principale, finale]) {
		if (!argumentsDuTest || arretDemande) continue
		// The pages of the first run (« zoe-lefevre » of the set, for one) must not answer the second one, which writes
		// its own data without going through the application: the cache on the disk is emptied again.
		rmSync(path.join(RACINE, '.next/cache/fetch-cache'), { recursive: true, force: true })
		const fin = await lancerPlaywright(argumentsDuTest, environnement)
		if (code === 0) code = fin
	}
	if (code !== 0)
		console.error(
			[
				'',
				`Pour chaque essai en échec, sa trace, sa vidéo et sa capture sont dans ${DOSSIER_DES_TRACES}/ (le dernier essai, celui de l’import réel : ${DOSSIER_DES_TRACES_FINALES}/).`,
				`Le rapport se lit par : bunx playwright show-report ${DOSSIER_DU_RAPPORT}`,
			].join('\n')
		)
	return code
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (erreur) {
	if (!(erreur instanceof BancRefuse) && !(erreur instanceof EnvironnementRefuse)) throw erreur
	console.error(erreur.message)
	process.exit(1)
}
