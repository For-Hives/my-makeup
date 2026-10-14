/**
 * Command line of the local test bench (docs/tests/banc.md).
 *
 *   bun run banc:up                     starts the four containers, returns once all four answer
 *   bun run banc:down                   stops them, removes containers and volumes
 *   bun run banc:prepare                rebuilds the bench database by the migrations, empty
 *   bun run test:integration [file…]    rebuilds the database, then runs the integration tests
 *
 * The instance (name and ports) comes from BANC_INSTANCE and BANC_DECALAGE: tests/outils/banc.ts.
 * Started with `--no-env-file`: a working `.env` never reaches the bench.
 */

import { existsSync } from 'node:fs'
import { SQL } from 'bun'
import {
	argumentsDeTest,
	BancRefuse,
	type Environnement,
	environnementDuBanc,
	FICHIER_COMPOSE,
	type Instance,
	lireInstance,
	messageBancMuet,
	portOuvert,
	portsDuBanc,
	prefixeDeCommande,
	RACINE,
	type Services,
	servicesDuBanc,
	socketDeRepli,
	variablesDeCompose,
} from '../tests/outils/banc'
import { servicesMuets, sondesDuBanc } from '../tests/outils/banc-sondes'

/** Longest wait for the four services, from the first line of `banc:up` to the last. */
const DELAI_DE_DEMARRAGE_MS = 60_000

type EnvironnementDeProcessus = Record<string, string | undefined>

export interface Banc {
	instance: Instance
	/** `.env.test`, with the ports of this instance. */
	environnement: Environnement
	services: Services
}

const secondes = (debut: number): string => ((performance.now() - debut) / 1000).toFixed(1).replace('.', ',')

/** The environment the container engine is reached with: Docker, or rootless Podman when Docker does not answer. */
async function moteurDeConteneurs(): Promise<EnvironnementDeProcessus> {
	const repond = async (env: EnvironnementDeProcessus): Promise<boolean> => {
		try {
			return (await Bun.spawn(['docker', 'version'], { env, stdout: 'ignore', stderr: 'ignore' }).exited) === 0
		} catch {
			return false
		}
	}
	if (await repond(process.env)) return process.env
	const repli = socketDeRepli(process.env, existsSync)
	if (repli && (await repond({ ...process.env, DOCKER_HOST: repli }))) return { ...process.env, DOCKER_HOST: repli }
	throw new BancRefuse(
		'Aucun moteur de conteneurs ne répond à la commande « docker ». Démarre Docker ; avec Podman : systemctl --user start podman.socket'
	)
}

/** Compose, on the project and the ports of this instance. */
class Pile {
	private constructor(
		private readonly banc: Banc,
		private readonly env: EnvironnementDeProcessus
	) {}

	static async de(banc: Banc): Promise<Pile> {
		const moteur = await moteurDeConteneurs()
		return new Pile(banc, { ...moteur, ...variablesDeCompose(banc.instance, banc.services) })
	}

	private commande(suite: string[]): string[] {
		return ['docker', 'compose', '--project-name', this.banc.instance.nom, '--file', FICHIER_COMPOSE, ...suite]
	}

	/** Runs Compose and shows what it prints. Returns its exit code. */
	compose(suite: string[]): Promise<number> {
		return Bun.spawn(this.commande(suite), { cwd: RACINE, env: this.env, stdio: ['ignore', 'inherit', 'inherit'] })
			.exited
	}

	/** Runs a command of the engine and returns what it printed, trimmed. */
	private async lire(commande: string[]): Promise<string> {
		const enfant = Bun.spawn(commande, { cwd: RACINE, env: this.env, stdout: 'pipe', stderr: 'ignore' })
		const [sortie] = await Promise.all([new Response(enfant.stdout).text(), enfant.exited])
		return sortie.trim()
	}

	async tourne(): Promise<boolean> {
		return (await this.lire(this.commande(['ps', '--quiet']))) !== ''
	}

	/** What the engine still holds under the name of this instance: containers, then volumes. */
	async restes(): Promise<string> {
		const etiquette = `label=com.docker.compose.project=${this.banc.instance.nom}`
		const listes = await Promise.all([
			this.lire(['docker', 'ps', '--all', '--quiet', '--filter', etiquette]),
			this.lire(['docker', 'volume', 'ls', '--quiet', '--filter', etiquette]),
		])
		return listes.join('')
	}
}

async function demarrer(banc: Banc): Promise<void> {
	const debut = performance.now()
	const { instance, services } = banc
	const pile = await Pile.de(banc)

	// A port held by something else is said here, in plain words, before Compose fails halfway.
	if (!(await pile.tourne())) {
		const ports = portsDuBanc(services)
		const ouverts = await Promise.all(ports.map(({ port }) => portOuvert(port)))
		const pris = ports.filter((_port, rang) => ouverts[rang])
		if (pris.length > 0)
			throw new BancRefuse(
				[
					`Port déjà pris sur ce poste : ${pris.map(({ port, service }) => `${port} (${service})`).join(', ')}. Un autre banc y tourne peut-être.`,
					'Donne à ce banc son nom et son décalage de ports, par exemple : BANC_INSTANCE=mon-banc BANC_DECALAGE=20 bun run banc:up',
				].join('\n')
			)
	}

	const attente = String(DELAI_DE_DEMARRAGE_MS / 1000)
	if ((await pile.compose(['up', '--detach', '--wait', '--wait-timeout', attente])) !== 0)
		throw new BancRefuse('Le banc n’a pas démarré : le message de Docker est ci-dessus.')

	// A healthy container is not yet a service that answers from this machine: each one is asked.
	let muets = await servicesMuets(sondesDuBanc(services))
	while (muets.length > 0 && performance.now() - debut < DELAI_DE_DEMARRAGE_MS) {
		await Bun.sleep(250)
		muets = await servicesMuets(muets)
	}
	if (muets.length > 0)
		throw new BancRefuse(
			`${messageBancMuet(instance, muets).split('\n')[0]}\nLes journaux des conteneurs : docker compose --project-name ${instance.nom} logs`
		)

	const { base, mails, stockage, google } = services
	console.log(
		[
			`Banc de test « ${instance.nom} » prêt en ${secondes(debut)} s.`,
			`- base : ${base.hote}:${base.port}, base « ${base.nom} », en mémoire`,
			`- capteur de mails : SMTP ${mails.hote}:${mails.port}, boîte ${mails.api}`,
			`- stockage d’objets : ${stockage.adresse}, espace « ${stockage.bucket} »`,
			`- faux Google : ${google.adresse}, pris pour Google par GOOGLE_OIDC_ISSUER`,
			`Pour l’arrêter et tout effacer : ${prefixeDeCommande(instance)}bun run banc:down`,
		].join('\n')
	)
}

async function arreter(banc: Banc): Promise<void> {
	const pile = await Pile.de(banc)
	if ((await pile.compose(['down', '--volumes', '--remove-orphans', '--timeout', '2'])) !== 0)
		throw new BancRefuse('Le banc ne s’est pas arrêté : le message de Docker est ci-dessus.')
	if ((await pile.restes()) !== '')
		throw new BancRefuse(
			`Le banc « ${banc.instance.nom} » laisse des conteneurs ou des volumes : voir « docker ps -a ».`
		)
	console.log(`Banc de test « ${banc.instance.nom} » arrêté : conteneurs et volumes supprimés, rien n’est gardé.`)
}

/** Stops with the message that names what to start when a service of the bench is silent. */
export async function exigerBancDebout({ instance, services }: Banc): Promise<void> {
	const muets = await servicesMuets(sondesDuBanc(services))
	if (muets.length > 0) throw new BancRefuse(messageBancMuet(instance, muets))
}

/**
 * Drops every table of the bench database. The versioned migrations then build them again on an
 * empty database: `reconstruireLaBase` below, or the application of the end-to-end tests when it
 * starts. Nothing is left of a previous run, and Payload has no question to ask.
 *
 * The address is the one this file worked out from `.env.test` for the instance: never a value
 * read from the environment.
 */
export async function effacerLeSchema({ services: { base } }: Banc): Promise<void> {
	// The same rule as the guard of the tests, asked again where the tables are dropped.
	if (!['127.0.0.1', 'localhost'].includes(base.hote) || !base.nom.endsWith('_test'))
		throw new BancRefuse(
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
 * Rebuilds the bench database as the pre-production and the production build theirs: dropped,
 * then the versioned migrations of `src/migrations/` played on the empty database (ticket 049).
 * Then refuses, with what to do, a database the migrations did not build as the collections of
 * the code describe it: a missing migration stops here, before the first test, and not on the
 * pre-production. Gives the names of the migrations played.
 */
async function reconstruireLaBase(banc: Banc): Promise<string[]> {
	await effacerLeSchema(banc)
	// Set before the Payload configuration is loaded: it reads the environment when it is imported.
	Object.assign(process.env, banc.environnement)
	const [{ payloadDeTest }, { exigerLeSchemaDesMigrations, jouerLesMigrations }, { migrations }] = await Promise.all([
		import('../tests/outils/payload-test'),
		import('../tests/outils/schema-du-banc'),
		import('../src/migrations'),
	])
	// The Payload of the tests changes no schema when it connects: the migrations build every table.
	const payload = await payloadDeTest()
	const jouees = await jouerLesMigrations(payload, migrations, 'test')
	await exigerLeSchemaDesMigrations(payload, 'test')
	return jouees
}

async function preparer(banc: Banc): Promise<void> {
	await exigerBancDebout(banc)
	const jouees = await reconstruireLaBase(banc)
	const { compterLesDocuments } = await import('../tests/outils/payload-test')
	const comptes = Object.values(await compterLesDocuments())
	if (comptes.some(compte => compte !== 0)) throw new BancRefuse('La base du banc n’est pas vide après sa préparation.')
	console.log(
		`Base du banc « ${banc.instance.nom} » prête : ${jouees.length > 1 ? 'migrations jouées' : 'migration jouée'} sur une base vide (${jouees.join(', ')}), schéma conforme aux collections du code, ${comptes.length} collections, toutes vides.`
	)
}

async function tester(banc: Banc, demandes: string[]): Promise<number> {
	await exigerBancDebout(banc)
	const jouees = await reconstruireLaBase(banc)
	console.log(
		`Base du banc « ${banc.instance.nom} » reconstruite par ${jouees.length > 1 ? 'les migrations' : 'la migration'} ${jouees.join(', ')} : schéma conforme aux collections du code.`
	)
	return Bun.spawn([process.execPath, ...argumentsDeTest(demandes)], {
		cwd: RACINE,
		env: {
			...process.env,
			...banc.environnement,
			BANC_INSTANCE: banc.instance.nom,
			BANC_DECALAGE: String(banc.instance.decalage),
			NODE_ENV: 'test',
		},
		stdio: ['inherit', 'inherit', 'inherit'],
	}).exited
}

const USAGE = 'Usage : bun run banc:up | banc:down | banc:prepare | test:integration [fichier…]'

/** The bench this process works on: the instance named by BANC_INSTANCE and BANC_DECALAGE. */
export function bancCourant(): Banc {
	const instance = lireInstance()
	const environnement = environnementDuBanc(instance)
	return { instance, environnement, services: servicesDuBanc(environnement) }
}

async function principal([commande, ...suite]: string[]): Promise<number> {
	const banc = bancCourant()
	switch (commande) {
		case 'up':
			await demarrer(banc)
			return 0
		case 'down':
			await arreter(banc)
			return 0
		case 'prepare':
			await preparer(banc)
			return 0
		case 'test':
			return tester(banc, suite)
		default:
			console.error(USAGE)
			return 2
	}
}

try {
	// Only when this file is the command: scripts/e2e.ts imports the tools above without running it.
	if (import.meta.main) process.exit(await principal(process.argv.slice(2)))
} catch (erreur) {
	if (!(erreur instanceof BancRefuse)) throw erreur
	console.error(erreur.message)
	process.exit(1)
}
