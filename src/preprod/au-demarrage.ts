/**
 * What the pre-production does when it starts, and nothing anywhere else (ticket 027,
 * docs/preprod.md). Two moments, both wired in src/payload.config.ts:
 *
 * 1. `avecLaRemiseAZero` wraps the database adapter: when Payload connects, before it plays its
 *    migrations, a new token of PREPROD_REMISE_A_ZERO empties the database (./remise.ts). Payload
 *    stops the process on a migration that fails, before any hook runs: the reset must come first
 *    to clear an old database a new migration cannot apply to (the `init` of ticket 049).
 * 2. `auDemarrage` is the `onInit` of Payload, once it has started and played its migrations: on
 *    an empty database, the fake Strapi source posed and imported (./tranche.ts).
 *
 * Anywhere else than on the pre-production, the adapter is given back as it is, the hook returns
 * at once, and nothing more is loaded.
 *
 * The start never stops the application: an error is written in the log by its type and its code,
 * never by its text, which may carry values of the database, and the site keeps serving. The
 * check of the CI then finds the page of the fictional profile missing.
 */

import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { DatabaseAdapterObj, Payload } from 'payload'
import type { BaseDeLaSource } from '../../tests/outils/source-strapi/creation'
import type { ServerEnv } from '../lib/env'

/** The environment the hook reads: where it runs, and the database of Payload. */
export type EnvDuDemarrage = Pick<ServerEnv, 'databaseUri' | 'preprod'>

/** Lines of the start log, as Coolify shows them: one prefix, to find them. */
const journal = (ligne: string): void => console.log(`[preprod] ${ligne}`)

/**
 * Payload's own switch, set by `payload migrate` and by the command of the import
 * (`PAYLOAD_MIGRATING`): such a process must not change the database behind the person who runs it.
 */
const migrationEnCoursDansCeProcessus = (): boolean => process.env.PAYLOAD_MIGRATING === 'true'

/** The type and the code of an error that is not ours: never its text, which may carry values of the database. */
async function typeEtCode(erreur: unknown): Promise<string> {
	const { codeDeLErreur } = await import('../../scripts/migration/import/moteur')
	const type = erreur instanceof Error && /^\w{1,60}$/.test(erreur.name) ? erreur.name : 'erreur sans type'
	const code = codeDeLErreur(erreur)
	return `${type}${code ? `, code ${code}` : ''}`
}

/** The message of an error, when the import or this task wrote it; else its type and its code only. */
async function messageDeLErreur(erreur: unknown): Promise<string> {
	const [{ ImportRefuse }, { ImportInterrompu, messageDUneErreurInattendue }, { PreprodRefusee }] = await Promise.all([
		import('../../scripts/migration/import/cible'),
		import('../../scripts/migration/import/moteur'),
		import('./remise'),
	])
	if (erreur instanceof ImportRefuse || erreur instanceof ImportInterrompu || erreur instanceof PreprodRefusee)
		return erreur.message
	return messageDUneErreurInattendue(erreur)
}

/** « 1 migration rejouée », « 12 migrations rejouées ». */
function migrationsJouees(db: PostgresAdapter): string {
	const nombre = db.prodMigrations?.length ?? 0
	return nombre > 1 ? `${nombre} migrations rejouées` : `${nombre} migration rejouée`
}

/** What a test may change in the reset: the bench names its database and its source `…_test`. */
export interface OptionsDeLaRemise {
	/** The database the reset accepts to empty. The one of the pre-production by default. */
	base?: string
	/** The fake source dropped with it. The one of the pre-production by default. */
	source?: BaseDeLaSource
	/** Receives each line of the log. Prefixed and printed by default. */
	journal?: (ligne: string) => void
	/** Whether this process migrates (`PAYLOAD_MIGRATING`): then nothing is reset. */
	migrationEnCours?: boolean
}

/**
 * The reset, on a client of its own, opened and closed here: the pool of Payload does not exist
 * yet. Gives true when the database was emptied. A failure is written in the log, and the start
 * goes on: Payload then connects to the database as it is.
 */
async function remettreAvantLesMigrations(
	db: PostgresAdapter,
	jeton: string,
	options: OptionsDeLaRemise,
	ecrire: (ligne: string) => void
): Promise<boolean> {
	try {
		const { executerSur, remettreAZero } = await import('./remise')
		const client = new db.pg.Client(db.poolOptions)
		await client.connect()
		try {
			return await remettreAZero(executerSur(client), {
				jeton,
				migrations: db.prodMigrations?.length ?? 0,
				journal: ecrire,
				...(options.base !== undefined && { base: options.base }),
				...(options.source !== undefined && { source: options.source }),
			})
		} finally {
			await client.end().catch(() => undefined)
		}
	} catch (erreur) {
		const { PreprodRefusee } = await import('./remise')
		ecrire(
			erreur instanceof PreprodRefusee
				? `Remise à zéro « ${jeton} » non faite, la base est gardée. ${erreur.message}`
				: `Remise à zéro « ${jeton} » interrompue, la base est gardée (${await typeEtCode(erreur)}). Son texte n’est pas affiché : il peut porter des valeurs de la base.`
		)
		return false
	}
}

/**
 * The database adapter of Payload, with the reset before its migrations when the pre-production
 * is given a reset token. Anywhere else, or without a token, the adapter itself, untouched.
 */
export function avecLaRemiseAZero(
	adaptateur: DatabaseAdapterObj<PostgresAdapter>,
	env: EnvDuDemarrage,
	options: OptionsDeLaRemise = {}
): DatabaseAdapterObj<PostgresAdapter> {
	const jeton = env.preprod?.remiseAZero
	if (jeton === undefined) return adaptateur
	const ecrire = options.journal ?? journal
	return {
		...adaptateur,
		init: args => {
			const db = adaptateur.init(args)
			const connecter = db.connect
			if (!connecter) return db
			db.connect = async parametres => {
				// A hot reload reconnects a running server: never a start. A process that migrates is
				// read when it connects, not when the configuration is loaded: the CLI of Payload sets
				// its switch in between.
				const sansRemise = parametres?.hotReload || (options.migrationEnCours ?? migrationEnCoursDansCeProcessus())
				const remise = sansRemise ? false : await remettreAvantLesMigrations(db, jeton, options, ecrire)
				// Payload's own connection: its migrations, played on the empty schema after a reset.
				await connecter.call(db, parametres)
				if (remise) ecrire(`Remise à zéro « ${jeton} » faite : ${migrationsJouees(db)} sur une base vide.`)
			}
			return db
		},
	}
}

/** The hook, `onInit` of Payload: on the pre-production, the start import of ./tranche.ts. */
export async function auDemarrage(
	payload: Payload,
	env: EnvDuDemarrage,
	migrationEnCours = migrationEnCoursDansCeProcessus()
): Promise<void> {
	if (!env.preprod || migrationEnCours) return
	try {
		const { demarrerLaPreprod } = await import('./tranche')
		await demarrerLaPreprod(payload, { preprod: env.preprod, databaseUri: env.databaseUri, journal })
	} catch (erreur) {
		journal(`Démarrage de la préprod interrompu. ${await messageDeLErreur(erreur)}`)
	}
}
