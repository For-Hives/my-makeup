/**
 * The schema drift check (docs/qualite.md, « La dérive de schéma »): do the collections of the
 * code still describe the schema of the last versioned migration?
 *
 *   bun run schema:derive                              the collections against the last migration
 *   bun run schema:derive --avant <instantane.json>    the collections against this snapshot instead
 *   bun run schema:derive --instantane <fichier.json>  writes the snapshot of the collections, checks nothing
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
 * Its names check (`ambiguites`) is also read by tests/outils/schema-du-banc.ts, which the
 * global setup of Playwright loads under Node: this file finds its folder without `import.meta.dir`.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config, SanitizedConfig } from 'payload'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DOSSIER_DES_MIGRATIONS = path.join(ROOT, 'src/migrations')

/**
 * Placeholders, not secrets: the configuration refuses to load without these two variables, and
 * the check never connects. The same values as the generated files step of the CI.
 */
const VALEURS_DE_REMPLISSAGE = {
	DATABASE_URI: 'postgres://generation@127.0.0.1:5432/generation',
	PAYLOAD_SECRET: 'valeur-de-remplissage-sans-aucun-secret-0123456789',
} as const

/** A schema snapshot of drizzle-kit, as Payload writes it next to a migration. Only what the check reads is typed. */
export interface Instantane {
	version?: string
	tables?: Record<string, { columns?: Record<string, unknown>; policies?: Record<string, unknown> }>
	[categorie: string]: unknown
}

/** The functions of drizzle-kit that `migrate:create` uses, as Payload hands them over. */
export interface OutilsDeDrizzle {
	generateDrizzleJson: (schema: unknown) => Instantane | Promise<Instantane>
	generateMigration: (avant: Instantane, apres: Instantane) => Promise<string[]>
	upSnapshot?: (instantane: Instantane) => Instantane
}

export interface Derive {
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
const PARTIES_D_UNE_TABLE = { columns: 'colonnes', policies: 'règles d’accès' } as const

const objet = (valeur: unknown): Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {}

const cites = (noms: string[]): string => noms.map(nom => `« ${nom} »`).join(', ')

/** The names on one side only, when both sides have some, written for the message; or nothing. */
function ecart(libelle: string, avant: unknown, apres: unknown): string | undefined {
	const dansLaMigration = objet(avant)
	const dansLeCode = objet(apres)
	const ajoutes = Object.keys(dansLeCode).filter(nom => !(nom in dansLaMigration))
	const retires = Object.keys(dansLaMigration).filter(nom => !(nom in dansLeCode))
	if (ajoutes.length === 0 || retires.length === 0) return undefined
	return `${libelle} : ${cites(ajoutes)} dans le code seulement ; ${cites(retires)} dans la migration seulement`
}

/**
 * Where drizzle-kit would stop to ask whether a name was renamed. Found here, from the two
 * snapshots, so that the check never waits for an answer nobody gives.
 */
export function ambiguites(avant: Instantane, apres: Instantane): string[] {
	const trouvees: string[] = []
	for (const [categorie, libelle] of Object.entries(CATEGORIES)) {
		const trouvee = ecart(libelle, avant[categorie], apres[categorie])
		if (trouvee) trouvees.push(trouvee)
	}
	const tablesAvant = objet(avant.tables)
	const tablesApres = objet(apres.tables)
	for (const table of Object.keys(tablesApres).filter(nom => nom in tablesAvant))
		for (const [partie, libelle] of Object.entries(PARTIES_D_UNE_TABLE)) {
			const trouvee = ecart(
				`${libelle} de « ${table} »`,
				objet(tablesAvant[table])[partie],
				objet(tablesApres[table])[partie]
			)
			if (trouvee) trouvees.push(trouvee)
		}
	return trouvees
}

/** What separates the schema of a snapshot (`avant`) from the schema of the collections (`apres`). */
export async function deriveDuSchema(avant: Instantane, apres: Instantane, outils: OutilsDeDrizzle): Promise<Derive> {
	// As Payload does: a snapshot written by an older drizzle-kit is brought to the current format first.
	const amont = outils.upSnapshot && Number(avant.version) < Number(apres.version) ? outils.upSnapshot(avant) : avant
	const trouvees = ambiguites(amont, apres)
	if (trouvees.length > 0) return { instructions: [], ambiguites: trouvees }
	return { instructions: await outils.generateMigration(amont, apres), ambiguites: [] }
}

const COMMENT_CORRIGER =
	'Écris la migration par « bun run payload:migrate:create », relis son SQL, puis relance « bun run schema:derive ».'

/** The exit code and the message of a check, in French. `reference` names what the code was compared with. */
export function verdict(derive: Derive, reference: string): { code: 0 | 1; message: string } {
	if (derive.instructions.length === 0 && derive.ambiguites.length === 0)
		return {
			code: 0,
			message: `Aucune dérive de schéma : les collections du code décrivent le schéma de ${reference}.`,
		}
	const lignes = [`Dérive de schéma : les collections du code ne décrivent plus le schéma de ${reference}.`]
	if (derive.ambiguites.length > 0)
		lignes.push(
			'Des noms n’existent que d’un côté : un nom a changé, ou a été retiré pendant qu’un autre était ajouté.',
			...derive.ambiguites.map(ambiguite => `- ${ambiguite}`)
		)
	else
		lignes.push(
			`Une migration contiendrait ${derive.instructions.length === 1 ? 'cette instruction' : `ces ${derive.instructions.length} instructions`} :`,
			...derive.instructions.map(instruction => `  ${instruction.trim()}`)
		)
	lignes.push(COMMENT_CORRIGER)
	return { code: 1, message: lignes.join('\n') }
}

/** The last versioned migration and its snapshot, or nothing when there is none. */
export function derniereMigration(
	dossier: string = DOSSIER_DES_MIGRATIONS
): { nom: string; instantane: Instantane } | undefined {
	// The order Payload reads them in: the file names start with their date.
	const fichier = readdirSync(dossier)
		.filter(nom => nom.endsWith('.json'))
		.sort()
		.at(-1)
	if (fichier === undefined) return undefined
	const instantane = JSON.parse(readFileSync(path.join(dossier, fichier), 'utf8')) as Instantane
	return { nom: fichier.replace(/\.json$/, ''), instantane }
}

interface SchemaDuCode {
	instantane: Instantane
	outils: OutilsDeDrizzle
	/** What Payload compares with when there is no migration yet: an empty schema. */
	vide: Instantane
}

/** Errors only: the warnings of a start (no mail adapter) say nothing about the schema. */
const JOURNAL_DES_ERREURS: Config['logger'] = { options: { level: 'error' } }

/** Loads Payload without connecting it, and gives the schema of the collections as a snapshot. */
async function schemaDuCode(): Promise<SchemaDuCode> {
	// Before the configuration is loaded: it reads the environment when it is imported.
	Object.assign(process.env, VALEURS_DE_REMPLISSAGE)
	const [{ default: payload }, { default: config }] = await Promise.all([
		import('payload'),
		import('../../src/payload.config'),
	])
	await payload.init({
		config: { ...(await config), logger: JOURNAL_DES_ERREURS as SanitizedConfig['logger'] },
		disableDBConnect: true,
		disableOnInit: true,
	})
	const db = payload.db as unknown as {
		requireDrizzleKit: () => OutilsDeDrizzle
		schema: unknown
		defaultDrizzleSnapshot: Instantane
	}
	const outils = db.requireDrizzleKit()
	return { instantane: await outils.generateDrizzleJson(db.schema), outils, vide: db.defaultDrizzleSnapshot }
}

const USAGE = 'Usage : bun run schema:derive [--avant <instantane.json> | --instantane <fichier.json>]'

/** The options of the command, or nothing when they cannot be read. */
export function lireArguments(args: readonly string[]): { avant?: string; instantane?: string } | undefined {
	if (args.length === 0) return {}
	const [option, fichier, ...reste] = args
	if (fichier === undefined || fichier.startsWith('-') || reste.length > 0) return undefined
	if (option === '--avant') return { avant: fichier }
	if (option === '--instantane') return { instantane: fichier }
	return undefined
}

async function principal(args: readonly string[]): Promise<number> {
	const options = lireArguments(args)
	if (options === undefined) {
		console.error(USAGE)
		return 2
	}
	const code = await schemaDuCode()
	if (options.instantane) {
		writeFileSync(options.instantane, `${JSON.stringify(code.instantane, null, 2)}\n`)
		console.log(`Instantané du schéma des collections écrit dans ${options.instantane}.`)
		return 0
	}
	const migration = derniereMigration()
	const reference = options.avant
		? {
				nom: `l’instantané « ${path.basename(options.avant)} »`,
				instantane: JSON.parse(readFileSync(options.avant, 'utf8')) as Instantane,
			}
		: migration
			? { nom: `la dernière migration (${migration.nom})`, instantane: migration.instantane }
			: { nom: 'la base vide : aucune migration n’est versionnée', instantane: code.vide }
	const resultat = verdict(await deriveDuSchema(reference.instantane, code.instantane, code.outils), reference.nom)
	if (resultat.code === 0) console.log(resultat.message)
	else console.error(resultat.message)
	return resultat.code
}

// Exited explicitly: Payload, once started, keeps the process alive.
if (import.meta.main) process.exit(await principal(process.argv.slice(2)))
