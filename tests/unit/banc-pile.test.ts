import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
	BancRefuse,
	DECALAGE_MAX,
	environnementDuBanc,
	FICHIER_COMPOSE,
	FICHIER_ENV,
	INSTANCE_PAR_DEFAUT,
	type Instance,
	lireFichierEnv,
	lireInstance,
	portsDuBanc,
	prefixeDeCommande,
	RACINE,
	servicesDuBanc,
	socketDeRepli,
	variablesDeCompose,
} from '../outils/banc'
import { verifierEnvironnement } from '../outils/garde-environnement'

const PAR_DEFAUT: Instance = { nom: INSTANCE_PAR_DEFAUT, decalage: 0 }

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
			volumes: z.unknown().optional(),
			healthcheck: z.object({ test: z.array(z.string()) }),
		})
	),
	volumes: z.unknown().optional(),
})

const compose = Compose.parse(Bun.YAML.parse(readFileSync(FICHIER_COMPOSE, 'utf8')))

/** What Compose makes of `${NOM:-défaut}` when the variable is given, and when it is not. */
const resoudre = (texte: string, variables: Record<string, string> = {}): string =>
	texte.replace(/\$\{(\w+):-([^}]*)\}/g, (_tout, nom: string, defaut: string) => variables[nom] ?? defaut)

const portsPublies = (variables: Record<string, string> = {}): string[] =>
	Object.values(compose.services).flatMap(({ ports }) => ports.map(port => resoudre(port, variables)))

describe('compose.test.yml : trois services, épinglés, en mémoire, joignables de ce poste seulement', () => {
	test('la pile compte la base, le capteur de mails et le stockage d’objets, et rien d’autre', () => {
		expect(Object.keys(compose.services).sort()).toEqual(['mailpit', 'postgres', 's3mock'])
	})

	test('chaque image est épinglée par son étiquette exacte et par son empreinte', () => {
		for (const [service, { image }] of Object.entries(compose.services))
			expect({ service, image }).toEqual({
				service,
				image: expect.stringMatching(/^[a-z0-9./-]+:v?\d+\.\d+(\.\d+)?(-[a-z0-9.]+)?@sha256:[0-9a-f]{64}$/),
			})
	})

	test('chaque port n’est publié que sur l’interface locale', () => {
		expect(portsPublies().length).toBe(4)
		for (const port of portsPublies()) expect(port).toStartWith('127.0.0.1:')
	})

	test('rien n’est gardé : la base est en mémoire, aucun volume n’est déclaré', () => {
		expect(compose.services.postgres?.tmpfs).toEqual(['/var/lib/postgresql'])
		expect(compose.volumes).toBeUndefined()
		for (const service of Object.values(compose.services)) expect(service.volumes).toBeUndefined()
	})

	test('chaque service dit lui-même quand il est prêt : c’est ce qu’attend « up --wait »', () => {
		for (const service of Object.values(compose.services)) expect(service.healthcheck.test.length).toBeGreaterThan(1)
	})

	test('lancée telle quelle, la pile est celle de .env.test : mêmes ports, même base, même espace', () => {
		const services = servicesDuBanc(environnementDuBanc(PAR_DEFAUT))

		expect(resoudre(compose.name)).toBe(INSTANCE_PAR_DEFAUT)
		expect(portsPublies().sort()).toEqual(
			[
				`127.0.0.1:${services.base.port}:5432`,
				`127.0.0.1:${services.mails.port}:1025`,
				`127.0.0.1:${new URL(services.mails.api).port}:8025`,
				`127.0.0.1:${services.stockage.port}:9090`,
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
	})

	test('les variables données par « banc:up » règlent le nom du projet et chaque port', () => {
		const instance: Instance = { nom: 'banc-voisin', decalage: 20 }
		const variables = variablesDeCompose(instance, servicesDuBanc(environnementDuBanc(instance)))

		expect(resoudre(compose.name, variables)).toBe('banc-voisin')
		expect(portsPublies(variables).sort()).toEqual([
			'127.0.0.1:1045:1025',
			'127.0.0.1:5463:5432',
			'127.0.0.1:8045:8025',
			'127.0.0.1:9110:9090',
		])
	})
})

describe('.env.test : l’environnement factice du banc', () => {
	const fichier = readFileSync(FICHIER_ENV, 'utf8')
	const environnement = lireFichierEnv(fichier)

	test('il décrit les trois services et l’application, sans rien d’autre', () => {
		expect(Object.keys(environnement).sort()).toEqual([
			'APP_ENV',
			'DATABASE_URI',
			'MAILPIT_URL',
			'NEXT_PUBLIC_SITE_URL',
			'PAYLOAD_SECRET',
			'S3_BUCKET',
			'S3_ENDPOINT',
			'SMTP_HOST',
			'SMTP_PORT',
		])
	})

	test('ses valeurs sont factices : un mot de passe et un secret qui le disent, aucun domaine du site', () => {
		expect(servicesDuBanc(environnement).base.motDePasse).toBe('mot-de-passe-factice')
		expect(environnement.PAYLOAD_SECRET).toContain('factice')
		expect(environnement.PAYLOAD_SECRET?.length).toBeGreaterThanOrEqual(32)
		expect(fichier).not.toContain('my-makeup.fr')
	})

	test('bun lit ce fichier comme le banc le lit', async () => {
		const enfant = Bun.spawn(
			[process.execPath, `--env-file=${FICHIER_ENV}`, '-e', 'console.log(JSON.stringify(process.env))'],
			{ cwd: path.join(RACINE, 'tests'), env: {}, stdout: 'pipe', stderr: 'pipe' }
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
		expect(() => lireFichierEnv(`${ligne}\n`)).toThrow(BancRefuse)
	})
})

describe('Plusieurs bancs côte à côte : un nom d’instance et un décalage de ports', () => {
	test('sans variable, c’est l’instance par défaut, sur les ports de .env.test', () => {
		expect(lireInstance({})).toEqual(PAR_DEFAUT)
		expect(lireInstance({ BANC_INSTANCE: '', BANC_DECALAGE: '' })).toEqual(PAR_DEFAUT)
		expect(environnementDuBanc(PAR_DEFAUT)).toEqual(lireFichierEnv(readFileSync(FICHIER_ENV, 'utf8')))
	})

	test('BANC_INSTANCE et BANC_DECALAGE règlent le nom et les ports', () => {
		expect(lireInstance({ BANC_INSTANCE: 'mm-004-005-006', BANC_DECALAGE: '104' })).toEqual({
			nom: 'mm-004-005-006',
			decalage: 104,
		})
	})

	test('le décalage s’ajoute à chaque port, et à rien d’autre', () => {
		expect(environnementDuBanc({ nom: 'voisin', decalage: 104 })).toEqual({
			APP_ENV: 'test',
			DATABASE_URI: 'postgres://banc:mot-de-passe-factice@127.0.0.1:5547/mymakeup_test',
			PAYLOAD_SECRET: 'secret-factice-du-banc-de-test-qui-ne-protege-rien',
			NEXT_PUBLIC_SITE_URL: 'http://localhost:3204',
			SMTP_HOST: '127.0.0.1',
			SMTP_PORT: '1129',
			MAILPIT_URL: 'http://127.0.0.1:8129',
			S3_ENDPOINT: 'http://127.0.0.1:9194',
			S3_BUCKET: 'mymakeup-test',
		})
	})

	test('deux instances décalées ne partagent aucun port', () => {
		const ports = (decalage: number) =>
			portsDuBanc(servicesDuBanc(environnementDuBanc({ nom: 'x', decalage }))).map(({ port }) => port)

		expect(ports(0)).toEqual([5443, 1025, 8025, 9090])
		for (const decalage of [1, 20, 104, DECALAGE_MAX])
			expect(ports(decalage).filter(port => ports(0).includes(port))).toEqual([])
	})

	test('aucun décalage ne pose un banc sur un port du développement', () => {
		const pris: number[] = []
		for (let decalage = 0; decalage <= DECALAGE_MAX; decalage++) {
			const environnement = environnementDuBanc({ nom: 'x', decalage })
			const ports = [
				...portsDuBanc(servicesDuBanc(environnement)).map(({ port }) => port),
				Number(new URL(environnement.NEXT_PUBLIC_SITE_URL ?? '').port),
			]
			pris.push(...ports.filter(port => PORTS_DU_DEVELOPPEMENT.includes(port)))
		}
		expect(pris).toEqual([])
	})

	test('un banc décalé reste un banc pour la garde : tout est local, la base en _test, l’espace en -test', () => {
		for (const decalage of [0, 104, DECALAGE_MAX])
			expect(verifierEnvironnement(environnementDuBanc({ nom: 'x', decalage }))).toBe('test')
	})

	test.each([
		['un nom avec une majuscule', { BANC_INSTANCE: 'Mon-Banc' }],
		['un nom avec un espace', { BANC_INSTANCE: 'mon banc' }],
		['un nom qui commence par un tiret', { BANC_INSTANCE: '-banc' }],
		['un décalage négatif', { BANC_DECALAGE: '-1' }],
		['un décalage qui n’est pas un entier', { BANC_DECALAGE: '1.5' }],
		['un décalage trop grand', { BANC_DECALAGE: String(DECALAGE_MAX + 1) }],
		['un décalage en toutes lettres', { BANC_DECALAGE: 'vingt' }],
	])('refuse %s', (_cas, variables) => {
		expect(() => lireInstance(variables)).toThrow(BancRefuse)
	})

	test('une commande se recopie avec les variables de son instance, et sans rien pour l’instance par défaut', () => {
		expect(prefixeDeCommande(PAR_DEFAUT)).toBe('')
		expect(prefixeDeCommande({ nom: 'voisin', decalage: 20 })).toBe('BANC_INSTANCE=voisin BANC_DECALAGE=20 ')
		expect(prefixeDeCommande({ nom: INSTANCE_PAR_DEFAUT, decalage: 20 })).toBe('BANC_DECALAGE=20 ')
	})
})

describe('Le moteur de conteneurs : Docker, ou Podman sans démon', () => {
	const SOCKET = '/run/user/1000/podman/podman.sock'

	test('le socket de Podman sert de repli quand il existe', () => {
		expect(socketDeRepli({ XDG_RUNTIME_DIR: '/run/user/1000' }, chemin => chemin === SOCKET)).toBe(`unix://${SOCKET}`)
	})

	test('pas de repli sans ce socket, ni quand DOCKER_HOST est déjà réglé', () => {
		expect(socketDeRepli({ XDG_RUNTIME_DIR: '/run/user/1000' }, () => false)).toBeUndefined()
		expect(socketDeRepli({}, () => true)).toBeUndefined()
		expect(
			socketDeRepli({ DOCKER_HOST: 'unix:///ailleurs.sock', XDG_RUNTIME_DIR: '/run/user/1000' }, () => true)
		).toBeUndefined()
	})
})
