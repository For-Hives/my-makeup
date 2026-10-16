/**
 * The Strapi database the import reads (docs/migration/SCHEMA.md, rule 7): read, never written.
 *
 * The import sees the source through `Source` only: one read-only transaction per reading, so that
 * every table it reads comes from the same snapshot. The command opens it with bun
 * (`./source-bun.ts`); nothing here depends on a driver, so the same import can run elsewhere.
 *
 * A timestamp of Strapi has no time zone and is in UTC: it is read as text, the way the old API
 * gives it (`2023-04-01T09:00:00.000Z`), never as a date the driver would read in the local time
 * of the machine.
 */

/** One SQL query of the source, its rows. */
export type Requete = <Ligne extends object = Record<string, unknown>>(
	texte: string,
	parametres?: readonly unknown[]
) => Promise<Ligne[]>

export interface Source {
	/** Runs `travail` in one read-only transaction: every query of it sees the same snapshot. */
	lire<T>(travail: (requete: Requete) => Promise<T>): Promise<T>
	fermer(): Promise<void>
}

/** A timestamp column of Strapi as the text of the old API: ISO 8601, in UTC, to the millisecond. */
export const iso = (colonne: string): string => `to_char(${colonne}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

/**
 * The tables the import reads, in the order it reads them. The fingerprint of the source covers
 * them: the import proves at each run that it changed none of them (plan 02, I43).
 */
export const TABLES_LUES = [
	'up_users',
	'files',
	'files_related_morphs',
	'makeup_artistes',
	'makeup_artistes_user_links',
	'makeup_artistes_components',
	'components_makeupartists_skills',
	'components_makeupartists_languages',
	'components_makeupartists_courses',
	'components_makeupartists_experiences',
	'components_makeupartists_networks',
	'components_makeupartists_service_offers',
	'components_makeupartists_service_offers_components',
	'components_service_offers_options',
	'articles',
	'talents',
] as const

/** Columns never read, not even to fingerprint them: the one-time tokens of the accounts (SCHEMA.md, rule 4). */
const COLONNES_JAMAIS_LUES: Readonly<Record<string, readonly string[]>> = {
	up_users: ['reset_password_token', 'confirmation_token'],
}

export interface EmpreinteDeTable {
	lignes: number
	/** SHA-256 of the rows, computed by PostgreSQL: no value leaves the source. */
	empreinte: string
}

export type EmpreinteDesTables = Record<string, EmpreinteDeTable>

/** The entry of the fingerprint that stands for the large objects of the database. */
export const GRANDS_OBJETS = 'pg_largeobject_metadata'

const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/

/**
 * The fingerprint of each table the import reads: its number of rows, and a SHA-256 of its rows,
 * each one serialised and hashed by PostgreSQL. Two fingerprints are equal when nothing changed.
 */
export async function empreinteDesTables(
	requete: Requete,
	tables: readonly string[] = TABLES_LUES
): Promise<EmpreinteDesTables> {
	const empreintes: EmpreinteDesTables = {}
	for (const table of tables) {
		if (!IDENTIFIANT.test(table)) throw new Error(`Nom de table refusé : ${table}.`)
		const retirees = (COLONNES_JAMAIS_LUES[table] ?? []).map(colonne => ` - '${colonne}'`).join('')
		const [ligne] = await requete<{ lignes: number; empreinte: string }>(
			`SELECT count(*)::int AS lignes,
				coalesce(encode(sha256(convert_to(string_agg(h, E'\\n' ORDER BY h COLLATE "C"), 'UTF8')), 'hex'), '') AS empreinte
			FROM (SELECT encode(sha256(convert_to((to_jsonb(t)${retirees})::text, 'UTF8')), 'hex') AS h FROM public."${table}" t) s`
		)
		empreintes[table] = { lignes: ligne?.lignes ?? 0, empreinte: ligne?.empreinte ?? '' }
	}
	// Large objects live outside the tables: a role that could create one would change the source
	// without a row moving. Their identifiers are fingerprinted like a table (ticket 227).
	const [grandsObjets] = await requete<{ lignes: number; empreinte: string }>(
		`SELECT count(*)::int AS lignes,
			coalesce(encode(sha256(convert_to(string_agg(oid::text, ',' ORDER BY oid), 'UTF8')), 'hex'), '') AS empreinte
		FROM pg_catalog.pg_largeobject_metadata`
	)
	empreintes[GRANDS_OBJETS] = { lignes: grandsObjets?.lignes ?? 0, empreinte: grandsObjets?.empreinte ?? '' }
	return empreintes
}

/** True when two fingerprints of the source say the same thing, table by table. */
export const memesTables = (avant: EmpreinteDesTables, apres: EmpreinteDesTables): boolean =>
	JSON.stringify(Object.entries(avant).sort()) === JSON.stringify(Object.entries(apres).sort())
