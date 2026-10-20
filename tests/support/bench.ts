/**
 * The local test bench, described in one place: the six containers of compose.test.yml
 * (PostgreSQL in memory, mail catcher, object storage, fake Google, fake Umami) and the environment that
 * points at them.
 *
 * `.env.test` is the single source: it describes the default instance. Several benches run
 * side by side on one machine, each under its own name and its own ports, set by two variables:
 *
 *   BENCH_INSTANCE   name of the instance, which is the Compose project (default « my-makeup-test »)
 *   BENCH_OFFSET   number added to every port written in .env.test (default 0)
 *
 * Nothing here starts a container or writes anywhere. scripts/bench.ts is the command line, and
 * tests/support/bench-probes.ts asks the services whether they answer.
 *
 * Only Node's own modules are used: the account factory, which reads this file, must also load
 * in a test runner that is not bun.
 */

import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The date of the switch the import is given on the bench (`--consent-date`, ticket 064): the
 * consent date of the fictional profiles of the fake source that show a phone or an email. Made up.
 */
export const BENCH_CUTOVER_DATE = '2026-11-02T08:00:00.000Z'
export const FILE_ENV = path.join(ROOT, '.env.test')
export const FILE_COMPOSE = path.join(ROOT, 'compose.test.yml')

export const INSTANCE_BY_DEFAULT = 'my-makeup-test'

/** Highest offset: every port of the bench stays under 10 000 and off the ports of development. */
export const OFFSET_MAX = 900

/** What the bench reads: `process.env`, or variables given by a test. */
export type Variables = Readonly<Record<string, string | undefined>>

/** The variables of `.env.test`, by name. */
export type Environment = Readonly<Record<string, string>>

export interface Instance {
	/** Name of the Compose project: containers and networks carry it. */
	nom: string
	/** Added to every port of `.env.test`. */
	decalage: number
}

/** The bench is not usable as asked. The message is in French and safe to print. */
export class RefusedBench extends Error {
	override name = 'BancRefuse'
}

/** A Compose project name: lower case letters, digits, « - » and « _ », starting with a letter or a digit. */
const INSTANCE_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/

/** The instance this process works on. Throws `BancRefuse` on a name or an offset Compose could not use. */
export function readInstance(variables: Variables = process.env): Instance {
	const name = variables.BENCH_INSTANCE || INSTANCE_BY_DEFAULT
	if (!INSTANCE_NAME.test(name))
		throw new RefusedBench(
			'BENCH_INSTANCE refusé : un nom d’instance s’écrit en minuscules, chiffres, « - » et « _ », et commence par une lettre ou un chiffre (63 caractères au plus).'
		)
	const text = variables.BENCH_OFFSET || '0'
	const offset = /^\d{1,4}$/.test(text) ? Number(text) : Number.NaN
	if (!(offset >= 0 && offset <= OFFSET_MAX))
		throw new RefusedBench(`BENCH_OFFSET refusé : un nombre entier de 0 à ${OFFSET_MAX} est attendu.`)
	return { nom: name, decalage: offset }
}

/** The two variables that select an instance, written in front of a command, or nothing for the default one. */
export function commandPrefix({ nom: name, decalage: offset }: Instance): string {
	const chunks = [
		name === INSTANCE_BY_DEFAULT ? '' : `BENCH_INSTANCE=${name}`,
		offset === 0 ? '' : `BENCH_OFFSET=${offset}`,
	]
	return chunks
		.filter(Boolean)
		.map(morceau => `${morceau} `)
		.join('')
}

/**
 * Reads an environment file made of plain `NAME=value` lines. Anything else is refused: a
 * quote or a `$` would be read one way here and another way by `bun --env-file`.
 */
export function readFileEnv(texte: string): Environment {
	const variables: Record<string, string> = {}
	for (const line of texte.split('\n')) {
		if (line.trim() === '' || line.startsWith('#')) continue
		const read = /^([A-Z][A-Z0-9_]*)=(\S(?:.*\S)?)$/.exec(line)
		const [, name, value] = read ?? []
		if (!name || !value || /["'`$\\#]/.test(value))
			throw new RefusedBench(
				`.env.test : ligne illisible (${line.split('=')[0]}). Attendu : NOM=valeur, sans guillemet ni « $ ».`
			)
		variables[name] = value
	}
	return variables
}

/** The value with `decalage` added to its port: a bare port number, or an address that states its port. */
function shift(nom: string, valeur: string, decalage: number): string {
	if (/^\d+$/.test(valeur)) return nom.endsWith('_PORT') ? String(Number(valeur) + decalage) : valeur
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	if (!url?.port) return valeur
	// Rewritten in place, not serialised again: `new URL('http://localhost:3100').href` gains a final « / ».
	if (!valeur.includes(url.host)) throw new RefusedBench(`.env.test : adresse illisible (${nom}).`)
	return valeur.replace(url.host, `${url.hostname}:${Number(url.port) + decalage}`)
}

/** The environment of an instance: `.env.test`, every port moved by the offset of the instance. */
export function benchEnvironment(
	instance: Instance = readInstance(),
	base: Environment = readFileEnv(readFileSync(FILE_ENV, 'utf8'))
): Environment {
	return Object.fromEntries(Object.entries(base).map(([name, value]) => [name, shift(name, value, instance.decalage)]))
}

export interface Services {
	base: { adresse: string; hote: string; port: number; nom: string; utilisateur: string; motDePasse: string }
	mails: { hote: string; port: number; api: string }
	stockage: { adresse: string; port: number; bucket: string }
	/** The fake Google: the address the application takes for Google's, and the made-up client it accepts. */
	google: { adresse: string; port: number; clientId: string; secret: string }
	/** The fake Umami: the instance the application relays its audience measure to. */
	umami: { adresse: string; port: number }
	/** The fake list of the communes: what the application of the end-to-end tests asks instead of geo.api.gouv.fr. */
	communes: { adresse: string; port: number }
}

const demand = (environnement: Environment, nom: string): string => {
	const value = environnement[nom]
	if (!value) throw new RefusedBench(`.env.test : ${nom} manque.`)
	return value
}

const portOf = (adresse: string, nom: string): number => {
	const port = Number(URL.canParse(adresse) ? new URL(adresse).port : Number.NaN)
	if (!(port > 0)) throw new RefusedBench(`.env.test : ${nom} doit écrire son port.`)
	return port
}

/** Where each of the six services of an instance answers, read from its environment. */
export function benchServices(environnement: Environment = benchEnvironment()): Services {
	const base = demand(environnement, 'DATABASE_URI')
	const url = new URL(base)
	const storage = demand(environnement, 'S3_ENDPOINT')
	const api = demand(environnement, 'MAILPIT_URL')
	portOf(api, 'MAILPIT_URL')
	const google = demand(environnement, 'GOOGLE_OIDC_ISSUER')
	const umami = demand(environnement, 'UMAMI_ORIGIN')
	const cities = demand(environnement, 'FAKE_CITIES')
	return {
		base: {
			adresse: base,
			hote: url.hostname,
			port: portOf(base, 'DATABASE_URI'),
			nom: url.pathname.slice(1),
			utilisateur: decodeURIComponent(url.username),
			motDePasse: decodeURIComponent(url.password),
		},
		mails: { hote: demand(environnement, 'SMTP_HOST'), port: Number(demand(environnement, 'SMTP_PORT')), api },
		stockage: { adresse: storage, port: portOf(storage, 'S3_ENDPOINT'), bucket: demand(environnement, 'S3_BUCKET') },
		google: {
			adresse: google,
			port: portOf(google, 'GOOGLE_OIDC_ISSUER'),
			clientId: demand(environnement, 'GOOGLE_CLIENT_ID'),
			secret: demand(environnement, 'GOOGLE_CLIENT_SECRET'),
		},
		umami: { adresse: umami, port: portOf(umami, 'UMAMI_ORIGIN') },
		communes: { adresse: cities, port: portOf(cities, 'FAKE_CITIES') },
	}
}

/** The variables compose.test.yml reads: the project name and the host port of each service. */
export function composeVariables(instance: Instance, services: Services): Record<string, string> {
	return {
		BENCH_INSTANCE: instance.nom,
		BENCH_PORT_POSTGRES: String(services.base.port),
		BENCH_PORT_SMTP: String(services.mails.port),
		BENCH_PORT_MAILPIT: String(portOf(services.mails.api, 'MAILPIT_URL')),
		BENCH_PORT_S3: String(services.stockage.port),
		BENCH_PORT_GOOGLE: String(services.google.port),
		BENCH_PORT_UMAMI: String(services.umami.port),
		BENCH_PORT_CITIES: String(services.communes.port),
	}
}

/** Every port of this machine an instance listens on, with the service behind it. */
export function benchPorts(services: Services): { port: number; service: string }[] {
	return [
		{ port: services.base.port, service: 'base' },
		{ port: services.mails.port, service: 'capteur de mails, SMTP' },
		{ port: portOf(services.mails.api, 'MAILPIT_URL'), service: 'capteur de mails, API' },
		{ port: services.stockage.port, service: 'stockage d’objets' },
		{ port: services.google.port, service: 'faux Google' },
		{ port: services.umami.port, service: 'faux Umami' },
		{ port: services.communes.port, service: 'fausse liste des communes' },
	]
}

/** True when something accepts connections on this port of the loopback interface. */
export function portOpen(port: number, hote = '127.0.0.1', delaiMs = 1000): Promise<boolean> {
	return new Promise(resolve => {
		const taken = createConnection({ host: hote, port })
		const finish = (ouvert: boolean) => {
			taken.destroy()
			resolve(ouvert)
		}
		taken.setTimeout(delaiMs, () => finish(false))
		taken.once('connect', () => finish(true))
		taken.once('error', () => finish(false))
	})
}

/** A service of the bench that was asked whether it answers: its name, and where it was asked. */
export interface ServiceQueried {
	service: string
	/** A host and a port, for the messages: never a password. */
	adresse: string
}

/** What to say when an integration run finds no bench: which service is silent, and the command that starts it. */
export function benchSilentMessage(instance: Instance, muets: readonly ServiceQueried[]): string {
	const list = muets.map(({ service, adresse }) => `${service} (${adresse})`).join(', ')
	return [
		`Le banc de test « ${instance.nom} » ne répond pas : ${list}.`,
		`Démarre-le d’abord : ${commandPrefix(instance)}bun run bench:up`,
	].join('\n')
}

/**
 * The arguments of `bun test` for an integration run: the files asked for, or the whole folder.
 * A file is an argument that looks like a path; the value of an option (`-t 'un nom'`) is not one.
 */
export function testArguments(demandes: readonly string[]): string[] {
	const fileRequest = demandes.some(argument => !argument.startsWith('-') && /[/.]/.test(argument))
	return ['--no-env-file', 'test', ...demandes, ...(fileRequest ? [] : ['./tests/integration'])]
}

/**
 * The container engine to talk to when the default one does not answer: the socket of rootless
 * Podman, if it exists. A `DOCKER_HOST` already set is never replaced.
 */
export function fallbackSocket(variables: Variables, existe: (chemin: string) => boolean): string | undefined {
	if (variables.DOCKER_HOST || !variables.XDG_RUNTIME_DIR) return undefined
	const socket = path.join(variables.XDG_RUNTIME_DIR, 'podman', 'podman.sock')
	return existe(socket) ? `unix://${socket}` : undefined
}
