/**
 * The first slice on the pre-production (ticket 027, docs/preprod.md): when the application starts
 * there on an empty database, it poses the fake Strapi source of the bench next to that database,
 * imports it, and the page of the fictional profile 21 is then served like any other.
 *
 * - **The pre-production only.** `demarrerLaPreprod` refuses to run anywhere else, the site first,
 *   before it touches anything (`PreprodRefusee`). The checked environment says where it runs
 *   (`serverEnv().preprod`, src/lib/env.ts), and the database must be the one of the
 *   pre-production (`mymakeup_preprod`, ./remise.ts): nothing is read from another one.
 * - **No real data.** The source is built from the fictional definition of the bench
 *   (tests/outils/source-strapi/donnees.ts): invented names, addresses in `@example.test`. The
 *   address of a real Strapi base (`STRAPI_SOURCE_URI`) is never read here.
 * - **An empty database only.** A database where one of the collections the import writes holds a
 *   document is kept as it is: nothing is posed, nothing is imported. The import itself writes
 *   nothing on a second run.
 * - **A guarded reset, before the migrations.** A new token of PREPROD_REMISE_A_ZERO empties the
 *   whole database when Payload connects to it, before its migrations (./remise.ts,
 *   ./au-demarrage.ts): this task then finds an empty database, and imports.
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
	lignesDeLaDefinition,
	preparerLaBase,
	remplirLaBase,
} from '../../tests/outils/source-strapi/creation'
import { definitionDeLaSource } from '../../tests/outils/source-strapi/donnees'
import { NOMS_DES_TABLES } from '../../tests/outils/source-strapi/schema'
import type { PreprodEnv } from '../lib/env'
import {
	BASE_DE_LA_PREPROD,
	executerSur,
	exigerLaBaseDeLaPreprod,
	PreprodRefusee,
	SOURCE_DE_LA_PREPROD,
} from './remise'

export { PreprodRefusee, SOURCE_DE_LA_PREPROD }

/**
 * The public address the files of the fake source name. A name that never resolves: the
 * pre-production has no storage yet (ticket 043), and its source carries no photo.
 */
export const MEDIAS_DE_LA_SOURCE_FICTIVE = 'https://medias.source-fictive.example.test'

export interface OptionsDeDemarrage {
	/** What the checked environment says of the pre-production: nothing anywhere else. */
	preprod: PreprodEnv | undefined
	/** The database of Payload, as `DATABASE_URI` gives it. */
	databaseUri: string
	/** Receives each line of the start log. Prefixed and printed by default. */
	journal?: (ligne: string) => void
	/** Where the fake source is posed. Given by a test only: the bench names its databases `_test`. */
	source?: BaseDeLaSource
	/** The database of the pre-production, the only one the task reads. Given by a test only: the one of the bench. */
	base?: string
}

export type IssueDuDemarrage =
	| { etat: 'deja-remplie'; documents: Record<string, number> }
	| { etat: 'importee'; code: number; rapport: Rapport }

const journalParDefaut = (ligne: string): void => console.log(`[preprod] ${ligne}`)

/** The `pg` module Payload's adapter connects with: the client of the source too. */
function clientPg(payload: Payload): ClientPg {
	if (!payload.db.pg)
		throw new PreprodRefusee('L’adaptateur de Payload ne donne pas son client PostgreSQL : rien n’est fait.')
	return payload.db.pg
}

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
 * The start of the pre-production, once Payload has played its migrations (and emptied the
 * database before them when a new reset token asked for it, ./remise.ts): on an empty database,
 * the fake source posed and imported. Refused anywhere else than on the pre-production, and on
 * any other database than its own, before anything is read or written.
 *
 * Errors are thrown as they are: `auDemarrage` (./au-demarrage.ts) says them in the log by their
 * type and code, and the application keeps serving.
 */
export async function demarrerLaPreprod(payload: Payload, options: OptionsDeDemarrage): Promise<IssueDuDemarrage> {
	const {
		preprod,
		databaseUri,
		journal = journalParDefaut,
		source = SOURCE_DE_LA_PREPROD,
		base = BASE_DE_LA_PREPROD,
	} = options
	if (!preprod)
		throw new PreprodRefusee(
			'Refusé : l’import de démarrage et la remise à zéro ne tournent que sur la préprod. Rien n’est lu ni écrit.'
		)
	await exigerLaBaseDeLaPreprod(executerSur(payload.db.pool), base)

	await verifierLeSchemaDeLaCible(payload)
	const documents = await compterLesDocuments(payload)
	const enTout = Object.values(documents).reduce((total, nombre) => total + nombre, 0)
	const decompte = Object.entries(documents)
		.map(([collection, nombre]) => `${collection} ${nombre}`)
		.join(', ')
	if (enTout > 0) {
		journal(`Base déjà remplie (${decompte}) : pas d’import au démarrage.`)
		return { etat: 'deja-remplie', documents }
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
		return { etat: 'importee', code, rapport }
	} finally {
		await sourceOuverte.fermer()
	}
}
