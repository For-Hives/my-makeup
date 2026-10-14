/**
 * The first slice on the pre-production (ticket 027, docs/preprod.md): when the application starts
 * there on an empty database, it poses the fake Strapi source of the bench next to that database,
 * imports it, and the page of the fictional profile 21 is then served like any other.
 *
 * - **The pre-production only.** `demarrerLaPreprod` refuses to run anywhere else, the site first,
 *   before it touches anything (`PreprodRefusee`). The checked environment says where it runs
 *   (`serverEnv().preprod`, src/lib/env.ts).
 * - **No real data.** The source is built from the fictional definition of the bench
 *   (tests/outils/source-strapi/donnees.ts): invented names, addresses in `@example.test`. The
 *   address of a real Strapi base (`STRAPI_SOURCE_URI`) is never read here.
 * - **An empty database only.** A database where one of the collections the import writes holds a
 *   document is kept as it is: nothing is posed, nothing is imported. The import itself writes
 *   nothing on a second run.
 * - **A guarded reset.** A new token of PREPROD_REMISE_A_ZERO empties the whole database first,
 *   plays the migrations again, and writes the token into the database: the same token never
 *   empties it twice.
 * - **Numbers only in the log.** The start log holds the counts of the import report, which names a
 *   document by its identifier in the old base, never by a value (docs/migration/IMPORT.md).
 *
 * The import is the one of `scripts/migration/import/`, run here in the process of the application
 * with Payload's own client (`pg`): the image has no bun.
 */

import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { COLLECTIONS_ECRITES, verifierLaCible, verifierLeSchemaDeLaCible } from '../../scripts/migration/import/cible'
import { lireLesDecisions } from '../../scripts/migration/import/decisions'
import { importer } from '../../scripts/migration/import/importer'
import { codeDeSortie, type Rapport, rapportEnTexte } from '../../scripts/migration/import/rapport'
import { type ClientPg, ouvrirLaSourcePg } from '../../scripts/migration/import/source-pg'
import decisionsDuBanc from '../../tests/fixtures/import/decisions-du-banc.json'
import {
	type BaseDeLaSource,
	type Executer,
	effacerLaBase,
	lignesDeLaDefinition,
	preparerLaBase,
	remplirLaBase,
} from '../../tests/outils/source-strapi/creation'
import { definitionDeLaSource } from '../../tests/outils/source-strapi/donnees'
import { NOMS_DES_TABLES } from '../../tests/outils/source-strapi/schema'
import type { PreprodEnv } from '../lib/env'

/** The task was asked to run elsewhere than on the pre-production: nothing was touched. */
export class PreprodRefusee extends Error {
	override readonly name = 'PreprodRefusee'
}

/** Where the fake source lives on the server of the pre-production: a database of its own, beside the one of Payload. */
export const SOURCE_DE_LA_PREPROD: BaseDeLaSource = { base: 'strapi_source_preprod', role: 'lecture_strapi_preprod' }

/**
 * The public address the files of the fake source name. A name that never resolves: the
 * pre-production has no storage yet (ticket 043), and its source carries no photo.
 */
export const MEDIAS_DE_LA_SOURCE_FICTIVE = 'https://medias.source-fictive.example.test'

/** The list `migrate` takes, as Payload types it. */
type MigrationsAJouer = NonNullable<NonNullable<Parameters<Payload['db']['migrate']>[0]>['migrations']>

/** Written on the schema of the database once a reset is done, followed by its token. */
const MARQUE_DE_REMISE = 'my-makeup préprod, remise à zéro : '

/** The schema of Payload, the one a reset empties. */
const SCHEMA = 'public'

export interface OptionsDeDemarrage {
	/** What the checked environment says of the pre-production: nothing anywhere else. */
	preprod: PreprodEnv | undefined
	/** The database of Payload, as `DATABASE_URI` gives it. */
	databaseUri: string
	/** Receives each line of the start log. Prefixed and printed by default. */
	journal?: (ligne: string) => void
	/** Where the fake source is posed. Given by a test only: the bench names its databases `_test`. */
	source?: BaseDeLaSource
}

export type IssueDuDemarrage =
	| { etat: 'deja-remplie'; remise: boolean; documents: Record<string, number> }
	| { etat: 'importee'; remise: boolean; code: number; rapport: Rapport }

const journalParDefaut = (ligne: string): void => console.log(`[preprod] ${ligne}`)

/** What a pool or a client of `pg` offers: one query, its rows. */
interface ClientSql {
	query(texte: string, parametres?: unknown[]): Promise<{ rows: unknown[] }>
}

/** Runs the statements of tests/outils/source-strapi/creation.ts on a pool or a client of `pg`. */
const executerSur =
	(client: ClientSql): Executer =>
	async (texte, parametres) =>
		(await client.query(texte, parametres === undefined ? undefined : [...parametres])).rows

/** The `pg` module Payload's adapter connects with: the client of the source too. */
function clientPg(payload: Payload): ClientPg {
	if (!payload.db.pg)
		throw new PreprodRefusee('L’adaptateur de Payload ne donne pas son client PostgreSQL : rien n’est fait.')
	return payload.db.pg
}

const litteral = (texte: string): string => `'${texte.replaceAll("'", "''")}'`

/**
 * The two addresses of the source on the server of `databaseUri`: as the owner of the database of
 * Payload, who creates it, and as its read-only role, which the import reads it by.
 */
export function adressesDeLaSource(
	databaseUri: string,
	source: BaseDeLaSource,
	motDePasse: string
): { administration: string; lecture: string } {
	const administration = new URL(databaseUri)
	if (decodeURIComponent(administration.pathname.slice(1)) === source.base)
		throw new PreprodRefusee(
			'La fausse source Strapi ne se pose pas dans la base de Payload elle-même : rien n’est fait.'
		)
	administration.pathname = `/${source.base}`
	const lecture = new URL(administration.href)
	lecture.username = source.role
	lecture.password = motDePasse
	return { administration: administration.href, lecture: lecture.href }
}

/** How many documents each collection the import writes holds. */
async function compterLesDocuments(payload: Payload): Promise<Record<string, number>> {
	const comptes: Record<string, number> = {}
	for (const collection of COLLECTIONS_ECRITES)
		comptes[collection] = (await payload.count({ collection, overrideAccess: true })).totalDocs
	return comptes
}

/**
 * Empties the database of Payload and drops the fake source, once per token: the token is written
 * on the new schema, and a start that finds it there empties nothing. The migrations are played
 * again right after, as on a first start. Gives true when the database was emptied.
 */
async function remettreAZero(
	payload: Payload,
	jeton: string,
	source: BaseDeLaSource,
	journal: (ligne: string) => void
): Promise<boolean> {
	const marque = `${MARQUE_DE_REMISE}${jeton}`
	const { rows } = await payload.db.pool.query<{ marque: string | null }>(
		'SELECT obj_description(to_regnamespace($1), $2) AS marque',
		[SCHEMA, 'pg_namespace']
	)
	if (rows[0]?.marque === marque) {
		journal(`Remise à zéro « ${jeton} » déjà faite : rien n’est effacé.`)
		return false
	}
	const migrations = payload.db.prodMigrations ?? []
	// Without its migrations, the application could not rebuild the tables it is about to drop.
	if (migrations.length === 0)
		throw new PreprodRefusee('Remise à zéro refusée : l’application n’a aucune migration pour reconstruire la base.')

	journal(`Remise à zéro « ${jeton} » : la base et la fausse source Strapi sont effacées.`)
	await effacerLaBase(executerSur(payload.db.pool), source)
	await payload.db.pool.query(
		`DROP SCHEMA ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}; COMMENT ON SCHEMA ${SCHEMA} IS ${litteral(marque)}`
	)
	// Payload's own start hands the same list to `migrate` (@payloadcms/db-postgres, connect.js): only
	// the types differ, the one of `migrate` taking any argument.
	await payload.db.migrate({ migrations: migrations as unknown as MigrationsAJouer })
	journal(`Remise à zéro « ${jeton} » faite : ${migrations.length} migrations rejouées sur une base vide.`)
	return true
}

/**
 * Poses the fake source on the server of the database of Payload, from nothing: its database, its
 * read-only role with a password drawn here and kept in memory only, its tables and rows. Gives
 * the address the import reads it by.
 */
async function poserLaSource(
	payload: Payload,
	databaseUri: string,
	source: BaseDeLaSource,
	journal: (ligne: string) => void
): Promise<string> {
	const definition = definitionDeLaSource(MEDIAS_DE_LA_SOURCE_FICTIVE)
	const motDePasse = randomBytes(24).toString('hex')
	const { administration, lecture } = adressesDeLaSource(databaseUri, source, motDePasse)

	await preparerLaBase(executerSur(payload.db.pool), { ...source, motDePasse })
	const client = new (clientPg(payload).Client)({ connectionString: administration })
	await client.connect()
	try {
		await client.query('BEGIN')
		await remplirLaBase(executerSur(client), definition, source.role)
		await client.query('COMMIT')
	} catch (erreur) {
		await client.query('ROLLBACK').catch(() => undefined)
		throw erreur
	} finally {
		await client.end()
	}
	journal(
		`Fausse source Strapi posée à côté de la base : ${NOMS_DES_TABLES.length} tables, ${lignesDeLaDefinition(definition)} lignes, toutes fictives.`
	)
	return lecture
}

/** What an exit code of the import means, as the command says it (docs/migration/IMPORT.md). */
const SENS_DU_CODE: Readonly<Record<number, string>> = {
	0: 'fini, parité complète',
	3: 'arrêté avant toute écriture, des cas attendent une décision',
	4: 'un écart que le rapport n’explique pas',
	5: 'des documents sont refusés et attendent une décision',
}

/**
 * The start of the pre-production: the reset when a new token asks for it, then, on an empty
 * database, the fake source posed and imported. Refused anywhere else than on the pre-production,
 * before anything is read or written.
 *
 * Errors are thrown as they are: `auDemarrage` (./au-demarrage.ts) says them in the log by their
 * type and code, and the application keeps serving.
 */
export async function demarrerLaPreprod(payload: Payload, options: OptionsDeDemarrage): Promise<IssueDuDemarrage> {
	const { preprod, databaseUri, journal = journalParDefaut, source = SOURCE_DE_LA_PREPROD } = options
	if (!preprod)
		throw new PreprodRefusee(
			'Refusé : l’import de démarrage et la remise à zéro ne tournent que sur la préprod. Rien n’est lu ni écrit.'
		)

	const remise = preprod.remiseAZero ? await remettreAZero(payload, preprod.remiseAZero, source, journal) : false

	await verifierLeSchemaDeLaCible(payload)
	const documents = await compterLesDocuments(payload)
	const enTout = Object.values(documents).reduce((total, nombre) => total + nombre, 0)
	const decompte = Object.entries(documents)
		.map(([collection, nombre]) => `${collection} ${nombre}`)
		.join(', ')
	if (enTout > 0) {
		journal(`Base déjà remplie (${decompte}) : pas d’import au démarrage.`)
		return { etat: 'deja-remplie', remise, documents }
	}

	journal(`Base vide (${decompte}) : la fausse source Strapi est posée, puis importée.`)
	const lecture = await poserLaSource(payload, databaseUri, source, journal)
	const cible = verifierLaCible(databaseUri, { cibleDistante: true })
	const decisions = lireLesDecisions(JSON.stringify(decisionsDuBanc))
	const sourceOuverte = ouvrirLaSourcePg(lecture, clientPg(payload))
	try {
		const rapport = await importer({ payload, source: sourceOuverte, mode: 'reel', cible, decisions })
		for (const ligne of rapportEnTexte(rapport).split('\n')) if (ligne.trim() !== '') journal(ligne)
		const code = codeDeSortie(rapport)
		journal(`Import de démarrage fini, code ${code} : ${SENS_DU_CODE[code] ?? 'voir le rapport'}.`)
		return { etat: 'importee', remise, code, rapport }
	} finally {
		await sourceOuverte.fermer()
	}
}
