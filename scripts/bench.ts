/**
 * Command line of the local test bench (docs/tests/banc.md).
 *
 *   bun run bench:up                     starts the six containers, returns once all six answer
 *   bun run bench:down                   stops them, removes containers and volumes
 *   bun run bench:prepare                rebuilds the bench database by the migrations, empty
 *   bun run bench:full                starts the stack, loads the whole set, builds and starts the application
 *   bun run bench:reset          puts the bench back to its starting state: database, storage, mails, set
 *   bun run bench:session <compte>       opens the session of an account and writes it to files (never printed)
 *   bun run test:integration [file…]    rebuilds the database, then runs the integration tests
 *
 * The instance (name and ports) comes from BENCH_INSTANCE and BENCH_OFFSET: tests/support/bench.ts.
 * Started with `--no-env-file`: a working `.env` never reaches the bench.
 */

import { existsSync } from 'node:fs'
import { SQL } from 'bun'
import {
	benchEnvironment,
	benchPorts,
	benchServices,
	benchSilentMessage,
	commandPrefix,
	composeVariables,
	type Environment,
	FILE_COMPOSE,
	fallbackSocket,
	type Instance,
	portOpen,
	RefusedBench,
	ROOT,
	readInstance,
	type Services,
	testArguments,
} from '../tests/support/bench'
import { benchProbes, serviceSilent } from '../tests/support/bench-probes'
import {
	applicationEnvironment,
	applicationPort,
	benchUrl,
	buildEnvironment,
	portTakenMessage,
	requireBenchTarget,
	testTarget,
} from '../tests/support/e2e'
import { readHealth } from '../tests/support/e2e-server'

/** Longest wait for the six services, from the first line of `bench:up` to the last. */
const STARTUP_DELAY_MS = 60_000

type ProcessEnvironment = Record<string, string | undefined>

export interface Bench {
	instance: Instance
	/** `.env.test`, with the ports of this instance. */
	environnement: Environment
	services: Services
}

const seconds = (debut: number): string => ((performance.now() - debut) / 1000).toFixed(1).replace('.', ',')

/** The environment the container engine is reached with: Docker, or rootless Podman when Docker does not answer. */
async function containersEngine(): Promise<ProcessEnvironment> {
	const responds = async (env: ProcessEnvironment): Promise<boolean> => {
		try {
			return (await Bun.spawn(['docker', 'version'], { env, stdout: 'ignore', stderr: 'ignore' }).exited) === 0
		} catch {
			return false
		}
	}
	if (await responds(process.env)) return process.env
	const fallback = fallbackSocket(process.env, existsSync)
	if (fallback && (await responds({ ...process.env, DOCKER_HOST: fallback })))
		return { ...process.env, DOCKER_HOST: fallback }
	throw new RefusedBench(
		'Aucun moteur de conteneurs ne répond à la commande « docker ». Démarre Docker ; avec Podman : systemctl --user start podman.socket'
	)
}

/** Compose, on the project and the ports of this instance. */
class Stack {
	private constructor(
		private readonly banc: Bench,
		private readonly env: ProcessEnvironment
	) {}

	static async de(banc: Bench): Promise<Stack> {
		const engine = await containersEngine()
		return new Stack(banc, { ...engine, ...composeVariables(banc.instance, banc.services) })
	}

	private commande(suite: string[]): string[] {
		return ['docker', 'compose', '--project-name', this.banc.instance.nom, '--file', FILE_COMPOSE, ...suite]
	}

	/** Runs Compose and shows what it prints. Returns its exit code. */
	compose(suite: string[]): Promise<number> {
		return Bun.spawn(this.commande(suite), { cwd: ROOT, env: this.env, stdio: ['ignore', 'inherit', 'inherit'] }).exited
	}

	/** Runs a command of the engine and returns what it printed, trimmed. */
	private async lire(commande: string[]): Promise<string> {
		const child = Bun.spawn(commande, { cwd: ROOT, env: this.env, stdout: 'pipe', stderr: 'ignore' })
		const [output] = await Promise.all([new Response(child.stdout).text(), child.exited])
		return output.trim()
	}

	async tourne(): Promise<boolean> {
		return (await this.lire(this.commande(['ps', '--quiet']))) !== ''
	}

	/** What the engine still holds under the name of this instance: containers, then volumes. */
	async restes(): Promise<string> {
		const label = `label=com.docker.compose.project=${this.banc.instance.nom}`
		const lists = await Promise.all([
			this.lire(['docker', 'ps', '--all', '--quiet', '--filter', label]),
			this.lire(['docker', 'volume', 'ls', '--quiet', '--filter', label]),
		])
		return lists.join('')
	}
}

async function start(banc: Bench): Promise<void> {
	const startedAt = performance.now()
	const { instance, services } = banc
	const stack = await Stack.de(banc)

	// A port held by something else is said here, in plain words, before Compose fails halfway.
	if (!(await stack.tourne())) {
		const ports = benchPorts(services)
		const open = await Promise.all(ports.map(({ port }) => portOpen(port)))
		const taken = ports.filter((_port, rang) => open[rang])
		if (taken.length > 0)
			throw new RefusedBench(
				[
					`Port déjà pris sur ce poste : ${taken.map(({ port, service }) => `${port} (${service})`).join(', ')}. Un autre banc y tourne peut-être.`,
					'Donne à ce banc son nom et son décalage de ports, par exemple : BENCH_INSTANCE=mon-banc BENCH_OFFSET=20 bun run bench:up',
				].join('\n')
			)
	}

	const waiting = String(STARTUP_DELAY_MS / 1000)
	if ((await stack.compose(['up', '--detach', '--wait', '--wait-timeout', waiting])) !== 0)
		throw new RefusedBench('Le banc n’a pas démarré : le message de Docker est ci-dessus.')

	// A healthy container is not yet a service that answers from this machine: each one is asked.
	let silent = await serviceSilent(benchProbes(services))
	while (silent.length > 0 && performance.now() - startedAt < STARTUP_DELAY_MS) {
		await Bun.sleep(250)
		silent = await serviceSilent(silent)
	}
	if (silent.length > 0)
		throw new RefusedBench(
			`${benchSilentMessage(instance, silent).split('\n')[0]}\nLes journaux des conteneurs : docker compose --project-name ${instance.nom} logs`
		)

	const { base, mails, stockage: storage, google, umami, communes: cities } = services
	console.log(
		[
			`Banc de test « ${instance.nom} » prêt en ${seconds(startedAt)} s.`,
			`- base : ${base.hote}:${base.port}, base « ${base.nom} », en mémoire`,
			`- capteur de mails : SMTP ${mails.hote}:${mails.port}, boîte ${mails.api}`,
			`- stockage d’objets : ${storage.adresse}, espace « ${storage.bucket} »`,
			`- faux Google : ${google.adresse}, pris pour Google par GOOGLE_OIDC_ISSUER`,
			`- faux Umami : ${umami.adresse}, pris pour l’instance Umami par UMAMI_ORIGIN`,
			`- fausse liste des communes : ${cities.adresse}, prise pour geo.api.gouv.fr par l’application des essais (BENCH_CITIES)`,
			`Pour l’arrêter et tout effacer : ${commandPrefix(instance)}bun run bench:down`,
		].join('\n')
	)
}

async function stop(banc: Bench): Promise<void> {
	const stack = await Stack.de(banc)
	if ((await stack.compose(['down', '--volumes', '--remove-orphans', '--timeout', '2'])) !== 0)
		throw new RefusedBench('Le banc ne s’est pas arrêté : le message de Docker est ci-dessus.')
	if ((await stack.restes()) !== '')
		throw new RefusedBench(
			`Le banc « ${banc.instance.nom} » laisse des conteneurs ou des volumes : voir « docker ps -a ».`
		)
	console.log(`Banc de test « ${banc.instance.nom} » arrêté : conteneurs et volumes supprimés, rien n’est gardé.`)
}

/** Stops with the message that names what to start when a service of the bench is silent. */
export async function requireRunningBench({ instance, services }: Bench): Promise<void> {
	const silent = await serviceSilent(benchProbes(services))
	if (silent.length > 0) throw new RefusedBench(benchSilentMessage(instance, silent))
}

/**
 * Drops every table of the bench database. The versioned migrations then build them again on an
 * empty database: `reconstruireLaBase` below, or the application of the end-to-end tests when it
 * starts. Nothing is left of a previous run, and Payload has no question to ask.
 *
 * The address is the one this file worked out from `.env.test` for the instance: never a value
 * read from the environment.
 */
export async function eraseSchema({ services: { base } }: Bench): Promise<void> {
	// The same rule as the guard of the tests, asked again where the tables are dropped.
	if (!['127.0.0.1', 'localhost'].includes(base.hote) || !base.nom.endsWith('_test'))
		throw new RefusedBench(
			'.env.test ne désigne pas une base locale dont le nom finit par « _test » : rien n’est effacé.'
		)
	const sql = new SQL({ url: base.adresse, max: 1 })
	try {
		await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public')
	} finally {
		await sql.close()
	}
}

/**
 * Empties what lives next to the database and outlasts it: the mails of the catcher, the objects of the
 * storage, and the fake Strapi source. An integration run leaves them behind, and a run of the end-to-end
 * tests that starts on an empty database would still find them: mails and photos of accounts that no longer
 * exist, files under the fixed names the set gives its photos (ticket 225). The fake Umami and the fake
 * Google keep no state a test reads whole.
 */
export async function emptyUnknownContent({ instance, environnement: environment }: Bench): Promise<void> {
	const variables = {
		...environment,
		BENCH_INSTANCE: instance.nom,
		BENCH_OFFSET: String(instance.decalage),
	}
	const [{ benchStorage, emptyStorage }, { benchSink, emptySink }, { eraseSourceStrapi, benchSource }] =
		await Promise.all([
			import('../tests/support/s3'),
			import('../tests/support/mailpit'),
			import('../tests/support/source-strapi'),
		])
	// The source first: erasing it deletes the objects it named, the storage is then emptied whole.
	await eraseSourceStrapi(benchSource(variables, environment))
	await Promise.all([emptyStorage({ stockage: benchStorage(variables) }), emptySink({ capteur: benchSink(variables) })])
}

/**
 * Rebuilds the bench database as the production build does its own: dropped,
 * then the versioned migrations of `src/migrations/` played on the empty database (ticket 049).
 * Then refuses, with what to do, a database the migrations did not build as the collections of
 * the code describe it: a missing migration stops here, before the first test, and not in
 * production. Gives the names of the migrations played.
 */
async function rebuildBase(banc: Bench): Promise<string[]> {
	await eraseSchema(banc)
	// Set before the Payload configuration is loaded: it reads the environment when it is imported.
	Object.assign(process.env, banc.environnement)
	const [{ testPayload }, { requireMigrationsSchema, runMigrations }, { migrations }] = await Promise.all([
		import('../tests/support/payload-test'),
		import('../tests/support/bench-schema'),
		import('../src/migrations'),
	])
	// The Payload of the tests changes no schema when it connects: the migrations build every table.
	const payload = await testPayload()
	const run = await runMigrations(payload, migrations, 'test')
	await requireMigrationsSchema(payload, 'test')
	return run
}

async function prepare(banc: Bench): Promise<void> {
	await requireRunningBench(banc)
	const run = await rebuildBase(banc)
	const { countDocuments } = await import('../tests/support/payload-test')
	const accounts = Object.values(await countDocuments())
	if (accounts.some(compte => compte !== 0))
		throw new RefusedBench('La base du banc n’est pas vide après sa préparation.')
	console.log(
		`Base du banc « ${banc.instance.nom} » prête : ${run.length > 1 ? 'migrations jouées' : 'migration jouée'} sur une base vide (${run.join(', ')}), schéma conforme aux collections du code, ${accounts.length} collections, toutes vides.`
	)
}

async function tester(banc: Bench, demandes: string[]): Promise<number> {
	await requireRunningBench(banc)
	const run = await rebuildBase(banc)
	console.log(
		`Base du banc « ${banc.instance.nom} » reconstruite par ${run.length > 1 ? 'les migrations' : 'la migration'} ${run.join(', ')} : schéma conforme aux collections du code.`
	)
	return Bun.spawn([process.execPath, ...testArguments(demandes)], {
		cwd: ROOT,
		env: {
			...process.env,
			...banc.environnement,
			BENCH_INSTANCE: banc.instance.nom,
			BENCH_OFFSET: String(banc.instance.decalage),
			NODE_ENV: 'test',
		},
		stdio: ['inherit', 'inherit', 'inherit'],
	}).exited
}

/** The longest wait for the application to answer once it is started: the first call starts Payload. */
const APPLICATION_DELAY_MS = 60_000

/** What `bench:reset` and `bench:full` leave in the bench. */
interface Content {
	profils: number
	profilsTypes: number
	talents: number
	articles: number
	comptes: number
	admins: number
	objets: number
}

/**
 * Puts the bench back to its starting state, whatever it held: the database dropped and rebuilt by
 * the versioned migrations, the object storage and the mail catcher emptied, then the whole set
 * loaded (tests/fixtures/bench-dataset.ts). The same content every time, the same identifiers.
 *
 * A running application keeps serving: it reads the same database. The sessions it had opened are
 * gone with the accounts, `bench:session` gives new ones.
 */
async function resetBench(banc: Bench): Promise<Content> {
	await rebuildBase(banc)
	const [{ emptyStorage, listObjects }, { emptySink }, { setBenchDataset }, { testPayload }] = await Promise.all([
		import('../tests/support/s3'),
		import('../tests/support/mailpit'),
		import('../tests/fixtures/bench-dataset'),
		import('../tests/support/payload-test'),
	])
	await Promise.all([emptyStorage(), emptySink()])
	await setBenchDataset()
	const payload = await testPayload()
	const countItems = async (collection: 'profiles' | 'talents' | 'articles' | 'pros' | 'admins') =>
		(await payload.count({ collection, overrideAccess: true })).totalDocs
	const types = await payload.count({
		collection: 'profiles',
		overrideAccess: true,
		where: { 'pro.email': { like: 'jeu-profil-' } },
	})
	return {
		profils: await countItems('profiles'),
		profilsTypes: types.totalDocs,
		talents: await countItems('talents'),
		articles: await countItems('articles'),
		comptes: await countItems('pros'),
		admins: await countItems('admins'),
		objets: (await listObjects()).length,
	}
}

const contentSummary = (c: Content): string =>
	`${c.profilsTypes} profils types (${c.profils} profils en tout), ${c.talents} talents, ${c.articles} articles dont un brouillon, ${c.admins} comptes d’administration, ${c.comptes} comptes de maquilleuses, ${c.objets} objets au stockage`

async function reset(banc: Bench): Promise<void> {
	const startedAt = performance.now()
	await requireRunningBench(banc)
	const content = await resetBench(banc)
	console.log(
		`Banc « ${banc.instance.nom} » remis à son état de départ en ${seconds(startedAt)} s : ${contentSummary(content)}.`
	)
}

/** Builds the application for production, against no database and no secret, then starts it on the port of the bench. */
async function launchApplication(banc: Bench): Promise<number> {
	const url = requireBenchTarget(process.env, banc.environnement)
	// The guard of the tests, asked here before anything is built.
	testTarget({ ...process.env, BASE_URL: url })
	const port = applicationPort(url)
	if (await portOpen(port)) throw new RefusedBench(portTakenMessage(port))

	const startedAt = performance.now()
	console.log(`Build de l’application pour ${url}…`)
	const build = await Bun.spawn([process.execPath, '--no-env-file', 'run', 'build'], {
		cwd: ROOT,
		env: buildEnvironment(process.env, banc.environnement),
		stdio: ['ignore', 'inherit', 'inherit'],
	}).exited
	if (build !== 0) throw new RefusedBench('Le build de l’application a échoué : le message de Next est ci-dessus.')

	const application = Bun.spawn(
		[process.execPath, '--no-env-file', 'run', 'start', '-p', String(port), '-H', '127.0.0.1'],
		{
			cwd: ROOT,
			env: { ...process.env, ...applicationEnvironment(banc.environnement) },
			stdio: ['ignore', 'inherit', 'inherit'],
		}
	)
	const stop = () => application.kill('SIGTERM')
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, stop)

	const limit = performance.now() + APPLICATION_DELAY_MS
	let health = await readHealth(url)
	while (!health.saine && application.exitCode === null && performance.now() < limit) {
		await Bun.sleep(500)
		health = await readHealth(url)
	}
	if (!health.saine) {
		application.kill('SIGTERM')
		await application.exited
		throw new RefusedBench(`L’application ne répond pas à ${url} (${health.constat}) : son journal est ci-dessus.`)
	}
	console.log(
		[
			`Application prête sur ${url} (${seconds(startedAt)} s de build et de démarrage). Ctrl+C l’arrête ; le banc reste.`,
			`Administration : ${url}/admin. Une session : ${commandPrefix(banc.instance)}bun run bench:session admin`,
		].join('\n')
	)
	const code = await application.exited
	return code === 143 || code === 130 ? 0 : code
}

async function full(banc: Bench, options: string[]): Promise<number> {
	const startedAt = performance.now()
	await start(banc)
	const content = await resetBench(banc)
	console.log(`Jeu chargé en ${seconds(startedAt)} s depuis le départ : ${contentSummary(content)}.`)
	if (options.includes('--without-application')) {
		console.log(
			`Pas d’application lancée. Les adresses ci-dessus servent aux tests ; pour l’application : ${commandPrefix(banc.instance)}bun run bench:full`
		)
		return 0
	}
	return launchApplication(banc)
}

async function session(banc: Bench, [demande, ...reste]: string[]): Promise<number> {
	if (!demande || reste.length > 0) {
		console.error('Usage : bun run bench:session <compte>')
		const { unknownAccountMessage } = await import('../tests/support/bench-session')
		console.error(unknownAccountMessage(demande ?? ''))
		return 2
	}
	await requireRunningBench(banc)
	Object.assign(process.env, banc.environnement)
	const [{ testPayload }, { writeSession }] = await Promise.all([
		import('../tests/support/payload-test'),
		import('../tests/support/bench-session'),
	])
	const written = await writeSession(await testPayload(), demande, { instance: banc.instance.nom })
	const url = benchUrl(banc.environnement)
	console.log(
		[
			`Session de ${written.compte} (${written.collection}), ouverte jusqu’à ${written.expire.toLocaleTimeString('fr-FR')}. Le jeton n’est pas affiché.`,
			`- navigateur (Playwright) : browser.newContext({ storageState: '${written.etatDeNavigateur}' }), puis ${url}/admin`,
			`- curl : curl -H @${written.entetes} ${url}/api/${written.collection}/me`,
		].join('\n')
	)
	return 0
}

const USAGE =
	'Usage : bun run bench:up | bench:down | bench:prepare | bench:full | bench:reset | bench:session <compte> | test:integration [fichier…]'

/** The bench this process works on: the instance named by BENCH_INSTANCE and BENCH_OFFSET. */
export function currentBench(): Bench {
	const instance = readInstance()
	const environment = benchEnvironment(instance)
	return { instance, environnement: environment, services: benchServices(environment) }
}

async function principal([commande, ...suite]: string[]): Promise<number> {
	const bench = currentBench()
	switch (commande) {
		case 'up':
			await start(bench)
			return 0
		case 'down':
			await stop(bench)
			return 0
		case 'prepare':
			await prepare(bench)
			return 0
		case 'full':
			return full(bench, suite)
		case 'reset':
			await reset(bench)
			return 0
		case 'session':
			return session(bench, suite)
		case 'test':
			return tester(bench, suite)
		default:
			console.error(USAGE)
			return 2
	}
}

try {
	// Only when this file is the command: scripts/e2e.ts imports the tools above without running it.
	if (import.meta.main) process.exit(await principal(process.argv.slice(2)))
} catch (error) {
	if (!(error instanceof RefusedBench)) throw error
	console.error(error.message)
	process.exit(1)
}
