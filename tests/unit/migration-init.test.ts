import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { migrations } from '@/migrations'

/**
 * The `init` migration (ticket 049), read as it is versioned: the first migration of the
 * repository, written from an empty schema, which only creates. Its SQL creates every table and
 * every column its snapshot declares: the snapshot is what `bun run schema:drift` compares the
 * collections with, the SQL is what the databases receive.
 *
 * That it builds the schema of the code on a real database, and plays again without effect, is
 * I22: tests/integration/migrations.test.ts.
 */

const FOLDER = path.resolve(import.meta.dir, '../../src/migrations')
const [init] = migrations
const NAME = init?.name ?? ''

/** The SQL of one function of the file, `up` or `down`. */
function sqlOf(fonction: 'up' | 'down'): string {
	const text = readFileSync(path.join(FOLDER, `${NAME}.ts`), 'utf8')
	const found = new RegExp(`export async function ${fonction}[\\s\\S]*?sql\`([\\s\\S]*?)\`\\)`).exec(text)?.[1]
	if (found === undefined) throw new Error(`no SQL in the ${fonction} of ${NAME}`)
	return found
}

/** The statements of a SQL text, one per entry, on a single line. */
const instructions = (texte: string): string[] =>
	texte
		.split(/;\s*(?:\n|$)/)
		.map(instruction => instruction.replace(/\s+/g, ' ').trim())
		.filter(instruction => instruction !== '')

interface Instant {
	tables: Record<string, { name: string; columns: Record<string, unknown> }>
	enums: Record<string, { name: string }>
}

const instant = JSON.parse(readFileSync(path.join(FOLDER, `${NAME}.json`), 'utf8')) as Instant

/** What `CREATE TABLE "table" ( … )` lists, by table. */
function createdColumns(): Record<string, string[]> {
	const tables: Record<string, string[]> = {}
	for (const [, table, corps] of sqlOf('up').matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\s*\);/g))
		tables[table ?? ''] = [...(corps ?? '').matchAll(/^\s*"([^"]+)"/gm)].map(([, colonne]) => colonne ?? '')
	return tables
}

describe('one migration: init', () => {
	test('init is the first migration, the folder holds only pairs of migration and snapshot, and the generated index', () => {
		expect(NAME).toMatch(/^\d{8}_\d{6}_init$/)
		const files = readdirSync(FOLDER).filter(fichier => fichier !== 'index.ts')
		const names = migrations.map(({ name }) => name)
		expect(files.sort()).toEqual(names.flatMap(nom => [`${nom}.json`, `${nom}.ts`]).sort())
	})

	test('its snapshot follows an empty schema: nothing came before it', () => {
		const { prevId } = JSON.parse(readFileSync(path.join(FOLDER, `${NAME}.json`), 'utf8')) as { prevId: string }
		expect(prevId).toBe('00000000-0000-0000-0000-000000000000')
	})
})

describe('up only creates', () => {
	const CREATION =
		/^(CREATE TYPE "public"\."\w+" AS ENUM\(|CREATE TABLE "\w+" \(|CREATE (UNIQUE )?INDEX "\w+" ON "\w+" USING btree \(|ALTER TABLE "\w+" ADD CONSTRAINT "\w+" FOREIGN KEY \()/

	test('every statement creates a type, a table, an index or a foreign key', () => {
		const all = instructions(sqlOf('up'))

		expect(all.length).toBeGreaterThan(100)
		expect(all.filter(instruction => !CREATION.test(instruction))).toEqual([])
	})

	test('no word that removes or changes: no DROP, DELETE, UPDATE, TRUNCATE, RENAME, INSERT, ALTER COLUMN', () => {
		// `ON DELETE cascade ON UPDATE no action` is the behaviour of a foreign key, not a statement.
		const withoutBehaviors = sqlOf('up').replace(/ ON (DELETE|UPDATE) (cascade|set null|no action)/g, '')

		expect(withoutBehaviors).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME|INSERT)\b|ALTER COLUMN/i)
	})
})

describe('the SQL creates what the snapshot declares', () => {
	test('every table and every column of the snapshot, in its CREATE TABLE', () => {
		const createdAlt = createdColumns()
		const declared = Object.fromEntries(
			Object.values(instant.tables).map(({ name, columns }) => [name, Object.keys(columns).sort()])
		)

		expect(Object.keys(createdAlt).sort()).toEqual(Object.keys(declared).sort())
		for (const [table, columnsValue] of Object.entries(declared))
			expect([table, createdAlt[table]?.sort()]).toEqual([table, columnsValue])
	})

	test('every enum type of the snapshot', () => {
		const created = [...sqlOf('up').matchAll(/CREATE TYPE "public"\."(\w+)"/g)].map(([, nom]) => nom).sort()

		expect(created).toEqual(
			Object.values(instant.enums)
				.map(({ name }) => name)
				.sort()
		)
	})
})

describe('down undoes up', () => {
	test('it drops every table and every type up created, and nothing else', () => {
		const all = instructions(sqlOf('down'))
		const tables = Object.keys(createdColumns())
		const types = Object.values(instant.enums).map(({ name }) => name)

		expect(all.sort()).toEqual(
			[
				...tables.map(table => `DROP TABLE "${table}" CASCADE`),
				...types.map(type => `DROP TYPE "public"."${type}"`),
			].sort()
		)
	})
})
