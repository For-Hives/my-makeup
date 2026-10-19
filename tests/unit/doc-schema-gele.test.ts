import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard of docs/migration/SCHEMA.md, the frozen Strapi → Payload mapping (ticket 015).
 *
 * The document promises one row per attribute of the old API. This test keeps the promise true:
 * the list of attributes below is the frozen inventory of the Strapi schemas (api-my-makeup,
 * commit ccd449d, 13/10/2026), names and types only, and every mapping table of the document is
 * compared to it.
 *
 * The inventory can be compared again to the real schema files while the old API repository
 * exists: `STRAPI_API_DIR=../api-my-makeup bun --no-env-file test tests/unit/doc-schema-gele.test.ts`.
 */

const DOC_PATH = path.resolve(import.meta.dir, '../../docs/migration/SCHEMA.md')
const doc = readFileSync(DOC_PATH, 'utf8')
const register = readFileSync(path.resolve(import.meta.dir, '../../docs/migration/CHANGEMENTS-VOULUS.md'), 'utf8')
const docLines = doc.split('\n')

type StrapiType = {
	uid: string
	kind: 'contentType' | 'component'
	/** Path of the schema file inside the old API repository. */
	schemaFile: string
	/** Collection that receives the attributes. */
	collection: 'pros' | 'profiles' | 'articles' | 'talents'
	/** [name, type], in the order of the schema file. */
	attributes: ReadonlyArray<readonly [string, string]>
}

const STRAPI_INVENTORY: readonly StrapiType[] = [
	{
		uid: 'plugin::users-permissions.user',
		kind: 'contentType',
		schemaFile: 'src/extensions/users-permissions/content-types/user/schema.json',
		collection: 'pros',
		attributes: [
			['username', 'string'],
			['email', 'email'],
			['provider', 'string'],
			['password', 'password'],
			['resetPasswordToken', 'string'],
			['confirmationToken', 'string'],
			['confirmed', 'boolean'],
			['blocked', 'boolean'],
			['role', 'relation'],
			['makeup_artiste', 'relation'],
		],
	},
	{
		uid: 'api::makeup-artiste.makeup-artiste',
		kind: 'contentType',
		schemaFile: 'src/api/makeup-artiste/content-types/makeup-artiste/schema.json',
		collection: 'profiles',
		attributes: [
			['last_name', 'string'],
			['first_name', 'string'],
			['speciality', 'string'],
			['city', 'string'],
			['action_radius', 'integer'],
			['score', 'decimal'],
			['available', 'boolean'],
			['skills', 'component'],
			['description', 'text'],
			['network', 'component'],
			['user', 'relation'],
			['experiences', 'component'],
			['courses', 'component'],
			['service_offers', 'component'],
			['image_gallery', 'media'],
			['main_picture', 'media'],
			['language', 'component'],
			['username', 'string'],
			['pro', 'boolean'],
			['company_artist_name', 'string'],
		],
	},
	{
		uid: 'api::article.article',
		kind: 'contentType',
		schemaFile: 'src/api/article/content-types/article/schema.json',
		collection: 'articles',
		attributes: [
			['title', 'string'],
			['content', 'richtext'],
			['author', 'string'],
			['galery', 'media'],
			['seo_title', 'string'],
			['seo_description', 'string'],
			['slug', 'string'],
			['excerpt', 'text'],
		],
	},
	{
		uid: 'api::talent.talent',
		kind: 'contentType',
		schemaFile: 'src/api/talent/content-types/talent/schema.json',
		collection: 'talents',
		attributes: [
			['title', 'string'],
			['seo_title', 'string'],
			['description', 'text'],
			['seo_description', 'text'],
			['content', 'richtext'],
			['slug', 'string'],
		],
	},
	{
		uid: 'makeupartists.skills',
		kind: 'component',
		schemaFile: 'src/components/makeupartists/skills.json',
		collection: 'profiles',
		attributes: [
			['name', 'string'],
			['description', 'text'],
		],
	},
	{
		uid: 'makeupartists.experiences',
		kind: 'component',
		schemaFile: 'src/components/makeupartists/experiences.json',
		collection: 'profiles',
		attributes: [
			['company', 'string'],
			['job_name', 'string'],
			['city', 'string'],
			['date_start', 'date'],
			['date_end', 'date'],
			['description', 'text'],
		],
	},
	{
		uid: 'makeupartists.courses',
		kind: 'component',
		schemaFile: 'src/components/makeupartists/courses.json',
		collection: 'profiles',
		attributes: [
			['diploma', 'string'],
			['school', 'string'],
			['date_graduation', 'date'],
			['course_description', 'text'],
		],
	},
	{
		uid: 'makeupartists.language',
		kind: 'component',
		schemaFile: 'src/components/makeupartists/language.json',
		collection: 'profiles',
		attributes: [['name', 'string']],
	},
	{
		uid: 'makeupartists.network',
		kind: 'component',
		schemaFile: 'src/components/makeupartists/network.json',
		collection: 'profiles',
		attributes: [
			['youtube', 'string'],
			['facebook', 'string'],
			['instagram', 'string'],
			['website', 'string'],
			['linkedin', 'string'],
			['phone', 'string'],
			['email', 'string'],
		],
	},
	{
		uid: 'makeupartists.service-offers',
		kind: 'component',
		schemaFile: 'src/components/makeupartists/service-offers.json',
		collection: 'profiles',
		attributes: [
			['name', 'string'],
			['description', 'text'],
			['options', 'component'],
			['price', 'text'],
		],
	},
	{
		uid: 'service-offers.options',
		kind: 'component',
		schemaFile: 'src/components/service-offers/options.json',
		collection: 'profiles',
		attributes: [
			['name', 'string'],
			['description', 'text'],
			['price', 'text'],
		],
	},
]

/** The 13 ownerless profiles left by the sign-up spam (decision of 13/10/2026): never imported. */
const EXCLUDED_PROFILE_IDS = [67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108]

/**
 * The rows marked « Transformé », by Strapi attribute, with the key of their line in the register
 * of intended changes. `null`: the transformation changes no page and has no line there.
 */
const TRANSFORMED: ReadonlyArray<readonly [attribute: string, registerKey: string | null]> = [
	['email', null],
	['city', 'ville-en-commune'],
	['available', 'disponibilite-par-defaut'],
	['price', 'prix-numerique'],
	['size', null],
]

/** Columns of the Strapi link tables in the snapshot of 13/10/2026: what a fake source must rebuild. */
const LINK_TABLES: ReadonlyArray<readonly [table: string, columns: readonly string[]]> = [
	['makeup_artistes_user_links', ['id', 'makeup_artiste_id', 'user_id']],
	['makeup_artistes_components', ['id', 'entity_id', 'component_id', 'component_type', 'field', 'order']],
	[
		'components_makeupartists_service_offers_components',
		['id', 'entity_id', 'component_id', 'component_type', 'field', 'order'],
	],
	['files_related_morphs', ['id', 'file_id', 'related_id', 'related_type', 'field', 'order']],
	['up_users_role_links', ['id', 'user_id', 'role_id', 'user_order']],
	['files_folder_links', ['id', 'file_id', 'folder_id', 'file_order']],
]

/** Counts of the snapshot of 13/10/2026, and the stale target of the plan (dump of 08/10/2026). */
const COUNTS = [
	{ table: 'up_users', plan: 114, snapshot: 91 },
	{ table: 'makeup_artistes', plan: 100, snapshot: 101 },
	{ table: 'articles', plan: 6, snapshot: 10 },
	{ table: 'talents', plan: 14, snapshot: 14 },
]

type Table = { header: string[]; rows: string[][] }

const isHeading = (line: string) => /^#{1,6} /.test(line)

const cellsOf = (line: string) =>
	line
		.trim()
		.replace(/^\||\|$/g, '')
		.split('|')
		.map(cell => cell.trim())

/** Lines of the first section whose heading matches, the heading excluded, up to the next heading. */
function sectionOf(matches: (heading: string) => boolean): string[] {
	const start = docLines.findIndex(line => isHeading(line) && matches(line))
	if (start === -1) return []
	const body = docLines.slice(start + 1)
	const end = body.findIndex(isHeading)
	return end === -1 ? body : body.slice(0, end)
}

/** Every Markdown table of a block of lines, the separator row dropped. */
function tablesOf(lines: string[]): Table[] {
	const tables: Table[] = []
	let current: string[][] = []
	const close = () => {
		const [header, ...rows] = current
		if (header) tables.push({ header, rows: rows.filter(row => !row.every(cell => /^:?-+:?$/.test(cell))) })
		current = []
	}
	for (const line of lines) {
		if (line.trim().startsWith('|')) current.push(cellsOf(line))
		else close()
	}
	close()
	return tables
}

const unquoted = (cell: string) => cell.replace(/^`|`$/g, '')

/** The mapping table of a Strapi type: the first table under the heading that names its uid. */
function mappingOf(uid: string): Table {
	const [table] = tablesOf(sectionOf(heading => heading.includes(`\`${uid}\``)))
	return table ?? { header: [], rows: [] }
}

const isDropped = (row: string[]) => row[2] === '—'

const sum = (numbers: number[]) => numbers.reduce((total, n) => total + n, 0)

describe('docs/migration/SCHEMA.md', () => {
	test('covers 4 content types and 7 components', () => {
		expect(STRAPI_INVENTORY.filter(type => type.kind === 'contentType')).toHaveLength(4)
		expect(STRAPI_INVENTORY.filter(type => type.kind === 'component')).toHaveLength(7)
	})

	for (const type of STRAPI_INVENTORY) {
		describe(type.uid, () => {
			const { header, rows } = mappingOf(type.uid)

			test('has one row per Strapi attribute, in the order of the schema file', () => {
				expect(header).toEqual(['Attribut Strapi', 'Type Strapi', 'Champ Payload', 'Règle'])
				expect(rows.map(row => unquoted(row[0] ?? ''))).toEqual(type.attributes.map(([name]) => name))
			})

			test('states the Strapi type of each attribute', () => {
				const stated = rows.map(row => [unquoted(row[0] ?? ''), /^`([a-z]+)`/.exec(row[1] ?? '')?.[1] ?? ''])
				expect(stated).toEqual(type.attributes.map(([name, strapiType]) => [name, strapiType]))
			})

			test('gives each attribute a target field or a reasoned drop', () => {
				for (const row of rows) {
					const [attribute = '', , target = '', rule = ''] = row
					expect(row, attribute).toHaveLength(4)
					if (isDropped(row)) {
						expect(rule, attribute).toMatch(/^Abandonné : .{20,}/)
					} else {
						expect(target, attribute).toMatch(/^`(pros|profiles|articles|talents)\.[A-Za-z_][\w.]*`/)
						expect(rule.length, attribute).toBeGreaterThan(10)
					}
				}
			})
		})
	}

	test('counts 71 attributes: 44 in the content types, 27 in the components', () => {
		const rowCount = (kind: StrapiType['kind']) =>
			sum(STRAPI_INVENTORY.filter(type => type.kind === kind).map(type => mappingOf(type.uid).rows.length))

		expect(rowCount('contentType')).toBe(44)
		expect(rowCount('component')).toBe(27)
		expect(doc).toContain('Total : **71 attributs**, 44 dans les 4 types de contenu et 27 dans les 7 composants')
	})

	test('control table agrees with the mapping tables', () => {
		const [control] = tablesOf(sectionOf(heading => heading.includes('Contrôle du nombre de lignes')))
		expect(control?.header).toEqual(['Type ou composant', 'Table Strapi', 'Attributs', 'Repris', 'Abandonnés'])

		const stated = (control?.rows ?? []).map(row => [unquoted(row[0] ?? ''), row[2], row[3], row[4]])
		const counted = STRAPI_INVENTORY.map(type => {
			const { rows } = mappingOf(type.uid)
			const dropped = rows.filter(isDropped).length
			return [type.uid, String(rows.length), String(rows.length - dropped), String(dropped)]
		})
		expect(stated).toEqual(counted)

		const dropped = sum(STRAPI_INVENTORY.map(type => mappingOf(type.uid).rows.filter(isDropped).length))
		expect(doc).toContain(`${71 - dropped} repris, ${dropped} abandonnés.`)
	})

	test('lists the 13 ownerless profiles that are not imported', () => {
		const section = sectionOf(heading => heading.includes('13 profils sans propriétaire')).join('\n')
		const ids = /^Identifiants \(`makeup_artistes\.id`\) : ([\d, ]+)\.$/m.exec(section)?.[1] ?? ''

		expect(ids.split(', ').map(Number)).toEqual(EXCLUDED_PROFILE_IDS)
		expect(section).toContain('ne sont pas repris')
	})

	test('names the other exclusions: admin accounts and unreferenced files', () => {
		expect(sectionOf(heading => heading.includes("comptes d'administration")).join('\n')).toContain(
			"jamais lus par l'import ni migrés"
		)
		expect(sectionOf(heading => heading.includes('fichiers non référencés')).join('\n')).toContain(
			"Rien n'est supprimé par l'import"
		)
	})

	test('dates the counts of the 13/10/2026 snapshot and marks the target of the plan as stale', () => {
		const section = sectionOf(heading => heading.includes("Décomptes de l'instantané du 13/10/2026"))
		const [counts] = tablesOf(section)
		const planColumn = counts?.header.findIndex(title => title.includes('08/10/2026') && title.includes('périmé')) ?? -1
		const snapshotColumn = counts?.header.findIndex(title => title.includes('Instantané du 13/10/2026')) ?? -1
		expect(planColumn).toBeGreaterThan(0)
		expect(snapshotColumn).toBeGreaterThan(0)

		const stated = COUNTS.map(({ table }) => {
			const row = counts?.rows.find(cells => cells[0]?.includes(`(\`${table}\`)`))
			return { table, plan: Number(row?.[planColumn]), snapshot: Number(row?.[snapshotColumn]) }
		})
		expect(stated).toEqual(COUNTS)
		expect(section.join('\n')).toContain('(« 114 / 100 / 6 / 14 ») est périmée')
	})

	test('gives the expected profiles and hashes as upper bounds: the email decision table may discard accounts', () => {
		const [counts] = tablesOf(sectionOf(heading => heading.includes("Décomptes de l'instantané du 13/10/2026")))
		const expected = counts?.rows.find(cells => cells[0]?.includes('(`makeup_artistes`)'))?.at(-1) ?? ''

		expect(expected).toStartWith('88 au plus : ')
		expect(doc).toContain('88 profils à reprendre au plus')
		expect(doc).toContain('43 hash attendus au plus')
		expect(doc).not.toMatch(/43 hash attendus\./)
		// The same wording as the files, which were already an upper bound.
		expect(doc).toContain('248 au plus')

		const [pending] = tablesOf(sectionOf(heading => heading.includes('Points en attente')))
		const discarded = pending?.rows.find(cells => cells[0]?.startsWith('Profil dont le compte est écarté'))
		expect(discarded?.[1]).toBe("L'import s'arrête et liste le profil par identifiant")
		expect(discarded?.[2]).toBe('Ticket 066')
	})

	test('every « Transformé » rule is in the register, or is one of the two that change no page', () => {
		// Only the tables that give a rule per attribute or per column (§5, §6, §7 and §8).
		const transformed = tablesOf(docLines)
			.filter(table => table.header.at(-1) === 'Règle')
			.flatMap(table => table.rows)
			.filter(row => /transformé/i.test(row.at(-1) ?? ''))
		expect(transformed.map(row => unquoted(row[0] ?? ''))).toEqual(TRANSFORMED.map(([attribute]) => attribute))

		for (const [attribute, registerKey] of TRANSFORMED) {
			const rule = transformed.find(row => unquoted(row[0] ?? '') === attribute)?.at(-1) ?? ''
			// A rule of the plan says so, and has its line in the register; the two others do not cite the plan.
			expect({ attribute, fromThePlan: rule.includes('plan `01` §6.2') }).toEqual({
				attribute,
				fromThePlan: registerKey !== null,
			})
			if (registerKey !== null) expect(register, attribute).toContain(`| \`${registerKey}\` |`)
		}

		const howToRead = sectionOf(heading => heading.includes("Sources et mode d'emploi")).join('\n')
		expect(howToRead).toContain(
			"Deux transformations ne changent aucune page et n'y sont pas : l'email du compte, mis en minuscules (§5.1), et la taille d'un fichier, relue en octets (§8)."
		)
	})

	test('gives the columns of the link tables and the database names of the two token columns', () => {
		const section = sectionOf(heading => heading.includes('Colonnes système et tables de liens'))
		const links = tablesOf(section).find(table => table.header[0] === 'Table de liens')
		expect(links?.header).toEqual(['Table de liens', 'Lignes au 13/10/2026', 'Colonnes', 'Sert à'])

		const stated = (links?.rows ?? []).map(row => [
			unquoted(row[0] ?? ''),
			[...(row[2] ?? '').matchAll(/`([a-z_]+)`/g)].map(([, column]) => column),
		])
		expect(stated).toEqual(LINK_TABLES.map(([table, columns]) => [table, [...columns]]))

		const accounts = sectionOf(heading => heading.includes('`plugin::users-permissions.user`')).join('\n')
		expect(accounts).toContain('`reset_password_token` (attribut `resetPasswordToken`)')
		expect(accounts).toContain('`confirmation_token` (attribut `confirmationToken`)')
	})

	test('writes the four cross-cutting rules of the ticket', () => {
		const rules = sectionOf(heading => heading.includes('Règles transverses')).join('\n')

		expect(rules).toContain('**`strapiId`, jamais `id`.**')
		expect(rules).toContain('**Nul reste nul.**')
		expect(rules).toContain("**Les dates d'origine sont gardées.**")
		expect(rules).toContain('**Aucun hash dans un fichier.**')
	})

	test('rule 1 gives the real reason: a field named `id` is the identifier of Payload itself', () => {
		const rules = sectionOf(heading => heading.includes('Règles transverses')).join('\n')

		expect(rules).toContain('il devient la clé primaire (`@payloadcms/drizzle/dist/postgres/schema/setColumnID.js`)')
		expect(rules).toContain("c'est l'identifiant de la ligne (`payload/dist/fields/baseFields/baseIDField.js`)")
		expect(rules).not.toContain("n'est stocké à aucun niveau")
	})

	test('holds no password hash, email address nor phone number', () => {
		expect(doc).not.toMatch(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/)
		expect(doc).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/)
		expect(doc).not.toMatch(/(?:\+33|\b0033|\b0)[1-9](?:[ .-]?\d{2}){4}\b/)
	})
})

/** [name, type] of each attribute of a Strapi schema file, in file order. */
function readStrapiAttributes(file: string): Array<[string, string]> {
	const schema: unknown = JSON.parse(readFileSync(file, 'utf8'))
	if (typeof schema !== 'object' || schema === null || !('attributes' in schema)) return []
	const { attributes } = schema
	if (typeof attributes !== 'object' || attributes === null) return []
	return Object.entries(attributes).map(([name, definition]) => [
		name,
		typeof definition === 'object' && definition !== null && 'type' in definition ? String(definition.type) : '',
	])
}

const strapiApiDir = process.env.STRAPI_API_DIR ?? ''

// Opt-in: the old API lives in another repository, which CI does not have.
test.if(strapiApiDir !== '')('inventory equals the schema files of the old API (STRAPI_API_DIR)', () => {
	for (const type of STRAPI_INVENTORY) {
		const attributes = readStrapiAttributes(path.resolve(strapiApiDir, type.schemaFile))
		expect(attributes, type.uid).toEqual(type.attributes.map(([name, strapiType]) => [name, strapiType]))
	}
})

/**
 * What the document states about Payload 3.90.2, checked on the installed package: a statement of
 * that kind was once written without being checked. These files are not exported by the packages,
 * so they are loaded by their path; a Payload upgrade that moves them asks to read the document again.
 */
describe('what SCHEMA.md says about Payload holds on the installed version', () => {
	type Field = { name: string; type: string }
	const insidePayload = (file: string) => new URL(file, import.meta.resolve('payload')).href
	const insideDrizzle = (file: string) => {
		const adapter = path.dirname(Bun.resolveSync('@payloadcms/db-postgres', import.meta.dir))
		return path.join(path.dirname(Bun.resolveSync('@payloadcms/drizzle', adapter)), file)
	}

	test('rule 1: at the top level of a collection, a field named `id` becomes the primary key', async () => {
		const { setColumnID } = (await import(insideDrizzle('postgres/schema/setColumnID.js'))) as {
			setColumnID: (args: { adapter: { idType: string }; columns: Record<string, unknown>; fields: Field[] }) => string
		}
		const columns: Record<string, unknown> = {}

		expect(setColumnID({ adapter: { idType: 'serial' }, columns, fields: [{ name: 'id', type: 'number' }] })).toBe(
			'numeric'
		)
		expect(columns.id).toEqual({ name: 'id', type: 'numeric', primaryKey: true })
	})

	test('rule 1: in a list, the field named `id` is the identifier of the row', async () => {
		const { baseIDField } = (await import(insidePayload('./fields/baseFields/baseIDField.js'))) as {
			baseIDField: Field
		}

		expect(baseIDField).toMatchObject({ name: 'id', type: 'text' })
	})

	test('§5.1: `_verified` only exists when `auth.verify` is enabled on the collection', async () => {
		const { getBaseAuthFields } = (await import(insidePayload('./auth/getAuthFields.js'))) as {
			getBaseAuthFields: (auth: { verify: boolean }) => Field[]
		}
		const names = (verify: boolean) => getBaseAuthFields({ verify }).map(field => field.name)

		expect(names(true)).toContain('_verified')
		expect(names(false)).not.toContain('_verified')
		expect(names(false)).toContain('email')
	})
})
