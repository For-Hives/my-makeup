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
import { ImportRefuse, verifierLeSchemaDeLaCible } from '../../scripts/migration/import/target'
import { AUCUNE_DECISION, type Decisions, lireLesDecisions } from '../../scripts/migration/import/decisions'
import type { Sonde } from '../../scripts/migration/import/media'
import { codeDeLErreur, ImportInterrompu } from '../../scripts/migration/import/engine'
import type { Referentiel } from '../../scripts/migration/import/reference'
import type { Source } from '../../scripts/migration/import/source'
import { EnvError, type ImportEnv, isLocalDatabase, mediaBaseUrl, type ServerEnv, SITE_ORIGIN } from '../lib/env'

/** What the module reads of the environment: where it runs, and what the import needs. */
export type EnvDeLImport = Pick<ServerEnv, 'databaseUri' | 'importation' | 'sourceStrapi' | 'storage'>

/** Where the process runs: the site, or anywhere else. */
export type Lieu = 'site' | 'autre'

/** What the module reads of `process.env` to know where it runs. */
export type VariablesDuLieu = Readonly<
	Partial<Record<'APP_ENV' | 'NEXT_PUBLIC_SITE_URL' | 'NODE_ENV', string | undefined>>
>

/** The marker written before the played tokens, in the comment of the schema. */
export const MARQUE_DES_JETONS = 'my-makeup, import à la demande, jetons joués : '

/** The lock that serialises two containers claiming a token (an arbitrary constant). */
const VERROU_DES_JETONS = 'my-makeup:import-a-la-demande'

/** The comment PostgreSQL gives the schema `public` itself. */
const COMMENTAIRE_DE_POSTGRES = 'standard public schema'

/** The schema Payload builds its tables in. */
const SCHEMA = 'public'

/** A line of the log is prefixed once, here. */
export const PREFIXE_DU_JOURNAL = '[import] '

/** The token alone is no secret (it is chosen to be read in Coolify), but nothing else may reach the log. */
const INTERDIT_DANS_LE_JOURNAL = /@|\$2[abxy]\$/

/** Why the import did not run, or what it did. */
export type IssueDeLImport =
	| { etat: 'sans-jeton' }
	| { etat: 'refuse'; raison: string }
	| { etat: 'deja-joue'; jeton: string }
	| { etat: 'termine'; code: number }

export interface OptionsDeLImport {
	/** Where the process runs. Read from `process.env` by default; a test gives `'site'` to stand for the site. */
	lieu?: Lieu
	/** Receives each line of the log, without the prefix. Printed with the prefix by default. */
	journal?: (ligne: string) => void
	/** The referential of the communes. By default the kept answers of IMPORT_COMMUNES, then the official list online. */
	referentiel?: Referentiel
	/** The public base of the photos. By default `mediaBaseUrl(R2_PUBLIC_URL, storage)`, as the application gives their addresses. */
	baseDesMedias?: string
	/** How the headers of an object of the storage are read. `HEAD` by default. */
	sonder?: Sonde
	/** Opens the source at this address. The `pg` reader of Payload's client by default. */
	ouvrirLaSource?: (adresse: string, payload: Payload) => Promise<Source> | Source
	/** The day the run is made. Given by a test only. */
	maintenant?: Date
}

/** Where the process runs, from its environment. */
export function lieuDuProcessus(variables: VariablesDuLieu = process.env): Lieu {
	const surLeSite =
		variables.NODE_ENV === 'production' &&
		variables.APP_ENV?.trim() === 'prod' &&
		variables.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
	return surLeSite ? 'site' : 'autre'
}

/** The pass is refused anywhere else than on the site. */
export function exigerLeSite(lieu: Lieu): void {
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
	const hotes = [url.hostname, ...url.searchParams.getAll('host')].map(hote =>
		hote.toLowerCase().replace(/^\[(.+)\]$/, '$1')
	)
	return `${hotes.join(',')}:${url.port === '' ? '5432' : url.port}/${decodeURIComponent(url.pathname.slice(1))}`
}

/** The source must not be the database Payload writes to. An address that cannot be read is no proof of a difference. */
export function exigerUneSourceAUtreQueLaCible(sourceStrapi: string, databaseUri: string): void {
	const source = designation(sourceStrapi)
	const cible = designation(databaseUri)
	if (source === undefined || cible === undefined || source === cible)
		throw new ImportRefuse(
			'STRAPI_SOURCE_URI désigne la base de Payload (DATABASE_URI), ou ne se lit pas : l’import lit la base Strapi, jamais celle qu’il remplit. Rien n’est lu ni écrit.'
		)
}

/** The tokens played so far, from the comment of the schema. */
export function lireLesJetons(commentaire: string | null | undefined): string[] {
	if (commentaire == null || commentaire === '' || commentaire === COMMENTAIRE_DE_POSTGRES) return []
	if (!commentaire.startsWith(MARQUE_DES_JETONS))
		throw new ImportRefuse('Le schéma de la base porte un commentaire que l’import ne connaît pas : rien n’est écrit.')
	return commentaire
		.slice(MARQUE_DES_JETONS.length)
		.split(' ')
		.filter(jeton => jeton !== '')
}

const litteral = (texte: string): string => `'${texte.replaceAll("'", "''")}'`

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
export async function reserverLeJeton(pool: PoolPg, jeton: string): Promise<boolean> {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [VERROU_DES_JETONS])
		const { rows } = await client.query('SELECT obj_description(to_regnamespace($1), $2) AS marque', [
			SCHEMA,
			'pg_namespace',
		])
		const [ligne] = rows as { marque?: string | null }[]
		const jetons = lireLesJetons(ligne?.marque)
		if (jetons.includes(jeton)) {
			await client.query('COMMIT')
			return false
		}
		// The token is checked against the form of src/lib/env.ts before it gets here: letters, digits, hyphens.
		await client.query(
			`COMMENT ON SCHEMA ${SCHEMA} IS ${litteral(`${MARQUE_DES_JETONS}${[...jetons, jeton].join(' ')}`)}`
		)
		await client.query('COMMIT')
		return true
	} catch (erreur) {
		await client.query('ROLLBACK').catch(() => undefined)
		throw erreur
	} finally {
		client.release()
	}
}

/** The type and the code of an error that is not ours: never its text, which may carry values of a database. */
function typeEtCode(erreur: unknown): string {
	const type = erreur instanceof Error && /^\w{1,60}$/.test(erreur.name) ? erreur.name : 'erreur sans type'
	const code = codeDeLErreur(erreur)
	return `${type}${code ? `, code ${code}` : ''}`
}

/** The message of an error the import or this module wrote; else its type and its code only. */
function messageDeLErreur(erreur: unknown): string {
	if (erreur instanceof ImportRefuse || erreur instanceof ImportInterrompu || erreur instanceof EnvError)
		return erreur.message
	return `L’import s’est arrêté sur une erreur inattendue (${typeEtCode(erreur)}). Son texte n’est pas affiché : il peut porter des valeurs de la base. Ce qui était écrit reste écrit ; un jeton nouveau reprend à partir de là.`
}

/** The table of decisions of IMPORT_DECISIONS, or none. Its errors never repeat what the table holds. */
function lireLesDecisionsDeLEnvironnement(texte: string | undefined): Decisions {
	return texte === undefined ? AUCUNE_DECISION : lireLesDecisions(texte)
}

/** The date of the switch, as the import reads it (`--consentement-le`). */
async function lireLaDateDeBascule(texte: string | undefined): Promise<string | undefined> {
	if (texte === undefined) return undefined
	const { dateDeBascule } = await import('../../scripts/migration/import/profiles')
	const date = dateDeBascule(texte)
	if (date === null) throw new ImportRefuse('La date de IMPORT_CONSENTEMENT_LE n’est pas une date : rien n’est écrit.')
	return date
}

/** The referential: the kept answers of IMPORT_COMMUNES first, the official list online for the rest. */
async function lireLeReferentiel(importation: ImportEnv, donne: Referentiel | undefined): Promise<Referentiel> {
	if (donne) return donne
	const { lireLesReponses, referentielGarde, referentielGeoApi } = await import(
		'../../scripts/migration/import/reference'
	)
	let reponses: ReturnType<typeof lireLesReponses>
	try {
		reponses = importation.communes === undefined ? new Map() : lireLesReponses(importation.communes)
	} catch (erreur) {
		if (erreur instanceof ImportRefuse) throw erreur
		throw new ImportRefuse(
			'IMPORT_COMMUNES ne se lit pas comme des réponses du référentiel des communes : rien n’est écrit.'
		)
	}
	return referentielGarde(reponses, referentielGeoApi())
}

async function ouvrirLaSourceDeLApplication(adresse: string, payload: Payload): Promise<Source> {
	const { ouvrirLaSourcePg } = await import('../../scripts/migration/import/source-pg')
	if (!payload.db.pg)
		throw new ImportRefuse('L’adaptateur de Payload ne donne pas son client PostgreSQL : rien n’est fait.')
	return ouvrirLaSourcePg(adresse, payload.db.pg)
}

/**
 * Runs the import asked by the environment, once per token. Gives how it ended; an error is said
 * in the log and never thrown, so the application keeps serving.
 *
 * Nothing is read from the database, nor from anywhere, when no token is set.
 */
export async function importALaDemande(
	payload: Payload,
	env: EnvDeLImport,
	options: OptionsDeLImport = {}
): Promise<IssueDeLImport> {
	const { importation } = env
	if (!importation) return { etat: 'sans-jeton' }
	const ecrire = (ligne: string): void => {
		// Whatever its origin, a line that could carry an email or a hash does not reach the log.
		const sure = INTERDIT_DANS_LE_JOURNAL.test(ligne)
			? 'Une ligne du journal portait une valeur privée : elle est retenue.'
			: ligne
		if (options.journal) options.journal(sure)
		else console.log(`${PREFIXE_DU_JOURNAL}${sure}`)
	}
	const dire = (texte: string): void => {
		for (const ligne of texte.split('\n')) if (ligne.trim() !== '') ecrire(ligne)
	}
	let source: Source | undefined
	try {
		exigerLeSite(options.lieu ?? lieuDuProcessus())
		if (env.sourceStrapi === undefined)
			throw new ImportRefuse(
				'STRAPI_SOURCE_URI manque : l’import ne sait pas quelle base Strapi lire. Rien n’est écrit.'
			)
		exigerUneSourceAUtreQueLaCible(env.sourceStrapi, env.databaseUri)
		// No storage, no pass: every photo would be « sans-stockage », and none adopted.
		if (!env.storage)
			throw new ImportRefuse(
				'Le stockage des photos n’est pas réglé (S3_*) : l’import n’adopte aucune photo sans lui. Rien n’est écrit.'
			)
		const baseDesMedias = options.baseDesMedias ?? mediaBaseUrl(process.env.R2_PUBLIC_URL, env.storage)
		await verifierLeSchemaDeLaCible(payload)
		// Everything that can be wrong in the variables is checked before the token is used.
		const decisions = lireLesDecisionsDeLEnvironnement(importation.decisions)
		const consentiLe = await lireLaDateDeBascule(importation.consentiLe)
		const referentiel = await lireLeReferentiel(importation, options.referentiel)

		if (!(await reserverLeJeton(payload.db.pool, importation.jeton))) {
			ecrire(`Le jeton « ${importation.jeton} » a déjà été joué : rien n’est lu ni écrit.`)
			return { etat: 'deja-joue', jeton: importation.jeton }
		}
		ecrire(`Jeton « ${importation.jeton} » : passage ${importation.mode} commencé.`)
		const { importer } = await import('../../scripts/migration/import/importer')
		const { codeDeSortie, codeDuControle, controleEnTexte, rapportEnTexte } = await import(
			'../../scripts/migration/import/report'
		)
		source = await (options.ouvrirLaSource ?? ouvrirLaSourceDeLApplication)(env.sourceStrapi, payload)
		const rapport = await importer({
			payload,
			source,
			mode: importation.mode === 'reel' ? 'reel' : 'a-blanc',
			cible: isLocalDatabase(env.databaseUri) ? 'locale' : 'distante',
			decisions,
			referentiel,
			cibleEnService: importation.cibleEnService,
			medias: { base: baseDesMedias, ...(options.sonder && { sonder: options.sonder }) },
			...(consentiLe !== undefined && { consentiLe }),
			...(options.maintenant && { maintenant: options.maintenant }),
		})
		dire(rapportEnTexte(rapport))
		const controle = importation.mode === 'controle'
		if (controle) dire(controleEnTexte(rapport))
		const code = controle ? codeDuControle(rapport) : codeDeSortie(rapport)
		ecrire(`Passage ${importation.mode} fini, code ${code}.`)
		return { etat: 'termine', code }
	} catch (erreur) {
		const raison = messageDeLErreur(erreur)
		ecrire(`Passage refusé ou arrêté. ${raison}`)
		return { etat: 'refuse', raison }
	} finally {
		await source?.fermer().catch(() => undefined)
	}
}

/** Jetons already launched by this process: `onInit` may run again on a hot reload, never twice for one start. */
const lances = new Set<string>()

/**
 * The call of `onInit` (src/payload.config.ts): starts the import without waiting for it, so that
 * the first request is not held for the 25 to 45 seconds a pass takes. Does nothing without a token,
 * while Payload itself migrates (`PAYLOAD_MIGRATING`), or twice for one token in one process.
 */
export function lancerLImportALaDemande(payload: Payload, env: EnvDeLImport): void {
	const jeton = env.importation?.jeton
	if (jeton === undefined || process.env.PAYLOAD_MIGRATING === 'true' || lances.has(jeton)) return
	lances.add(jeton)
	importALaDemande(payload, env).catch(erreur => {
		console.log(`${PREFIXE_DU_JOURNAL}Passage arrêté. ${messageDeLErreur(erreur)}`)
	})
}
