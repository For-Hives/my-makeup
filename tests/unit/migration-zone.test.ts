import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { migrations } from '@/migrations'

/**
 * The migration of the zone (ticket 259), read as it is versioned: written after `init`, which the
 * production of the v3 has played, so it only adds. That it keeps the profiles already stored is
 * tests/integration/migrations.test.ts.
 */

const FOLDER = path.resolve(import.meta.dir, '../../src/migrations')
const zone = migrations.find(({ name }) => name.endsWith('_zone_countries_postal_codes'))
const NAME = zone?.name ?? ''

/** The SQL of one function of the file, `up` or `down`, one statement per entry. */
function statements(fonction: 'up' | 'down'): string[] {
	const text = readFileSync(path.join(FOLDER, `${NAME}.ts`), 'utf8')
	const found = new RegExp(`export async function ${fonction}[\\s\\S]*?sql\`([\\s\\S]*?)\`\\)`).exec(text)?.[1]
	if (found === undefined) throw new Error(`no SQL in the ${fonction} of ${NAME}`)
	return found
		.split(/;\s*(?:\n|$)/)
		.map(instruction => instruction.replace(/\s+/g, ' ').trim())
		.filter(instruction => instruction !== '')
}

describe('la migration de la zone', () => {
	test('elle suit init, dans l’index versionné', () => {
		expect(zone).toBeDefined()
		expect(migrations.map(({ name }) => name).indexOf(NAME)).toBe(1)
	})

	test('up ne fait que des ajouts : ni DROP, ni ALTER d’une colonne existante, ni réécriture de table', () => {
		const up = statements('up')
		expect(up.length).toBeGreaterThan(0)
		for (const instruction of up) {
			expect(instruction, instruction).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b|^(DELETE|UPDATE|INSERT)\b/i)
			expect(instruction, instruction).not.toMatch(/ALTER COLUMN|SET NOT NULL|SET DATA TYPE/i)
			expect(instruction, instruction).toMatch(
				/^(CREATE TYPE|CREATE TABLE "profiles_texts"|ALTER TABLE "profiles(_texts)?" ADD (COLUMN|CONSTRAINT)|CREATE INDEX)/
			)
		}
	})

	test('les colonnes ajoutées à profiles sont nullables, et zone_kind vaut city par défaut', () => {
		const added = statements('up').filter(instruction => instruction.startsWith('ALTER TABLE "profiles" ADD COLUMN'))
		expect(added.map(instruction => /ADD COLUMN "([^"]+)"/.exec(instruction)?.[1])).toEqual([
			'zone_kind',
			'town',
			'zone_review_reason',
			'zone_review_postal_code',
			'zone_review_candidates',
		])
		for (const instruction of added) expect(instruction, instruction).not.toMatch(/NOT NULL/)
		expect(added[0]).toContain(`DEFAULT 'city'`)
	})

	test('les types énumérés et la table des textes multiples sont nouveaux', () => {
		const up = statements('up')
		expect(up.filter(instruction => instruction.startsWith('CREATE TYPE'))).toEqual([
			`CREATE TYPE "public"."enum_profiles_zone_kind" AS ENUM('city', 'countries')`,
			`CREATE TYPE "public"."enum_profiles_zone_review_reason" AS ENUM('sharedPostalCode', 'homonyms', 'notFound', 'notACity')`,
		])
		expect(up.filter(instruction => instruction.startsWith('CREATE TABLE')).length).toBe(1)
	})

	test('down retire ces objets et rien d’autre', () => {
		const down = statements('down')
		expect(down).toEqual([
			'DROP TABLE "profiles_texts" CASCADE',
			'ALTER TABLE "profiles" DROP COLUMN "zone_kind"',
			'ALTER TABLE "profiles" DROP COLUMN "town"',
			'ALTER TABLE "profiles" DROP COLUMN "zone_review_reason"',
			'ALTER TABLE "profiles" DROP COLUMN "zone_review_postal_code"',
			'ALTER TABLE "profiles" DROP COLUMN "zone_review_candidates"',
			'DROP TYPE "public"."enum_profiles_zone_kind"',
			'DROP TYPE "public"."enum_profiles_zone_review_reason"',
		])
	})

	test('init n’est pas modifiée : elle ne parle pas de la zone', () => {
		const init = readFileSync(path.join(FOLDER, `${migrations[0]?.name}.ts`), 'utf8')
		expect(init).not.toMatch(/zone_kind|zone_review|profiles_texts/)
	})
})
