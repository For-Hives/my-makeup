/**
 * Starts the Docker image against a throwaway database and checks what the README promises
 * (« Image Docker »): no root, no runtime variable written in the image, migrations played
 * once, a health check that follows the database, and an image optimizer that resizes.
 *
 *   bun run image:controle [image]        default image: my-makeup:local
 *
 * Optional environment:
 *   CONTROLE_IMAGE_NOM      prefix of the containers and of the network (default: mm-controle-image)
 *   CONTROLE_IMAGE_PORT     port of the application on 127.0.0.1 (default: a free one)
 *   CONTROLE_IMAGE_COMMIT   the commit given to the build as SOURCE_COMMIT: /api/health must
 *                           then show its first 7 characters
 *   CONTROLE_IMAGE_PHOTOS   the R2_PUBLIC_URL given to the build: the content policy must then name
 *                           this host and not the one of the live site (default: none was given)
 *
 * It needs the `docker` command and nothing else: the database is a container without any
 * published port, its password is drawn at each run, and everything is removed at the end.
 * It never reads a `.env` file and reaches nothing outside this machine.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { MEDIA_ORIGIN_DEFAULT, mediaOrigin } from '../../src/lib/env'
import { migrations } from '../../src/migrations'
import { citedVariables, HEALTH_PATH, IMAGE_ENVIRONMENT, runtimeVariables } from './regles'

const ROOT = path.resolve(import.meta.dir, '../..')
const DEFAULT_IMAGE = 'my-makeup:local'
const DEFAULT_PREFIX = 'mm-controle-image'

/** A picture of `public/`, wider than the width asked to the optimizer. */
const TEST_PICTURE = '/assets/og-my-makeup.jpg'
/** One of the default `deviceSizes` of Next: any other width is refused with a 400. */
const RESIZED_WIDTH = 640
/** The only quality Next 16 accepts by default. */
const RESIZED_QUALITY = 75

/** /api/health gives up on the database after 2 seconds: a 503 must come back well under this. */
const UNHEALTHY_ANSWER_MAX_MS = 3000

const DATABASE = { user: 'controle', name: 'controle_image' } as const

/** A check that failed. The message is in French and holds no secret. */
export class CheckFailed extends Error {
	override name = 'CheckFailed'
}

interface Ran {
	code: number
	out: string
	err: string
}

/** Runs `docker` without a shell. `env` adds variables for `--env NAME`, so no value sits in the arguments. */
async function docker(args: string[], env: Record<string, string> = {}): Promise<Ran> {
	const child = Bun.spawn(['docker', ...args], {
		env: { ...process.env, ...env },
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, out, err] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	return { code, out: out.trim(), err: err.trim() }
}

/** The output of a `docker` command that must succeed. */
async function dockerOutput(args: string[]): Promise<string> {
	const ran = await docker(args)
	if (ran.code !== 0) throw new CheckFailed(`« docker ${args.slice(0, 2).join(' ')} » a échoué : ${ran.err}`)
	return ran.out
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Asks `probe` twice a second until it gives a value. */
async function waitFor<T>(what: string, seconds: number, probe: () => Promise<T | undefined>): Promise<T> {
	const deadline = Date.now() + seconds * 1000
	for (;;) {
		const value = await probe()
		if (value !== undefined) return value
		if (Date.now() > deadline) throw new CheckFailed(`${what} : toujours pas au bout de ${seconds} secondes.`)
		await pause(500)
	}
}

const passed = (line: string) => console.log(`  ✓ ${line}`)

/** The names of `NAME=value` entries. */
export function environmentNames(entries: readonly string[]): string[] {
	return entries.map(entry => entry.split('=')[0] ?? '')
}

/**
 * What is wrong in the configuration of a built image: its user, the variables it sets, and
 * the runtime variables its history names. Empty when nothing is.
 */
export function imageConfigProblems(image: {
	user: string
	env: readonly string[]
	history: string
	labels: string
	runtimeNames: readonly string[]
}): string[] {
	const problems: string[] = []
	if (['', '0', 'root'].includes(image.user.split(':')[0] ?? ''))
		problems.push('l’image tourne en root : il lui faut une ligne USER.')
	const unexpected = environmentNames(image.env).filter(name => !IMAGE_ENVIRONMENT.includes(name))
	if (unexpected.length > 0)
		problems.push(`l’image fixe des variables qui ne sont pas dans la liste admise : ${unexpected.join(', ')}.`)
	const cited = citedVariables(`${image.history}\n${image.env.join('\n')}\n${image.labels}`, image.runtimeNames)
	if (cited.length > 0) problems.push(`l’image nomme des variables d’exécution : ${cited.join(', ')}.`)
	return problems
}

/** The expected `version` of /api/health for a commit given to the build, or nothing when none was. */
export function expectedVersion(commit: string | undefined): string | undefined {
	const value = commit?.trim() ?? ''
	if (value === '') return undefined
	if (!/^[0-9a-f]{7,40}$/i.test(value))
		throw new CheckFailed('CONTROLE_IMAGE_COMMIT doit être un commit : 7 à 40 chiffres hexadécimaux.')
	return value.slice(0, 7).toLowerCase()
}

/**
 * The origin the photos must be served from by an image built with `built` as R2_PUBLIC_URL
 * (nothing: the build had none, so the photos of the live site). A refused address is a mistake
 * of whoever runs the check, not of the image.
 */
export function expectedPhotosOrigin(built: string | undefined): string {
	try {
		return mediaOrigin(built)
	} catch {
		throw new CheckFailed('CONTROLE_IMAGE_PHOTOS doit être une adresse https://HÔTE, sans chemin ni « / » final.')
	}
}

/**
 * What is wrong in the content policy an image sends, as for the photos: its `img-src` must name
 * the expected origin, and no other remote one (the live site's own origin included, when the
 * build was given another). Empty when nothing is.
 */
export function photosPolicyProblems(policy: string | null, expected: string): string[] {
	if (policy === null || policy === '')
		return ['la réponse ne porte pas l’en-tête Content-Security-Policy-Report-Only.']
	const sources =
		policy
			.split(';')
			.map(part => part.trim().split(/\s+/))
			.find(([name]) => name === 'img-src')
			?.slice(1) ?? []
	const remote = sources.filter(source => /^https?:/.test(source))
	if (remote.length === 1 && remote[0] === expected) return []
	return [
		`la politique de contenu admet les photos de « ${remote.join(' ') || 'aucun hôte'} », attendu : « ${expected} ».`,
	]
}

interface HealthAnswer {
	status: number
	body: unknown
	cacheControl: string | null
	ms: number
}

async function askHealth(port: number): Promise<HealthAnswer | undefined> {
	const started = performance.now()
	try {
		const response = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, { signal: AbortSignal.timeout(5000) })
		const body: unknown = await response.json()
		return {
			status: response.status,
			body,
			cacheControl: response.headers.get('cache-control'),
			ms: performance.now() - started,
		}
	} catch {
		return undefined
	}
}

/** The health status the container engine gives, or nothing when the container has no health check. */
async function engineHealth(container: string): Promise<string | undefined> {
	const ran = await docker(['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{end}}', container])
	return ran.code === 0 && ran.out !== '' ? ran.out : undefined
}

async function main(): Promise<void> {
	const image = process.argv[2] ?? DEFAULT_IMAGE
	const prefix = process.env.CONTROLE_IMAGE_NOM?.trim() || DEFAULT_PREFIX
	const wantedPort = process.env.CONTROLE_IMAGE_PORT?.trim() ?? ''
	if (wantedPort !== '' && !/^\d{2,5}$/.test(wantedPort))
		throw new CheckFailed('CONTROLE_IMAGE_PORT doit être un numéro de port.')
	const version = expectedVersion(process.env.CONTROLE_IMAGE_COMMIT)
	const photos = expectedPhotosOrigin(process.env.CONTROLE_IMAGE_PHOTOS)
	const names = { network: `${prefix}-net`, database: `${prefix}-pg`, first: `${prefix}-1`, second: `${prefix}-2` }
	const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8')

	// The same PostgreSQL as the development database: one pinned image for the repository.
	const compose = Bun.YAML.parse(read('docker-compose.yml')) as { services?: { postgres?: { image?: string } } }
	const postgresImage = compose.services?.postgres?.image
	if (!postgresImage) throw new CheckFailed('docker-compose.yml ne donne plus l’image de PostgreSQL.')

	const databasePassword = randomBytes(24).toString('hex')
	const containerEnv = {
		DATABASE_URI: `postgres://${DATABASE.user}:${databasePassword}@${names.database}:5432/${DATABASE.name}`,
		PAYLOAD_SECRET: randomBytes(32).toString('hex'),
		// The image is built without an address: the container gives it. Any local address will do.
		NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
	}

	const cleanUp = async () => {
		await docker(['rm', '--force', '--volumes', names.first, names.second, names.database])
		await docker(['network', 'rm', names.network])
	}

	// Interrupted by hand or by the CI: nothing is left behind either.
	for (const signal of ['SIGINT', 'SIGTERM'] as const)
		process.once(signal, () => {
			cleanUp().finally(() => process.exit(130))
		})

	/** Starts the image and gives the port it answers on. */
	const startApplication = async (container: string): Promise<number> => {
		const run = (extra: string[]) =>
			docker(
				[
					'run',
					'--detach',
					...['--name', container],
					...['--network', names.network],
					...['--publish', `127.0.0.1:${wantedPort}:3000`],
					...Object.keys(containerEnv).flatMap(name => ['--env', name]),
					...extra,
					image,
				],
				containerEnv
			)
		// The command stays the HEALTHCHECK of the image; only its pace changes, so the verdict
		// comes in seconds. Podman refuses a pace without a command: the image is then run as it is.
		let ran = await run(['--health-interval=2s'])
		if (ran.code !== 0) {
			await docker(['rm', '--force', container])
			ran = await run([])
		}
		if (ran.code !== 0) throw new CheckFailed(`le conteneur de l’image ne démarre pas : ${ran.err}`)
		const published = await dockerOutput(['port', container, '3000/tcp'])
		const port = Number(/:(\d+)\s*$/m.exec(published)?.[1])
		if (!Number.isInteger(port)) throw new CheckFailed(`port publié illisible : ${published}`)
		return port
	}

	const migrationRows = () =>
		dockerOutput([
			...['exec', names.database, 'psql', '--username', DATABASE.user, '--dbname', DATABASE.name],
			...['--no-align', '--tuples-only', '--command'],
			'select id, name, batch, created_at from payload_migrations order by id',
		])

	const healthyAnswer = async (port: number, moment: string): Promise<HealthAnswer> => {
		const answer = await waitFor(`${moment} : ${HEALTH_PATH} en 200`, 90, async () => {
			const got = await askHealth(port)
			return got?.status === 200 ? got : undefined
		})
		const body = answer.body as { ok?: unknown; version?: unknown }
		const keys = Object.keys(body).sort().join(',')
		if (body.ok !== true || typeof body.version !== 'string' || body.version === '' || keys !== 'ok,version')
			throw new CheckFailed(`${moment} : réponse inattendue de ${HEALTH_PATH} : ${JSON.stringify(answer.body)}`)
		if (version !== undefined && body.version !== version)
			throw new CheckFailed(`${moment} : version « ${body.version} », alors que le build a reçu le commit ${version}.`)
		if (answer.cacheControl !== 'no-store')
			throw new CheckFailed(`${moment} : ${HEALTH_PATH} doit répondre « Cache-Control: no-store ».`)
		return answer
	}

	console.log(`Contrôle de l’image ${image}`)
	if ((await docker(['image', 'inspect', image])).code !== 0)
		throw new CheckFailed(`image « ${image} » introuvable : construis-la d’abord (README, « Image Docker »).`)

	// 1. What the image carries, read without starting it.
	const problems = imageConfigProblems({
		user: await dockerOutput(['image', 'inspect', '--format', '{{.Config.User}}', image]),
		env: JSON.parse(await dockerOutput(['image', 'inspect', '--format', '{{json .Config.Env}}', image])) ?? [],
		history: await dockerOutput(['history', '--no-trunc', '--format', '{{.CreatedBy}}', image]),
		labels: await dockerOutput(['image', 'inspect', '--format', '{{json .Config.Labels}}', image]),
		runtimeNames: runtimeVariables(read('.env.exemple')),
	})
	if (problems.length > 0) throw new CheckFailed(problems.join('\n'))
	passed('utilisateur sans droits d’administration ; aucune variable d’exécution dans l’historique ni la configuration')

	const expectedMigrations = migrations.map(migration => migration.name)
	if (expectedMigrations.length === 0) throw new CheckFailed('src/migrations/ ne contient aucune migration.')

	await cleanUp()
	try {
		// 2. An empty database, reachable from the containers of this run only.
		await dockerOutput(['network', 'create', names.network])
		const database = await docker(
			[
				'run',
				'--detach',
				...['--name', names.database],
				...['--network', names.network],
				// PostgreSQL 18 keeps its data under this folder: in memory, gone with the container.
				...['--tmpfs', '/var/lib/postgresql'],
				...['--env', `POSTGRES_USER=${DATABASE.user}`, '--env', `POSTGRES_DB=${DATABASE.name}`],
				...['--env', 'POSTGRES_PASSWORD'],
				postgresImage,
			],
			{ POSTGRES_PASSWORD: databasePassword }
		)
		if (database.code !== 0) throw new CheckFailed(`la base jetable ne démarre pas : ${database.err}`)
		await waitFor('base jetable prête', 60, async () => {
			// Over TCP: the temporary server of the first initialisation listens on the socket only.
			const ready = await docker(['exec', names.database, 'pg_isready', '--host', '127.0.0.1', '--quiet'])
			return ready.code === 0 ? true : undefined
		})

		// 3. First start on the empty database: the migrations are played.
		const firstPort = await startApplication(names.first)
		const first = await healthyAnswer(firstPort, 'premier démarrage')
		const uid = await dockerOutput(['exec', names.first, 'id', '-u'])
		if (uid === '0') throw new CheckFailed('le serveur tourne en root dans le conteneur.')
		passed(`premier démarrage, base vide : ${HEALTH_PATH} répond 200 ${JSON.stringify(first.body)}, uid ${uid}`)

		const firstRows = await migrationRows()
		const played = firstRows.split('\n').map(row => row.split('|')[1])
		if (played.join('\n') !== expectedMigrations.join('\n'))
			throw new CheckFailed(
				`migrations jouées au premier démarrage : ${played.join(', ') || 'aucune'} ; attendu : ${expectedMigrations.join(', ')}.`
			)
		passed(`migrations jouées au premier démarrage : ${played.join(', ')}`)

		// 4. Second start on the same database: nothing is played again.
		await dockerOutput(['rm', '--force', names.first])
		const port = await startApplication(names.second)
		await healthyAnswer(port, 'second démarrage')
		const secondRows = await migrationRows()
		if (secondRows !== firstRows)
			throw new CheckFailed(`le second démarrage a rejoué des migrations :\n${firstRows}\npuis\n${secondRows}`)
		passed('second démarrage : aucune migration jouée, la table des migrations est inchangée')

		// 5. With its database, the container is healthy for the engine too.
		if ((await engineHealth(names.second)) === undefined)
			throw new CheckFailed(
				'le conteneur n’a pas de contrôle de santé : le moteur n’a pas lu le HEALTHCHECK de l’image (avec Podman, l’image se construit au format Docker : README, « Image Docker »).'
			)
		await waitFor('conteneur « sain » pour le moteur', 120, async () =>
			(await engineHealth(names.second)) === 'healthy' ? true : undefined
		)
		passed('avec la base : conteneur « sain » (healthy)')

		// 6. The optimizer gives the test picture back at the width asked, so sharp works in the image.
		const source = await sharp(path.join(ROOT, 'public', TEST_PICTURE)).metadata()
		if (source.width <= RESIZED_WIDTH)
			throw new CheckFailed(`${TEST_PICTURE} doit être plus large que ${RESIZED_WIDTH} px pour ce contrôle.`)
		const query = new URLSearchParams({ url: TEST_PICTURE, w: String(RESIZED_WIDTH), q: String(RESIZED_QUALITY) })
		const picture = await fetch(`http://127.0.0.1:${port}/_next/image?${query}`, {
			headers: { Accept: 'image/webp' },
			signal: AbortSignal.timeout(20_000),
		})
		const type = picture.headers.get('content-type') ?? ''
		if (picture.status !== 200 || type !== 'image/webp')
			throw new CheckFailed(
				`l’optimiseur d’images répond ${picture.status} « ${type} », au lieu de 200 « image/webp ».`
			)
		const resized = await sharp(Buffer.from(await picture.arrayBuffer())).metadata()
		if (resized.width !== RESIZED_WIDTH || resized.format !== 'webp')
			throw new CheckFailed(
				`l’optimiseur rend ${resized.width} px en ${resized.format}, au lieu de ${RESIZED_WIDTH} px en webp.`
			)
		passed(
			`optimiseur d’images : ${TEST_PICTURE} (${source.width} px, ${source.format}) revient en ${resized.width} px, webp`
		)

		// 6b. The photos of the environment the image was built for: the content policy names that host
		// only, and the optimizer refuses the other one (a refusal answers before any request leaves).
		const sent = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, { signal: AbortSignal.timeout(5000) })
		const policyProblems = photosPolicyProblems(sent.headers.get('content-security-policy-report-only'), photos)
		if (policyProblems.length > 0) throw new CheckFailed(policyProblems.join('\n'))
		const refusedHost = photos === MEDIA_ORIGIN_DEFAULT ? 'https://autre-hote.example.test' : MEDIA_ORIGIN_DEFAULT
		const refused = await fetch(
			`http://127.0.0.1:${port}/_next/image?${new URLSearchParams({ url: `${refusedHost}/photo.webp`, w: String(RESIZED_WIDTH), q: String(RESIZED_QUALITY) })}`,
			{ headers: { Accept: 'image/webp' }, signal: AbortSignal.timeout(20_000) }
		)
		if (refused.status !== 400)
			throw new CheckFailed(`l’optimiseur répond ${refused.status} pour ${refusedHost}, au lieu de 400.`)
		passed(`photos de l’environnement : la politique de contenu nomme ${photos} ; l’optimiseur refuse ${refusedHost}`)

		// 7. Without its database: 503 at once, without a detail, then unhealthy for the engine.
		await dockerOutput(['stop', '-t', '1', names.database])
		const down = await waitFor(`sans la base : ${HEALTH_PATH} en 503`, 30, async () => {
			const got = await askHealth(port)
			return got?.status === 503 ? got : undefined
		})
		if (JSON.stringify(down.body) !== '{"ok":false}')
			throw new CheckFailed(
				`sans la base : le 503 doit dire {"ok":false} et rien d’autre, reçu ${JSON.stringify(down.body)}`
			)
		if (down.ms > UNHEALTHY_ANSWER_MAX_MS)
			throw new CheckFailed(
				`sans la base : le 503 a mis ${Math.round(down.ms)} ms, plus de ${UNHEALTHY_ANSWER_MAX_MS} ms.`
			)
		passed(`sans la base : ${HEALTH_PATH} répond 503 {"ok":false} en ${Math.round(down.ms)} ms`)
		// At the pace of the image itself (Podman): 60 seconds of start period, then 3 failures 30 seconds apart.
		await waitFor('conteneur « non sain » pour le moteur', 240, async () =>
			(await engineHealth(names.second)) === 'unhealthy' ? true : undefined
		)
		passed('sans la base : conteneur « non sain » (unhealthy)')
	} catch (error) {
		for (const container of [names.first, names.second]) {
			const logs = await docker(['logs', '--tail', '40', container])
			if (logs.code === 0) console.error(`\nDernières lignes de ${container} :\n${logs.out}\n${logs.err}`)
		}
		throw error
	} finally {
		await cleanUp()
	}
	console.log('Image conforme.')
}

if (import.meta.main) {
	try {
		await main()
	} catch (error) {
		if (!(error instanceof CheckFailed)) throw error
		console.error(`\n  ✗ ${error.message}\nImage refusée.`)
		process.exit(1)
	}
}
