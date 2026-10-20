/**
 * The tables of the fake Strapi source: the sixteen tables of the old API that the import reads
 * (docs/migration/SCHEMA.md, §5 to §8), with the columns, the types and the order of the real
 * database. The names and types are those of the snapshot of 13/10/2026; Strapi 4 (knex) gives
 * every string 255 characters and every decimal two digits after the point.
 *
 * Left out on purpose: the tables the import never opens (SCHEMA.md §4.2 and §4.4: accounts of
 * the Strapi admin, roles, permissions, tokens, settings, folders and their links).
 *
 * Only Node's own modules: no API of bun.
 */

export type ColumnType =
	| 'cle'
	| 'entier'
	| 'chaine'
	| 'texte'
	| 'booleen'
	| 'decimal'
	| 'reel'
	| 'horodatage'
	| 'date'
	| 'json'

export interface Column {
	nom: string
	type: ColumnType
	/** A foreign key, as Strapi declares on its link tables: deleting the row deletes the link. */
	reference?: TableName
}

/** The SQL type of each kind of column, as Strapi 4 creates it on PostgreSQL. */
const TYPES_SQL: Readonly<Record<ColumnType, string>> = {
	cle: 'serial PRIMARY KEY',
	entier: 'integer',
	chaine: 'character varying(255)',
	texte: 'text',
	booleen: 'boolean',
	decimal: 'numeric(10, 2)',
	reel: 'double precision',
	horodatage: 'timestamp(6) without time zone',
	date: 'date',
	json: 'jsonb',
}

/**
 * How a parameter is written in an INSERT, so that PostgreSQL reads it with the type of its
 * column. A JSON value travels as text and is parsed by PostgreSQL: given as is, bun would store
 * a JSON string.
 */
export const CONVERSIONS: Readonly<Record<ColumnType, string>> = {
	cle: 'integer',
	entier: 'integer',
	chaine: 'character varying',
	texte: 'text',
	booleen: 'boolean',
	decimal: 'numeric',
	reel: 'double precision',
	horodatage: 'timestamp',
	date: 'date',
	json: 'text::jsonb',
}

const id: Column = { nom: 'id', type: 'cle' }

/** The four columns Strapi adds to every content type and to `files`. */
const dates = (...autres: Column[]): Column[] => [
	{ nom: 'created_at', type: 'horodatage' },
	{ nom: 'updated_at', type: 'horodatage' },
	...autres,
	{ nom: 'created_by_id', type: 'entier' },
	{ nom: 'updated_by_id', type: 'entier' },
]

/** A link table between an entry and the rows of its components, ordered by `order`. */
const componentLinks = (entite: TableName): Column[] => [
	id,
	{ nom: 'entity_id', type: 'entier', reference: entite },
	{ nom: 'component_id', type: 'entier' },
	{ nom: 'component_type', type: 'chaine' },
	{ nom: 'field', type: 'chaine' },
	{ nom: 'order', type: 'reel' },
]

export const TABLE_NAMES = [
	'up_users',
	'makeup_artistes',
	'makeup_artistes_user_links',
	'components_makeupartists_skills',
	'components_makeupartists_experiences',
	'components_makeupartists_courses',
	'components_makeupartists_languages',
	'components_makeupartists_networks',
	'components_service_offers_options',
	'components_makeupartists_service_offers',
	'components_makeupartists_service_offers_components',
	'makeup_artistes_components',
	'files',
	'files_related_morphs',
	'articles',
	'talents',
] as const

export type TableName = (typeof TABLE_NAMES)[number]

/** Every table, in an order where a table comes after the tables its foreign keys point to. */
export const TABLES: Readonly<Record<TableName, readonly Column[]>> = {
	up_users: [
		id,
		{ nom: 'username', type: 'chaine' },
		{ nom: 'email', type: 'chaine' },
		{ nom: 'provider', type: 'chaine' },
		{ nom: 'password', type: 'chaine' },
		{ nom: 'reset_password_token', type: 'chaine' },
		{ nom: 'confirmation_token', type: 'chaine' },
		{ nom: 'confirmed', type: 'booleen' },
		{ nom: 'blocked', type: 'booleen' },
		...dates(),
	],
	makeup_artistes: [
		id,
		{ nom: 'last_name', type: 'chaine' },
		{ nom: 'first_name', type: 'chaine' },
		{ nom: 'speciality', type: 'chaine' },
		{ nom: 'city', type: 'chaine' },
		{ nom: 'action_radius', type: 'entier' },
		{ nom: 'score', type: 'decimal' },
		{ nom: 'available', type: 'booleen' },
		{ nom: 'description', type: 'texte' },
		{ nom: 'username', type: 'chaine' },
		{ nom: 'pro', type: 'booleen' },
		{ nom: 'company_artist_name', type: 'chaine' },
		...dates(),
	],
	makeup_artistes_user_links: [
		id,
		{ nom: 'makeup_artiste_id', type: 'entier', reference: 'makeup_artistes' },
		{ nom: 'user_id', type: 'entier', reference: 'up_users' },
	],
	components_makeupartists_skills: [id, { nom: 'name', type: 'chaine' }, { nom: 'description', type: 'texte' }],
	components_makeupartists_experiences: [
		id,
		{ nom: 'company', type: 'chaine' },
		{ nom: 'job_name', type: 'chaine' },
		{ nom: 'city', type: 'chaine' },
		{ nom: 'date_start', type: 'date' },
		{ nom: 'date_end', type: 'date' },
		{ nom: 'description', type: 'texte' },
	],
	components_makeupartists_courses: [
		id,
		{ nom: 'diploma', type: 'chaine' },
		{ nom: 'school', type: 'chaine' },
		{ nom: 'date_graduation', type: 'date' },
		{ nom: 'course_description', type: 'texte' },
	],
	components_makeupartists_languages: [id, { nom: 'name', type: 'chaine' }],
	components_makeupartists_networks: [
		id,
		{ nom: 'youtube', type: 'chaine' },
		{ nom: 'facebook', type: 'chaine' },
		{ nom: 'instagram', type: 'chaine' },
		{ nom: 'website', type: 'chaine' },
		{ nom: 'linkedin', type: 'chaine' },
		{ nom: 'phone', type: 'chaine' },
		{ nom: 'email', type: 'chaine' },
	],
	components_service_offers_options: [
		id,
		{ nom: 'name', type: 'chaine' },
		{ nom: 'description', type: 'texte' },
		{ nom: 'price', type: 'texte' },
	],
	components_makeupartists_service_offers: [
		id,
		{ nom: 'name', type: 'chaine' },
		{ nom: 'description', type: 'texte' },
		{ nom: 'price', type: 'texte' },
	],
	components_makeupartists_service_offers_components: componentLinks('components_makeupartists_service_offers'),
	makeup_artistes_components: componentLinks('makeup_artistes'),
	files: [
		id,
		{ nom: 'name', type: 'chaine' },
		{ nom: 'alternative_text', type: 'chaine' },
		{ nom: 'caption', type: 'chaine' },
		{ nom: 'width', type: 'entier' },
		{ nom: 'height', type: 'entier' },
		{ nom: 'formats', type: 'json' },
		{ nom: 'hash', type: 'chaine' },
		{ nom: 'ext', type: 'chaine' },
		{ nom: 'mime', type: 'chaine' },
		{ nom: 'size', type: 'decimal' },
		{ nom: 'url', type: 'chaine' },
		{ nom: 'preview_url', type: 'chaine' },
		{ nom: 'provider', type: 'chaine' },
		{ nom: 'provider_metadata', type: 'json' },
		{ nom: 'folder_path', type: 'chaine' },
		...dates(),
		// Added by the API on 09/10/2026 (PR #385): the account that sent the file.
		{ nom: 'uploaded_by', type: 'entier' },
	],
	files_related_morphs: [
		id,
		{ nom: 'file_id', type: 'entier', reference: 'files' },
		{ nom: 'related_id', type: 'entier' },
		{ nom: 'related_type', type: 'chaine' },
		{ nom: 'field', type: 'chaine' },
		{ nom: 'order', type: 'reel' },
	],
	articles: [
		id,
		{ nom: 'title', type: 'chaine' },
		{ nom: 'content', type: 'texte' },
		{ nom: 'author', type: 'chaine' },
		{ nom: 'seo_title', type: 'chaine' },
		{ nom: 'seo_description', type: 'chaine' },
		{ nom: 'slug', type: 'chaine' },
		{ nom: 'excerpt', type: 'texte' },
		...dates({ nom: 'published_at', type: 'horodatage' }),
	],
	talents: [
		id,
		{ nom: 'title', type: 'chaine' },
		{ nom: 'seo_title', type: 'chaine' },
		{ nom: 'description', type: 'texte' },
		{ nom: 'seo_description', type: 'texte' },
		{ nom: 'content', type: 'texte' },
		{ nom: 'slug', type: 'chaine' },
		...dates({ nom: 'published_at', type: 'horodatage' }),
	],
}

/** A SQL identifier, quoted: `order` is a reserved word. */
export const identifier = (nom: string): string => `"${nom.replaceAll('"', '""')}"`

/** The CREATE TABLE statement of a table. */
export function tableCreation(table: TableName): string {
	const columns = TABLES[table].map(colonne => {
		const reference = colonne.reference ? ` REFERENCES ${identifier(colonne.reference)} (id) ON DELETE CASCADE` : ''
		return `\t${identifier(colonne.nom)} ${TYPES_SQL[colonne.type]}${reference}`
	})
	return `CREATE TABLE ${identifier(table)} (\n${columns.join(',\n')}\n)`
}
