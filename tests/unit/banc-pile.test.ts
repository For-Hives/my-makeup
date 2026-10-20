import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { KEY_FORMAT, keyIfSubmitAllowed } from '../../src/lib/seo/indexnow'
import {
	benchEnvironment,
	benchPorts,
	benchServices,
	benchSilentMessage,
	commandPrefix,
	composeVariables,
	FILE_COMPOSE,
	FILE_ENV,
	fallbackSocket,
	INSTANCE_BY_DEFAULT,
	type Instance,
	OFFSET_MAX,
	portOpen,
	RefusedBench,
	ROOT,
	readFileEnv,
	readInstance,
	testArguments,
} from '../support/bench'
import { benchProbes } from '../support/bench-probes'
import { checkEnvironment } from '../support/environment-guard'

const PAR_DEFAUT: Instance = { nom: INSTANCE_BY_DEFAULT, decalage: 0 }

/** The ports of this machine a bench must leave alone: the dev database, PostgreSQL's own port, the dev server. */
const PORTS_DU_DEVELOPPEMENT = [5442, 5432, 3000]

const Compose = z.object({
	name: z.string(),
	services: z.record(
		z.string(),
		z.object({
			image: z.string(),
			ports: z.array(z.string()),
			environment: z.record(z.string(), z.string()).optional(),
			tmpfs: z.array(z.string()).optional(),
			volumes: z.array(z.string()).optional(),
			read_only: z.boolean().optional(),
			command: z.array(z.string()).optional(),
			healthcheck: z.object({ test: z.array(z.string()) }),
		})
	),
	volumes: z.unknown().optional(),
})

const compose = Compose.parse(Bun.YAML.parse(readFileSync(FILE_COMPOSE, 'utf8')))

/** What Compose makes of `${NOM:-défaut}` when the variable is given, and when it is not. */
const resoudre = (texte: string, variables: Record<string, string> = {}): string =>
	texte.replace(/\$\{(\w+):-([^}]*)\}/g, (_tout, nom: string, defaut: string) => variables[nom] ?? defaut)

const portsPublies = (variables: Record<string, string> = {}): string[] =>
	Object.values(compose.services).flatMap(({ ports }) => ports.map(port => resoudre(port, variables)))

describe('compose.test.yml : six services, épinglés, en mémoire, joignables de ce poste seulement', () => {
	test('la pile compte la base, le capteur de mails, le stockage d’objets, le faux Google, le faux Umami et la fausse liste des communes, et rien d’autre', () => {
		expect(Object.keys(compose.services).sort()).toEqual([
			'fake-cities',
			'fake-google',
			'fake-umami',
			'mailpit',
			'postgres',
			's3mock',
		])
	})

	test('chaque image est épinglée par son étiquette exacte et par son empreinte', () => {
		for (const [service, { image }] of Object.entries(compose.services))
			expect({ service, image }).toEqual({
				service,
				image: expect.stringMatching(/^[a-z0-9./-]+:v?\d+\.\d+(\.\d+)?(-[a-z0-9.]+)?@sha256:[0-9a-f]{64}$/),
			})
	})

	test('chaque port n’est publié que sur l’interface locale', () => {
		expect(portsPublies().length).toBe(7)
		for (const port of portsPublies()) expect(port).toStartWith('127.0.0.1:')
	})

	test('rien n’est gardé : la base est en mémoire, aucun volume n’est déclaré', () => {
		const {
			'fake-google': fauxGoogle,
			'fake-umami': fauxUmami,
			'fake-cities': faussesCommunes,
			...autres
		} = compose.services

		expect(compose.services.postgres?.tmpfs).toEqual(['/var/lib/postgresql'])
		expect(compose.volumes).toBeUndefined()
		for (const service of Object.values(autres)) expect(service.volumes).toBeUndefined()
		// The one mount of the stack: the code of the fake Google, read from the repository. It can
		// write neither there nor anywhere in its container.
		expect(fauxGoogle?.volumes).toEqual(['./tests/support/fake-google:/bench:ro'])
		expect(fauxGoogle?.read_only).toBe(true)
		// Same for the fake Umami.
		expect(fauxUmami?.volumes).toEqual(['./tests/support/fake-umami:/bench:ro'])
		expect(fauxUmami?.read_only).toBe(true)
		// And for the fake list of the communes.
		expect(faussesCommunes?.volumes).toEqual(['./tests/support/fake-cities:/bench:ro'])
		expect(faussesCommunes?.read_only).toBe(true)
	})

	test('chaque service dit lui-même quand il est prêt : c’est ce qu’attend « up --wait »', () => {
		for (const service of Object.values(compose.services)) expect(service.healthcheck.test.length).toBeGreaterThan(1)
	})

	test('lancée telle quelle, la pile est celle de .env.test : mêmes ports, même base, même espace', () => {
		const services = benchServices(benchEnvironment(PAR_DEFAUT))

		expect(resoudre(compose.name)).toBe(INSTANCE_BY_DEFAULT)
		expect(portsPublies().sort()).toEqual(
			[
				`127.0.0.1:${services.base.port}:5432`,
				`127.0.0.1:${services.mails.port}:1025`,
				`127.0.0.1:${new URL(services.mails.api).port}:8025`,
				`127.0.0.1:${services.stockage.port}:9090`,
				`127.0.0.1:${services.google.port}:7080`,
				`127.0.0.1:${services.umami.port}:4200`,
				`127.0.0.1:${services.communes.port}:2050`,
			].sort()
		)
		expect(compose.services.postgres?.environment).toEqual({
			POSTGRES_USER: services.base.utilisateur,
			POSTGRES_PASSWORD: services.base.motDePasse,
			POSTGRES_DB: services.base.nom,
		})
		expect(compose.services.s3mock?.environment).toEqual({
			COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS: services.stockage.bucket,
		})
		// The fake Google presents itself under the address the application is given, and accepts
		// the made-up client of .env.test: the same three variables on both sides.
		const google: Record<string, string> = { ...compose.services['fake-google']?.environment }
		google.GOOGLE_OIDC_ISSUER = resoudre(google.GOOGLE_OIDC_ISSUER ?? '')
		expect(google).toEqual({
			GOOGLE_OIDC_ISSUER: services.google.adresse,
			GOOGLE_CLIENT_ID: services.google.clientId,
			GOOGLE_CLIENT_SECRET: services.google.secret,
			FAKE_GOOGLE_LISTEN: '0.0.0.0',
			FAKE_GOOGLE_PORT: '7080',
		})
		// The fake Umami listens where the bench publishes it.
		expect(compose.services['fake-umami']?.environment).toEqual({
			FAKE_UMAMI_LISTEN: '0.0.0.0',
			FAKE_UMAMI_PORT: '4200',
		})
		// The fake list of the communes too.
		expect(compose.services['fake-cities']?.environment).toEqual({
			FAKE_CITIES_LISTEN: '0.0.0.0',
			FAKE_CITIES_PORT: '2050',
		})
	})

	test('le faux Umami et la fausse liste des communes tournent sur le même bun, avec le code du dépôt', () => {
		for (const [service, dossier] of [
			['fake-umami', 'fake-umami'],
			['fake-cities', 'fake-cities'],
		] as const) {
			expect(compose.services[service]?.image).toBe(compose.services['fake-google']?.image ?? '')
			expect(compose.services[service]?.command).toEqual(['bun', '/bench/server.ts'])
			expect(existsSync(path.join(ROOT, `tests/support/${dossier}/server.ts`))).toBe(true)
		}
	})

	test('le faux Google tourne sur le bun du Dockerfile : même image, même empreinte, et le code du dépôt', () => {
		const bunDuDockerfile = /^FROM (oven\/bun:\S+@sha256:[0-9a-f]{64}) /m.exec(
			readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
		)?.[1]

		expect(bunDuDockerfile).toBeDefined()
		expect(compose.services['fake-google']?.image).toBe(bunDuDockerfile ?? '')
		expect(compose.services['fake-google']?.command).toEqual(['bun', '/bench/server.ts'])
		expect(existsSync(path.join(ROOT, 'tests/support/fake-google/server.ts'))).toBe(true)
	})

	test('les variables données par « bench:up » règlent le nom du projet et chaque port', () => {
		const instance: Instance = { nom: 'banc-voisin', decalage: 20 }
		const variables = composeVariables(instance, benchServices(benchEnvironment(instance)))

		expect(resoudre(compose.name, variables)).toBe('banc-voisin')
		expect(portsPublies(variables).sort()).toEqual([
			'127.0.0.1:1045:1025',
			'127.0.0.1:2070:2050',
			'127.0.0.1:4220:4200',
			'127.0.0.1:5463:5432',
			'127.0.0.1:7100:7080',
			'127.0.0.1:8045:8025',
			'127.0.0.1:9110:9090',
		])
		// Its tokens name the port of this machine, not the one of the container.
		expect(resoudre(compose.services['fake-google']?.environment?.GOOGLE_OIDC_ISSUER ?? '', variables)).toBe(
			'http://127.0.0.1:7100'
		)
	})
})

describe('.env.test : l’environnement factice du banc', () => {
	const fichier = readFileSync(FILE_ENV, 'utf8')
	const environnement = readFileEnv(fichier)

	test('il décrit les six services et l’application, sans rien d’autre', () => {
		expect(Object.keys(environnement).sort()).toEqual([
			'APP_ENV',
			'DATABASE_URI',
			'EMAIL_FROM',
			'FAKE_CITIES',
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET',
			'GOOGLE_OIDC_ISSUER',
			'INDEXNOW_KEY',
			'MAILPIT_URL',
			'NEXT_PUBLIC_SITE_URL',
			'NEXT_PUBLIC_UMAMI_DOMAINS',
			'PAYLOAD_SECRET',
			'S3_ACCESS_KEY_ID',
			'S3_BUCKET',
			'S3_ENDPOINT',
			'S3_SECRET_ACCESS_KEY',
			'SMTP_HOST',
			'SMTP_PORT',
			'STRAPI_SOURCE_URI',
			'UMAMI_ORIGIN',
		])
	})

	test('ses valeurs sont factices : un mot de passe et un secret qui le disent, aucun domaine du site', () => {
		expect(benchServices(environnement).base.motDePasse).toBe('mot-de-passe-factice')
		expect(environnement.PAYLOAD_SECRET).toContain('factice')
		expect(environnement.PAYLOAD_SECRET?.length).toBeGreaterThanOrEqual(32)
		expect(environnement.GOOGLE_CLIENT_ID).toContain('factice')
		expect(environnement.GOOGLE_CLIENT_SECRET).toContain('factice')
		expect(environnement.S3_ACCESS_KEY_ID).toContain('factice')
		expect(environnement.S3_SECRET_ACCESS_KEY).toContain('factice')
		expect(fichier).not.toContain('my-makeup.fr')
		// The key of IndexNow is served by the bench, and nothing is ever sent from it.
		expect(environnement.INDEXNOW_KEY).toMatch(KEY_FORMAT)
		expect(keyIfSubmitAllowed(environnement)).toBeUndefined()
		// Nothing that has the shape of a real Google credential, and never Google's own address.
		expect(fichier).not.toMatch(/googleusercontent|GOCSPX|accounts\.google\.com/i)
	})

	test('bun lit ce fichier comme le banc le lit', async () => {
		const enfant = Bun.spawn(
			[process.execPath, `--env-file=${FILE_ENV}`, '-e', 'console.log(JSON.stringify(process.env))'],
			{ cwd: path.join(ROOT, 'tests'), env: {}, stdout: 'pipe', stderr: 'pipe' }
		)
		const lues = z.record(z.string(), z.string()).parse(JSON.parse(await new Response(enfant.stdout).text()))

		expect(await enfant.exited).toBe(0)
		expect(Object.fromEntries(Object.keys(environnement).map(nom => [nom, lues[nom]]))).toEqual(environnement)
	})

	test.each([
		['un guillemet', 'NOM="valeur"'],
		['une variable dans une valeur', 'NOM=http://localhost:$PORT'],
		['un commentaire en fin de ligne', 'NOM=valeur # commentaire'],
		['une ligne sans valeur', 'NOM='],
		['une ligne qui n’est pas une variable', 'export NOM=valeur'],
	])('une ligne que bun lirait autrement est refusée : %s', (_cas, ligne) => {
		expect(() => readFileEnv(`${ligne}\n`)).toThrow(RefusedBench)
	})
})

describe('Plusieurs bancs côte à côte : un nom d’instance et un décalage de ports', () => {
	test('sans variable, c’est l’instance par défaut, sur les ports de .env.test', () => {
		expect(readInstance({})).toEqual(PAR_DEFAUT)
		expect(readInstance({ BENCH_INSTANCE: '', BENCH_OFFSET: '' })).toEqual(PAR_DEFAUT)
		expect(benchEnvironment(PAR_DEFAUT)).toEqual(readFileEnv(readFileSync(FILE_ENV, 'utf8')))
	})

	test('BENCH_INSTANCE et BENCH_OFFSET règlent le nom et les ports', () => {
		expect(readInstance({ BENCH_INSTANCE: 'mm-004-005-006', BENCH_OFFSET: '104' })).toEqual({
			nom: 'mm-004-005-006',
			decalage: 104,
		})
	})

	test('le décalage s’ajoute à chaque port, et à rien d’autre', () => {
		expect(benchEnvironment({ nom: 'voisin', decalage: 104 })).toEqual({
			APP_ENV: 'test',
			DATABASE_URI: 'postgres://banc:mot-de-passe-factice@127.0.0.1:5547/mymakeup_test',
			PAYLOAD_SECRET: 'secret-factice-du-banc-de-test-qui-ne-protege-rien',
			NEXT_PUBLIC_SITE_URL: 'http://localhost:3204',
			SMTP_HOST: '127.0.0.1',
			SMTP_PORT: '1129',
			STRAPI_SOURCE_URI: 'postgres://lecture_strapi:mot-de-passe-factice-de-lecture@127.0.0.1:5547/strapi_source_test',
			MAILPIT_URL: 'http://127.0.0.1:8129',
			EMAIL_FROM: 'My Makeup <ne-pas-repondre@example.test>',
			S3_ENDPOINT: 'http://127.0.0.1:9194',
			S3_BUCKET: 'mymakeup-test',
			S3_ACCESS_KEY_ID: 'cle-factice-du-banc',
			S3_SECRET_ACCESS_KEY: 'secret-factice-du-banc-de-test',
			GOOGLE_OIDC_ISSUER: 'http://127.0.0.1:7184',
			GOOGLE_CLIENT_ID: 'client-google-factice-du-banc',
			GOOGLE_CLIENT_SECRET: 'secret-google-factice-du-banc-de-test',
			UMAMI_ORIGIN: 'http://127.0.0.1:4304',
			NEXT_PUBLIC_UMAMI_DOMAINS: 'localhost,127.0.0.1',
			INDEXNOW_KEY: '0123456789abcdef0123456789abcdef',
			FAKE_CITIES: 'http://127.0.0.1:2154',
		})
	})

	test('deux instances décalées ne partagent aucun port', () => {
		const ports = (decalage: number) =>
			benchPorts(benchServices(benchEnvironment({ nom: 'x', decalage }))).map(({ port }) => port)

		expect(ports(0)).toEqual([5443, 1025, 8025, 9090, 7080, 4200, 2050])
		for (const decalage of [1, 20, 104, OFFSET_MAX])
			expect(ports(decalage).filter(port => ports(0).includes(port))).toEqual([])
		// Whatever the two offsets: two ports of the bench are further apart than the highest offset.
		const tries = [...ports(0), 3100].sort((a, b) => a - b)
		for (const [rang, port] of tries.entries())
			if (rang > 0) expect(port - (tries[rang - 1] ?? 0)).toBeGreaterThan(OFFSET_MAX)
	})

	test('aucun décalage ne pose un banc sur un port du développement', () => {
		const pris: number[] = []
		for (let decalage = 0; decalage <= OFFSET_MAX; decalage++) {
			const environnement = benchEnvironment({ nom: 'x', decalage })
			const ports = [
				...benchPorts(benchServices(environnement)).map(({ port }) => port),
				Number(new URL(environnement.NEXT_PUBLIC_SITE_URL ?? '').port),
			]
			pris.push(...ports.filter(port => PORTS_DU_DEVELOPPEMENT.includes(port)))
		}
		expect(pris).toEqual([])
	})

	test('un banc décalé reste un banc pour la garde : tout est local, la base en _test, l’espace en -test', () => {
		for (const decalage of [0, 104, OFFSET_MAX])
			expect(checkEnvironment(benchEnvironment({ nom: 'x', decalage }))).toBe('test')
	})

	test.each([
		['un nom avec une majuscule', { BENCH_INSTANCE: 'Mon-Banc' }],
		['un nom avec un espace', { BENCH_INSTANCE: 'mon banc' }],
		['un nom qui commence par un tiret', { BENCH_INSTANCE: '-banc' }],
		['un décalage négatif', { BENCH_OFFSET: '-1' }],
		['un décalage qui n’est pas un entier', { BENCH_OFFSET: '1.5' }],
		['un décalage trop grand', { BENCH_OFFSET: String(OFFSET_MAX + 1) }],
		['un décalage en toutes lettres', { BENCH_OFFSET: 'vingt' }],
	])('refuse %s', (_cas, variables) => {
		expect(() => readInstance(variables)).toThrow(RefusedBench)
	})

	test('une commande se recopie avec les variables de son instance, et sans rien pour l’instance par défaut', () => {
		expect(commandPrefix(PAR_DEFAUT)).toBe('')
		expect(commandPrefix({ nom: 'voisin', decalage: 20 })).toBe('BENCH_INSTANCE=voisin BENCH_OFFSET=20 ')
		expect(commandPrefix({ nom: INSTANCE_BY_DEFAULT, decalage: 20 })).toBe('BENCH_OFFSET=20 ')
	})
})

describe('Le moteur de conteneurs : Docker, ou Podman sans démon', () => {
	const SOCKET = '/run/user/1000/podman/podman.sock'

	test('le socket de Podman sert de repli quand il existe', () => {
		expect(fallbackSocket({ XDG_RUNTIME_DIR: '/run/user/1000' }, chemin => chemin === SOCKET)).toBe(`unix://${SOCKET}`)
	})

	test('pas de repli sans ce socket, ni quand DOCKER_HOST est déjà réglé', () => {
		expect(fallbackSocket({ XDG_RUNTIME_DIR: '/run/user/1000' }, () => false)).toBeUndefined()
		expect(fallbackSocket({}, () => true)).toBeUndefined()
		expect(
			fallbackSocket({ DOCKER_HOST: 'unix:///ailleurs.sock', XDG_RUNTIME_DIR: '/run/user/1000' }, () => true)
		).toBeUndefined()
	})
})

describe('La commande d’intégration', () => {
	test('lance un seul fichier quand on le lui donne, tout le dossier sinon, jamais avec le .env de travail', () => {
		expect(testArguments(['tests/integration/banc-base.test.ts'])).toEqual([
			'--no-env-file',
			'test',
			'tests/integration/banc-base.test.ts',
		])
		expect(testArguments([])).toEqual(['--no-env-file', 'test', './tests/integration'])
	})

	test('une option et sa valeur ne sont pas prises pour un fichier', () => {
		expect(testArguments(['--bail'])).toEqual(['--no-env-file', 'test', '--bail', './tests/integration'])
		expect(testArguments(['-t', 'remise à zéro'])).toEqual([
			'--no-env-file',
			'test',
			'-t',
			'remise à zéro',
			'./tests/integration',
		])
	})

	test('le message d’un banc muet nomme les services, leur adresse et la commande qui démarre le banc', () => {
		const instance: Instance = { nom: 'voisin', decalage: 20 }
		const sondes = benchProbes(benchServices(benchEnvironment(instance)))

		expect(benchSilentMessage(instance, sondes)).toBe(
			[
				'Le banc de test « voisin » ne répond pas : base (127.0.0.1:5463), capteur de mails (127.0.0.1:1045), stockage d’objets (127.0.0.1:9110), faux Google (127.0.0.1:7100), faux Umami (127.0.0.1:4220), fausse liste des communes (127.0.0.1:2070).',
				'Démarre-le d’abord : BENCH_INSTANCE=voisin BENCH_OFFSET=20 bun run bench:up',
			].join('\n')
		)
		expect(benchSilentMessage(instance, sondes)).not.toContain('mot-de-passe-factice')
	})

	/** An offset no bench of this machine listens on: its four ports are closed. */
	async function decalageSansBanc(): Promise<number> {
		for (let decalage = OFFSET_MAX; decalage > OFFSET_MAX - 50; decalage--) {
			const ports = benchPorts(benchServices(benchEnvironment({ nom: 'x', decalage })))
			const ouverts = await Promise.all(ports.map(({ port }) => portOpen(port)))
			if (!ouverts.includes(true)) return decalage
		}
		throw new Error('aucun décalage libre pour ce test')
	}

	test('sans la pile, elle s’arrête avant le premier test et dit quoi démarrer', async () => {
		const decalage = await decalageSansBanc()
		const enfant = Bun.spawn(
			[process.execPath, '--no-env-file', 'scripts/bench.ts', 'test', './tests/fixtures/guard-sentinel.ts'],
			{
				cwd: ROOT,
				env: { BENCH_INSTANCE: 'banc-absent', BENCH_OFFSET: String(decalage), PATH: process.env.PATH ?? '' },
				stdout: 'pipe',
				stderr: 'pipe',
			}
		)
		const [code, sortie, erreurs] = await Promise.all([
			enfant.exited,
			new Response(enfant.stdout).text(),
			new Response(enfant.stderr).text(),
		])

		expect(erreurs).toContain('Le banc de test « banc-absent » ne répond pas : base (127.0.0.1:')
		expect(erreurs).toContain(
			`Démarre-le d’abord : BENCH_INSTANCE=banc-absent BENCH_OFFSET=${decalage} bun run bench:up`
		)
		expect(sortie + erreurs).not.toContain('TEMOIN-GARDE')
		expect(code).toBe(1)
	})
})
