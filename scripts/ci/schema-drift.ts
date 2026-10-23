/**
 * The schema drift check (docs/qualite.md, « La dérive de schéma »): do the collections of the
 * code still describe the schema of the last versioned migration?
 *
 *   bun run schema:drift                              the collections against the last migration
 *   bun run schema:drift --before <instantane.json>    the collections against this snapshot instead
 *   bun run schema:drift --snapshot <fichier.json>  writes the snapshot of the collections, checks nothing
 *
 * It gives the answer of `payload migrate:create --skip-empty` without writing a migration.
 * Payload keeps, next to each migration, the snapshot of the schema it was written from
 * (`src/migrations/*.json`); the check compares the last one with the schema the collections
 * give today. Payload is loaded without a connection: no database, no secret, no network.
 *
 * Exit code: 0 without drift, 1 with drift (what a migration would hold is printed), 2 on a
 * wrong use.
 *
 * A step of the job `qualite` of the CI since the `init` migration closed the schema (ticket 049):
 * a collection changed without its migration makes the CI red.
 *
 * Its names check (`ambiguites`) is also read by tests/support/bench-schema.ts, which the
 * global setup of Playwright loads under Node: this file finds its folder without `import.meta.dir`.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config, SanitizedConfig } from 'payload'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const MIGRATIONS_FOLDER = path.join(ROOT, 'src/migrations')

/**
 * Placeholders, not secrets: the configuration refuses to load without these two variables, and
 * the check never connects. The same values as the generated files step of the CI.
 */
const FILLER_VALUES = {
	DATABASE_URI: 'postgres://generation@127.0.0.1:5432/generation',
	PAYLOAD_SECRET: 'valeur-de-remplissage-sans-aucun-secret-0123456789',
} as const

/** A schema snapshot of drizzle-kit, as Payload writes it next to a migration. Only what the check reads is typed. */
export interface Snapshot {
	version?: string
	tables?: Record<string, { columns?: Record<string, unknown>; policies?: Record<string, unknown> }>
	[categorie: string]: unknown
}

/** The functions of drizzle-kit that `migrate:create` uses, as Payload hands them over. */
export interface DrizzleTools {
	generateDrizzleJson: (schema: unknown) => Snapshot | Promise<Snapshot>
	generateMigration: (avant: Snapshot, apres: Snapshot) => Promise<string[]>
	upSnapshot?: (instantane: Snapshot) => Snapshot
}

export interface Drift {
	/** The SQL statements a new migration would hold. */
	instructions: string[]
	/**
	 * Names that exist on one side only, next to other names on the other side: drizzle-kit would
	 * ask on the terminal whether one was renamed into the other, and wait for an answer.
	 */
	ambiguites: string[]
}

/** The kinds of names drizzle-kit asks about when some appear and others disappear, with their name in French. */
const CATEGORIES = {
	schemas: 'schémas',
	enums: 'types énumérés',
	sequences: 'séquences',
	roles: 'rôles',
	policies: 'règles d’accès',
	views: 'vues',
	tables: 'tables',
} as const
/** The same question, inside a table present on both sides. */
const TABLE_PARTS = { columns: 'colonnes', policies: 'règles d’accès' } as const

const object = (valeur: unknown): Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {}

const cites = (noms: string[]): string => noms.map(nom => `« ${nom} »`).join(', ')

/** The names on one side only, when both sides have some, written for the message; or nothing. */
function gap(libelle: string, avant: unknown, apres: unknown): string | undefined {
	const inMigration = object(avant)
	const inCode = object(apres)
	const added = Object.keys(inCode).filter(nom => !(nom in inMigration))
	const removed = Object.keys(inMigration).filter(nom => !(nom in inCode))
	if (added.length === 0 || removed.length === 0) return undefined
	return `${libelle} : ${cites(added)} dans le code seulement ; ${cites(removed)} dans la migration seulement`
}

/**
 * Where drizzle-kit would stop to ask whether a name was renamed. Found here, from the two
 * snapshots, so that the check never waits for an answer nobody gives.
 */
export function ambiguities(avant: Snapshot, apres: Snapshot): string[] {
	const foundGaps: string[] = []
	for (const [category, label] of Object.entries(CATEGORIES)) {
		const found = gap(label, avant[category], apres[category])
		if (found) foundGaps.push(found)
	}
	const tablesBefore = object(avant.tables)
	const tablesAfter = object(apres.tables)
	for (const table of Object.keys(tablesAfter).filter(nom => nom in tablesBefore))
		for (const [part, label] of Object.entries(TABLE_PARTS)) {
			const found = gap(`${label} de « ${table} »`, object(tablesBefore[table])[part], object(tablesAfter[table])[part])
			if (found) foundGaps.push(found)
		}
	return foundGaps
}

/** What separates the schema of a snapshot (`avant`) from the schema of the collections (`apres`). */
export async function schemaDrift(avant: Snapshot, apres: Snapshot, outils: DrizzleTools): Promise<Drift> {
	// As Payload does: a snapshot written by an older drizzle-kit is brought to the current format first.
	const upstream = outils.upSnapshot && Number(avant.version) < Number(apres.version) ? outils.upSnapshot(avant) : avant
	const foundGaps = ambiguities(upstream, apres)
	if (foundGaps.length > 0) return { instructions: [], ambiguites: foundGaps }
	return { instructions: await outils.generateMigration(upstream, apres), ambiguites: [] }
}

const HOW_TO_FIX =
	'Écris la migration par « bun run payload:migrate:create », relis son SQL, puis relance « bun run schema:drift ».'

/** The exit code and the message of a check, in French. `reference` names what the code was compared with. */
export function verdict(derive: Drift, reference: string): { code: 0 | 1; message: string } {
	if (derive.instructions.length === 0 && derive.ambiguites.length === 0)
		return {
			code: 0,
			message: `Aucune dérive de schéma : les collections du code décrivent le schéma de ${reference}.`,
		}
	const lines = [`Dérive de schéma : les collections du code ne décrivent plus le schéma de ${reference}.`]
	if (derive.ambiguites.length > 0)
		lines.push(
			'Des noms n’existent que d’un côté : un nom a changé, ou a été retiré pendant qu’un autre était ajouté.',
			...derive.ambiguites.map(ambiguite => `- ${ambiguite}`)
		)
	else
		lines.push(
			`Une migration contiendrait ${derive.instructions.length === 1 ? 'cette instruction' : `ces ${derive.instructions.length} instructions`} :`,
			...derive.instructions.map(instruction => `  ${instruction.trim()}`)
		)
	lines.push(HOW_TO_FIX)
	return { code: 1, message: lines.join('\n') }
}

/** The last versioned migration and its snapshot, or nothing when there is none. */
export function lastMigration(dossier: string = MIGRATIONS_FOLDER): { nom: string; instantane: Snapshot } | undefined {
	// The order Payload reads them in: the file names start with their date.
	const file = readdirSync(dossier)
		.filter(nom => nom.endsWith('.json'))
		.sort()
		.at(-1)
	if (file === undefined) return undefined
	const snapshot = JSON.parse(readFileSync(path.join(dossier, file), 'utf8')) as Snapshot
	return { nom: file.replace(/\.json$/, ''), instantane: snapshot }
}

interface CodeSchema {
	instantane: Snapshot
	outils: DrizzleTools
	/** What Payload compares with when there is no migration yet: an empty schema. */
	vide: Snapshot
}

/** Errors only: the warnings of a start (no mail adapter) say nothing about the schema. */
const ERROR_LOG: Config['logger'] = { options: { level: 'error' } }

/** Loads Payload without connecting it, and gives the schema of the collections as a snapshot. */
async function codeSchema(): Promise<CodeSchema> {
	// Before the configuration is loaded: it reads the environment when it is imported.
	Object.assign(process.env, FILLER_VALUES)
	const [{ default: payload }, { default: config }] = await Promise.all([
		import('payload'),
		import('../../src/payload.config'),
	])
	await payload.init({
		config: { ...(await config), logger: ERROR_LOG as SanitizedConfig['logger'] },
		disableDBConnect: true,
		disableOnInit: true,
	})
	const db = payload.db as unknown as {
		requireDrizzleKit: () => DrizzleTools
		schema: unknown
		defaultDrizzleSnapshot: Snapshot
	}
	const tools = db.requireDrizzleKit()
	return { instantane: await tools.generateDrizzleJson(db.schema), outils: tools, vide: db.defaultDrizzleSnapshot }
}

const USAGE = 'Usage : bun run schema:drift [--before <instantane.json> | --snapshot <fichier.json>]'

/** The options of the command, or nothing when they cannot be read. */
export function readArguments(args: readonly string[]): { avant?: string; instantane?: string } | undefined {
	if (args.length === 0) return {}
	const [option, file, ...rest] = args
	if (file === undefined || file.startsWith('-') || rest.length > 0) return undefined
	if (option === '--before') return { avant: file }
	if (option === '--snapshot') return { instantane: file }
	return undefined
}

async function principal(args: readonly string[]): Promise<number> {
	const options = readArguments(args)
	if (options === undefined) {
		console.error(USAGE)
		return 2
	}
	const code = await codeSchema()
	if (options.instantane) {
		writeFileSync(options.instantane, `${JSON.stringify(code.instantane, null, 2)}\n`)
		console.log(`Instantané du schéma des collections écrit dans ${options.instantane}.`)
		return 0
	}
	const migration = lastMigration()
	const reference = options.avant
		? {
				nom: `l’instantané « ${path.basename(options.avant)} »`,
				instantane: JSON.parse(readFileSync(options.avant, 'utf8')) as Snapshot,
			}
		: migration
			? { nom: `la dernière migration (${migration.nom})`, instantane: migration.instantane }
			: { nom: 'la base vide : aucune migration n’est versionnée', instantane: code.vide }
	const result = verdict(await schemaDrift(reference.instantane, code.instantane, code.outils), reference.nom)
	if (result.code === 0) console.log(result.message)
	else console.error(result.message)
	return result.code
}

// Exited explicitly: Payload, once started, keeps the process alive.
if (import.meta.main) process.exit(await principal(process.argv.slice(2)))
