/**
 * The import of the old site, run on demand inside the deployed container (ticket 233,
 * docs/migration/IMPORT.md, « En production »).
 *
 * The image holds neither bun nor `scripts/`, and there is no SSH: the import runs in the process
 * of the application, under Node, when Andy sets a token that was never played (IMPORT_JETON in
 * Coolify, then a redeploy). It reads the Strapi database through a read-only role on the internal
 * network (STRAPI_SOURCE_URI), never a database opened on the Internet.
 *
 * - **The site only.** `NODE_ENV=production`, `APP_ENV=prod` and `NEXT_PUBLIC_SITE_URL=https://my-makeup.fr`
 *   (`exigerLeSite`), and an object storage: the photos are adopted where they are, never skipped.
 *   src/lib/env.ts already refuses every IMPORT_* variable anywhere else. The bench test of this module
 *   gives `lieu: 'site'` as an argument; there is no switch in the environment.
 * - **Never the database of Payload.** A source that names the database the application writes to is refused.
 * - **Once per token.** The token is written into the database, under a lock, before anything is read: a
 *   restart, a second container or a redeploy with the same token does nothing. A pass that stops
 *   (a decision awaited, an error) has used its token; the next pass takes a new one.
 * - **Checked before the token is used.** A table of decisions, a date or a kept answer that cannot be
 *   read refuses the pass without using the token.
 * - **Numbers only in the log.** Every line is prefixed `[import]` and holds counts and identifiers of the
 *   old base. A line that would carry an `@` or a bcrypt hash is replaced, whatever its origin. An error of
 *   the database is said by its type and its code, never by its text, which carries values.
 * - **The start never stops.** The import is not awaited by `onInit` (src/payload.config.ts): the site answers
 *   while it runs, and an error is a line of the log.
 *
 * The played tokens are kept as the comment of the schema `public` (every token, space separated): the schema
 * may only change by a versioned migration, and a token is no table.
 */

import type { Payload } from 'payload'
import { type Decisions, NO_DECISION, readDecisions } from '../../scripts/migration/import/decisions'
import { errorCode, InterruptedImport } from '../../scripts/migration/import/engine'
import type { Probe } from '../../scripts/migration/import/media'
import type { Reference } from '../../scripts/migration/import/reference'
import type { Source } from '../../scripts/migration/import/source'
import { ImportRefuse, verifyTargetSchema } from '../../scripts/migration/import/target'
import { EnvError, type ImportEnv, isLocalDatabase, mediaBaseUrl, type ServerEnv, SITE_ORIGIN } from '../lib/env'

/** What the module reads of the environment: where it runs, and what the import needs. */
export type OnDemandImportEnv = Pick<ServerEnv, 'databaseUri' | 'importation' | 'sourceStrapi' | 'storage'>

/** Where the process runs: the site, or anywhere else. */
export type Place = 'site' | 'autre'

/** What the module reads of `process.env` to know where it runs. */
export type PlaceVariables = Readonly<
	Partial<Record<'APP_ENV' | 'NEXT_PUBLIC_SITE_URL' | 'NODE_ENV', string | undefined>>
>

/** The marker written before the played tokens, in the comment of the schema. */
export const TOKENS_MARKER = 'my-makeup, import à la demande, jetons joués : '

/** The lock that serialises two containers claiming a token (an arbitrary constant). */
const TOKENS_LOCK = 'my-makeup:import-a-la-demande'

/** The comment PostgreSQL gives the schema `public` itself. */
const POSTGRES_COMMENT = 'standard public schema'

/** The schema Payload builds its tables in. */
const SCHEMA = 'public'

/** A line of the log is prefixed once, here. */
export const LOG_PREFIX = '[import] '

/** The token alone is no secret (it is chosen to be read in Coolify), but nothing else may reach the log. */
const FORBIDDEN_IN_LOG = /@|\$2[abxy]\$/

/** Why the import did not run, or what it did. */
export type ImportOutcome =
	| { etat: 'sans-jeton' }
	| { etat: 'refuse'; raison: string }
	| { etat: 'deja-joue'; jeton: string }
	| { etat: 'termine'; code: number }

export interface ImportOptions {
	/** Where the process runs. Read from `process.env` by default; a test gives `'site'` to stand for the site. */
	lieu?: Place
	/** Receives each line of the log, without the prefix. Printed with the prefix by default. */
	journal?: (ligne: string) => void
	/** The referential of the communes. By default the kept answers of IMPORT_COMMUNES, then the official list online. */
	referentiel?: Reference
	/** The public base of the photos. By default `mediaBaseUrl(R2_PUBLIC_URL, storage)`, as the application gives their addresses. */
	baseDesMedias?: string
	/** How the headers of an object of the storage are read. `HEAD` by default. */
	sonder?: Probe
	/** Opens the source at this address. The `pg` reader of Payload's client by default. */
	ouvrirLaSource?: (adresse: string, payload: Payload) => Promise<Source> | Source
	/** The day the run is made. Given by a test only. */
	maintenant?: Date
}

/** Where the process runs, from its environment. */
export function placeOfProcess(variables: PlaceVariables = process.env): Place {
	const onSite =
		variables.NODE_ENV === 'production' &&
		variables.APP_ENV?.trim() === 'prod' &&
		variables.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
	return onSite ? 'site' : 'autre'
}

/** The pass is refused anywhere else than on the site. */
export function requireSite(lieu: Place): void {
	if (lieu !== 'site')
		throw new ImportRefuse(
			`L’import à la demande ne tourne que sur le site (NODE_ENV=production, APP_ENV=prod, NEXT_PUBLIC_SITE_URL=${SITE_ORIGIN}). Rien n’est lu ni écrit.`
		)
}

/** What an address of a PostgreSQL database designates: its host, its port and its name, to compare two of them. */
function designation(adresse: string): string | undefined {
	let url: URL
	try {
		url = new URL(adresse)
	} catch {
		return undefined
	}
	const hosts = [url.hostname, ...url.searchParams.getAll('host')].map(hote =>
		hote.toLowerCase().replace(/^\[(.+)\]$/, '$1')
	)
	return `${hosts.join(',')}:${url.port === '' ? '5432' : url.port}/${decodeURIComponent(url.pathname.slice(1))}`
}

/** The source must not be the database Payload writes to. An address that cannot be read is no proof of a difference. */
export function requireSourceOtherThanTarget(sourceStrapi: string, databaseUri: string): void {
	const source = designation(sourceStrapi)
	const target = designation(databaseUri)
	if (source === undefined || target === undefined || source === target)
		throw new ImportRefuse(
			'STRAPI_SOURCE_URI désigne la base de Payload (DATABASE_URI), ou ne se lit pas : l’import lit la base Strapi, jamais celle qu’il remplit. Rien n’est lu ni écrit.'
		)
}

/** The tokens played so far, from the comment of the schema. */
export function readTokens(commentaire: string | null | undefined): string[] {
	if (commentaire == null || commentaire === '' || commentaire === POSTGRES_COMMENT) return []
	if (!commentaire.startsWith(TOKENS_MARKER))
		throw new ImportRefuse('Le schéma de la base porte un commentaire que l’import ne connaît pas : rien n’est écrit.')
	return commentaire
		.slice(TOKENS_MARKER.length)
		.split(' ')
		.filter(jeton => jeton !== '')
}

const literal = (texte: string): string => `'${texte.replaceAll("'", "''")}'`

/** What a pool of `pg` gives: a client to run the statements of the claim on. */
interface PoolPg {
	connect(): Promise<{
		query(texte: string, parametres?: unknown[]): Promise<{ rows: unknown[] }>
		release(): void
	}>
}

/**
 * Writes the token into the database, under a lock, unless it is already there. Gives true when
 * this call is the one that claimed it: the import may run. Two containers started together, or
 * the same container started twice, cannot both claim the same token.
 */
export async function reserveToken(pool: PoolPg, jeton: string): Promise<boolean> {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [TOKENS_LOCK])
		const { rows } = await client.query('SELECT obj_description(to_regnamespace($1), $2) AS marque', [
			SCHEMA,
			'pg_namespace',
		])
		const [row] = rows as { marque?: string | null }[]
		const tokens = readTokens(row?.marque)
		if (tokens.includes(jeton)) {
			await client.query('COMMIT')
			return false
		}
		// The token is checked against the form of src/lib/env.ts before it gets here: letters, digits, hyphens.
		await client.query(`COMMENT ON SCHEMA ${SCHEMA} IS ${literal(`${TOKENS_MARKER}${[...tokens, jeton].join(' ')}`)}`)
		await client.query('COMMIT')
		return true
	} catch (error) {
		await client.query('ROLLBACK').catch(() => undefined)
		throw error
	} finally {
		client.release()
	}
}

/** The type and the code of an error that is not ours: never its text, which may carry values of a database. */
function typeAndCode(erreur: unknown): string {
	const type = erreur instanceof Error && /^\w{1,60}$/.test(erreur.name) ? erreur.name : 'erreur sans type'
	const code = errorCode(erreur)
	return `${type}${code ? `, code ${code}` : ''}`
}

/** The message of an error the import or this module wrote; else its type and its code only. */
function errorMessage(erreur: unknown): string {
	if (erreur instanceof ImportRefuse || erreur instanceof InterruptedImport || erreur instanceof EnvError)
		return erreur.message
	return `L’import s’est arrêté sur une erreur inattendue (${typeAndCode(erreur)}). Son texte n’est pas affiché : il peut porter des valeurs de la base. Ce qui était écrit reste écrit ; un jeton nouveau reprend à partir de là.`
}

/** The table of decisions of IMPORT_DECISIONS, or none. Its errors never repeat what the table holds. */
function readEnvironmentDecisions(texte: string | undefined): Decisions {
	return texte === undefined ? NO_DECISION : readDecisions(texte)
}

/** The date of the switch, as the import reads it (`--consentement-le`). */
async function readCutoverDate(texte: string | undefined): Promise<string | undefined> {
	if (texte === undefined) return undefined
	const { cutoverDate } = await import('../../scripts/migration/import/profiles')
	const date = cutoverDate(texte)
	if (date === null) throw new ImportRefuse('La date de IMPORT_CONSENTEMENT_LE n’est pas une date : rien n’est écrit.')
	return date
}

/** The referential: the kept answers of IMPORT_COMMUNES first, the official list online for the rest. */
async function readReference(importation: ImportEnv, donne: Reference | undefined): Promise<Reference> {
	if (donne) return donne
	const { readAnswers, keptReference, geoApiReference } = await import('../../scripts/migration/import/reference')
	let answers: ReturnType<typeof readAnswers>
	try {
		answers = importation.communes === undefined ? new Map() : readAnswers(importation.communes)
	} catch (error) {
		if (error instanceof ImportRefuse) throw error
		throw new ImportRefuse(
			'IMPORT_COMMUNES ne se lit pas comme des réponses du référentiel des communes : rien n’est écrit.'
		)
	}
	return keptReference(answers, geoApiReference())
}

async function openApplicationSource(adresse: string, payload: Payload): Promise<Source> {
	const { openSourcePg } = await import('../../scripts/migration/import/source-pg')
	if (!payload.db.pg)
		throw new ImportRefuse('L’adaptateur de Payload ne donne pas son client PostgreSQL : rien n’est fait.')
	return openSourcePg(adresse, payload.db.pg)
}

/**
 * Runs the import asked by the environment, once per token. Gives how it ended; an error is said
 * in the log and never thrown, so the application keeps serving.
 *
 * Nothing is read from the database, nor from anywhere, when no token is set.
 */
export async function importOnDemand(
	payload: Payload,
	env: OnDemandImportEnv,
	options: ImportOptions = {}
): Promise<ImportOutcome> {
	const { importation } = env
	if (!importation) return { etat: 'sans-jeton' }
	const write = (ligne: string): void => {
		// Whatever its origin, a line that could carry an email or a hash does not reach the log.
		const sure = FORBIDDEN_IN_LOG.test(ligne)
			? 'Une ligne du journal portait une valeur privée : elle est retenue.'
			: ligne
		if (options.journal) options.journal(sure)
		else console.log(`${LOG_PREFIX}${sure}`)
	}
	const say = (texte: string): void => {
		for (const row of texte.split('\n')) if (row.trim() !== '') write(row)
	}
	let source: Source | undefined
	try {
		requireSite(options.lieu ?? placeOfProcess())
		if (env.sourceStrapi === undefined)
			throw new ImportRefuse(
				'STRAPI_SOURCE_URI manque : l’import ne sait pas quelle base Strapi lire. Rien n’est écrit.'
			)
		requireSourceOtherThanTarget(env.sourceStrapi, env.databaseUri)
		// No storage, no pass: every photo would be « sans-stockage », and none adopted.
		if (!env.storage)
			throw new ImportRefuse(
				'Le stockage des photos n’est pas réglé (S3_*) : l’import n’adopte aucune photo sans lui. Rien n’est écrit.'
			)
		const mediaBase = options.baseDesMedias ?? mediaBaseUrl(process.env.R2_PUBLIC_URL, env.storage)
		await verifyTargetSchema(payload)
		// Everything that can be wrong in the variables is checked before the token is used.
		const decisions = readEnvironmentDecisions(importation.decisions)
		const consentDate = await readCutoverDate(importation.consentiLe)
		const reference = await readReference(importation, options.referentiel)

		if (!(await reserveToken(payload.db.pool, importation.jeton))) {
			write(`Le jeton « ${importation.jeton} » a déjà été joué : rien n’est lu ni écrit.`)
			return { etat: 'deja-joue', jeton: importation.jeton }
		}
		write(`Jeton « ${importation.jeton} » : passage ${importation.mode} commencé.`)
		const { importer } = await import('../../scripts/migration/import/importer')
		const { exitCode, checkExitCode, checkAsText, reportAsText } = await import('../../scripts/migration/import/report')
		source = await (options.ouvrirLaSource ?? openApplicationSource)(env.sourceStrapi, payload)
		const report = await importer({
			payload,
			source,
			mode: importation.mode === 'reel' ? 'reel' : 'a-blanc',
			cible: isLocalDatabase(env.databaseUri) ? 'locale' : 'distante',
			decisions,
			referentiel: reference,
			cibleEnService: importation.cibleEnService,
			medias: { base: mediaBase, ...(options.sonder && { sonder: options.sonder }) },
			...(consentDate !== undefined && { consentiLe: consentDate }),
			...(options.maintenant && { maintenant: options.maintenant }),
		})
		say(reportAsText(report))
		const check = importation.mode === 'controle'
		if (check) say(checkAsText(report))
		const code = check ? checkExitCode(report) : exitCode(report)
		write(`Passage ${importation.mode} fini, code ${code}.`)
		return { etat: 'termine', code }
	} catch (error) {
		const reason = errorMessage(error)
		write(`Passage refusé ou arrêté. ${reason}`)
		return { etat: 'refuse', raison: reason }
	} finally {
		await source?.fermer().catch(() => undefined)
	}
}

/** Jetons already launched by this process: `onInit` may run again on a hot reload, never twice for one start. */
const started = new Set<string>()

/**
 * The call of `onInit` (src/payload.config.ts): starts the import without waiting for it, so that
 * the first request is not held for the 25 to 45 seconds a pass takes. Does nothing without a token,
 * while Payload itself migrates (`PAYLOAD_MIGRATING`), or twice for one token in one process.
 */
export function runOnDemandImport(payload: Payload, env: OnDemandImportEnv): void {
	const token = env.importation?.jeton
	if (token === undefined || process.env.PAYLOAD_MIGRATING === 'true' || started.has(token)) return
	started.add(token)
	importOnDemand(payload, env).catch(erreur => {
		console.log(`${LOG_PREFIX}Passage arrêté. ${errorMessage(erreur)}`)
	})
}
