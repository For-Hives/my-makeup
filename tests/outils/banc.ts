/**
 * The local test bench, described in one place: the five containers of compose.test.yml
 * (PostgreSQL in memory, mail catcher, object storage, fake Google, fake Umami) and the environment that
 * points at them.
 *
 * `.env.test` is the single source: it describes the default instance. Several benches run
 * side by side on one machine, each under its own name and its own ports, set by two variables:
 *
 *   BANC_INSTANCE   name of the instance, which is the Compose project (default « my-makeup-test »)
 *   BANC_DECALAGE   number added to every port written in .env.test (default 0)
 *
 * Nothing here starts a container or writes anywhere. scripts/banc.ts is the command line, and
 * tests/outils/banc-sondes.ts asks the services whether they answer.
 *
 * Only Node's own modules are used: the account factory, which reads this file, must also load
 * in a test runner that is not bun.
 */

import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The date of the switch the import is given on the bench (`--consentement-le`, ticket 064): the
 * consent date of the fictional profiles of the fake source that show a phone or an email. Made up.
 */
export const DATE_DE_BASCULE_DU_BANC = '2026-11-02T08:00:00.000Z'
export const FICHIER_ENV = path.join(RACINE, '.env.test')
export const FICHIER_COMPOSE = path.join(RACINE, 'compose.test.yml')

export const INSTANCE_PAR_DEFAUT = 'my-makeup-test'

/** Highest offset: every port of the bench stays under 10 000 and off the ports of development. */
export const DECALAGE_MAX = 900

/** What the bench reads: `process.env`, or variables given by a test. */
export type Variables = Readonly<Record<string, string | undefined>>

/** The variables of `.env.test`, by name. */
export type Environnement = Readonly<Record<string, string>>

export interface Instance {
	/** Name of the Compose project: containers and networks carry it. */
	nom: string
	/** Added to every port of `.env.test`. */
	decalage: number
}

/** The bench is not usable as asked. The message is in French and safe to print. */
export class BancRefuse extends Error {
	override name = 'BancRefuse'
}

/** A Compose project name: lower case letters, digits, « - » and « _ », starting with a letter or a digit. */
const NOM_D_INSTANCE = /^[a-z0-9][a-z0-9_-]{0,62}$/

/** The instance this process works on. Throws `BancRefuse` on a name or an offset Compose could not use. */
export function lireInstance(variables: Variables = process.env): Instance {
	const nom = variables.BANC_INSTANCE || INSTANCE_PAR_DEFAUT
	if (!NOM_D_INSTANCE.test(nom))
		throw new BancRefuse(
			'BANC_INSTANCE refusé : un nom d’instance s’écrit en minuscules, chiffres, « - » et « _ », et commence par une lettre ou un chiffre (63 caractères au plus).'
		)
	const texte = variables.BANC_DECALAGE || '0'
	const decalage = /^\d{1,4}$/.test(texte) ? Number(texte) : Number.NaN
	if (!(decalage >= 0 && decalage <= DECALAGE_MAX))
		throw new BancRefuse(`BANC_DECALAGE refusé : un nombre entier de 0 à ${DECALAGE_MAX} est attendu.`)
	return { nom, decalage }
}

/** The two variables that select an instance, written in front of a command, or nothing for the default one. */
export function prefixeDeCommande({ nom, decalage }: Instance): string {
	const morceaux = [
		nom === INSTANCE_PAR_DEFAUT ? '' : `BANC_INSTANCE=${nom}`,
		decalage === 0 ? '' : `BANC_DECALAGE=${decalage}`,
	]
	return morceaux
		.filter(Boolean)
		.map(morceau => `${morceau} `)
		.join('')
}

/**
 * Reads an environment file made of plain `NAME=value` lines. Anything else is refused: a
 * quote or a `$` would be read one way here and another way by `bun --env-file`.
 */
export function lireFichierEnv(texte: string): Environnement {
	const variables: Record<string, string> = {}
	for (const ligne of texte.split('\n')) {
		if (ligne.trim() === '' || ligne.startsWith('#')) continue
		const lue = /^([A-Z][A-Z0-9_]*)=(\S(?:.*\S)?)$/.exec(ligne)
		const [, nom, valeur] = lue ?? []
		if (!nom || !valeur || /["'`$\\#]/.test(valeur))
			throw new BancRefuse(
				`.env.test : ligne illisible (${ligne.split('=')[0]}). Attendu : NOM=valeur, sans guillemet ni « $ ».`
			)
		variables[nom] = valeur
	}
	return variables
}

/** The value with `decalage` added to its port: a bare port number, or an address that states its port. */
function decaler(nom: string, valeur: string, decalage: number): string {
	if (/^\d+$/.test(valeur)) return nom.endsWith('_PORT') ? String(Number(valeur) + decalage) : valeur
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	if (!url?.port) return valeur
	// Rewritten in place, not serialised again: `new URL('http://localhost:3100').href` gains a final « / ».
	if (!valeur.includes(url.host)) throw new BancRefuse(`.env.test : adresse illisible (${nom}).`)
	return valeur.replace(url.host, `${url.hostname}:${Number(url.port) + decalage}`)
}

/** The environment of an instance: `.env.test`, every port moved by the offset of the instance. */
export function environnementDuBanc(
	instance: Instance = lireInstance(),
	base: Environnement = lireFichierEnv(readFileSync(FICHIER_ENV, 'utf8'))
): Environnement {
	return Object.fromEntries(Object.entries(base).map(([nom, valeur]) => [nom, decaler(nom, valeur, instance.decalage)]))
}

export interface Services {
	base: { adresse: string; hote: string; port: number; nom: string; utilisateur: string; motDePasse: string }
	mails: { hote: string; port: number; api: string }
	stockage: { adresse: string; port: number; bucket: string }
	/** The fake Google: the address the application takes for Google's, and the made-up client it accepts. */
	google: { adresse: string; port: number; clientId: string; secret: string }
	/** The fake Umami: the instance the application relays its audience measure to. */
	umami: { adresse: string; port: number }
}

const exiger = (environnement: Environnement, nom: string): string => {
	const valeur = environnement[nom]
	if (!valeur) throw new BancRefuse(`.env.test : ${nom} manque.`)
	return valeur
}

const portDe = (adresse: string, nom: string): number => {
	const port = Number(URL.canParse(adresse) ? new URL(adresse).port : Number.NaN)
	if (!(port > 0)) throw new BancRefuse(`.env.test : ${nom} doit écrire son port.`)
	return port
}

/** Where each of the five services of an instance answers, read from its environment. */
export function servicesDuBanc(environnement: Environnement = environnementDuBanc()): Services {
	const base = exiger(environnement, 'DATABASE_URI')
	const url = new URL(base)
	const stockage = exiger(environnement, 'S3_ENDPOINT')
	const api = exiger(environnement, 'MAILPIT_URL')
	portDe(api, 'MAILPIT_URL')
	const google = exiger(environnement, 'GOOGLE_OIDC_ISSUER')
	const umami = exiger(environnement, 'UMAMI_ORIGIN')
	return {
		base: {
			adresse: base,
			hote: url.hostname,
			port: portDe(base, 'DATABASE_URI'),
			nom: url.pathname.slice(1),
			utilisateur: decodeURIComponent(url.username),
			motDePasse: decodeURIComponent(url.password),
		},
		mails: { hote: exiger(environnement, 'SMTP_HOST'), port: Number(exiger(environnement, 'SMTP_PORT')), api },
		stockage: { adresse: stockage, port: portDe(stockage, 'S3_ENDPOINT'), bucket: exiger(environnement, 'S3_BUCKET') },
		google: {
			adresse: google,
			port: portDe(google, 'GOOGLE_OIDC_ISSUER'),
			clientId: exiger(environnement, 'GOOGLE_CLIENT_ID'),
			secret: exiger(environnement, 'GOOGLE_CLIENT_SECRET'),
		},
		umami: { adresse: umami, port: portDe(umami, 'UMAMI_ORIGIN') },
	}
}

/** The variables compose.test.yml reads: the project name and the host port of each service. */
export function variablesDeCompose(instance: Instance, services: Services): Record<string, string> {
	return {
		BANC_INSTANCE: instance.nom,
		BANC_PORT_POSTGRES: String(services.base.port),
		BANC_PORT_SMTP: String(services.mails.port),
		BANC_PORT_MAILPIT: String(portDe(services.mails.api, 'MAILPIT_URL')),
		BANC_PORT_S3: String(services.stockage.port),
		BANC_PORT_GOOGLE: String(services.google.port),
		BANC_PORT_UMAMI: String(services.umami.port),
	}
}

/** Every port of this machine an instance listens on, with the service behind it. */
export function portsDuBanc(services: Services): { port: number; service: string }[] {
	return [
		{ port: services.base.port, service: 'base' },
		{ port: services.mails.port, service: 'capteur de mails, SMTP' },
		{ port: portDe(services.mails.api, 'MAILPIT_URL'), service: 'capteur de mails, API' },
		{ port: services.stockage.port, service: 'stockage d’objets' },
		{ port: services.google.port, service: 'faux Google' },
		{ port: services.umami.port, service: 'faux Umami' },
	]
}

/** True when something accepts connections on this port of the loopback interface. */
export function portOuvert(port: number, hote = '127.0.0.1', delaiMs = 1000): Promise<boolean> {
	return new Promise(resolve => {
		const prise = createConnection({ host: hote, port })
		const finir = (ouvert: boolean) => {
			prise.destroy()
			resolve(ouvert)
		}
		prise.setTimeout(delaiMs, () => finir(false))
		prise.once('connect', () => finir(true))
		prise.once('error', () => finir(false))
	})
}

/** A service of the bench that was asked whether it answers: its name, and where it was asked. */
export interface ServiceInterroge {
	service: string
	/** A host and a port, for the messages: never a password. */
	adresse: string
}

/** What to say when an integration run finds no bench: which service is silent, and the command that starts it. */
export function messageBancMuet(instance: Instance, muets: readonly ServiceInterroge[]): string {
	const liste = muets.map(({ service, adresse }) => `${service} (${adresse})`).join(', ')
	return [
		`Le banc de test « ${instance.nom} » ne répond pas : ${liste}.`,
		`Démarre-le d’abord : ${prefixeDeCommande(instance)}bun run banc:up`,
	].join('\n')
}

/**
 * The arguments of `bun test` for an integration run: the files asked for, or the whole folder.
 * A file is an argument that looks like a path; the value of an option (`-t 'un nom'`) is not one.
 */
export function argumentsDeTest(demandes: readonly string[]): string[] {
	const fichierDemande = demandes.some(argument => !argument.startsWith('-') && /[/.]/.test(argument))
	return ['--no-env-file', 'test', ...demandes, ...(fichierDemande ? [] : ['./tests/integration'])]
}

/**
 * The container engine to talk to when the default one does not answer: the socket of rootless
 * Podman, if it exists. A `DOCKER_HOST` already set is never replaced.
 */
export function socketDeRepli(variables: Variables, existe: (chemin: string) => boolean): string | undefined {
	if (variables.DOCKER_HOST || !variables.XDG_RUNTIME_DIR) return undefined
	const socket = path.join(variables.XDG_RUNTIME_DIR, 'podman', 'podman.sock')
	return existe(socket) ? `unix://${socket}` : undefined
}
