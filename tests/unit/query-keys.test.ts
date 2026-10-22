import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { SanitizedConfig } from 'payload'
import { filterWhere } from '@/lib/account/admin-filters'
import { LANGUAGES, SKILLS } from '@/lib/dashboard/bullets'
import { type CollectionShape, describeViolations, findViolations } from '../../scripts/query-keys/check'
import { collectQueries, type QueryKey } from '../../scripts/query-keys/collect'

/**
 * Ticket 300. Payload accepts a key it does not know in a `select`, a `where`, a `sort` or a `populate` and
 * answers with an empty result, so two renamed fields (« Bonjour toi », « Maquilleuse professionnelle »)
 * went through every test. This file reads every such key of `src/` and checks it against the collections
 * of the real configuration.
 */

const ROOT = path.resolve(import.meta.dir, '../..')

/** Every `.ts` and `.tsx` file under a folder, as paths from the root of the repository. */
function sourceFiles(folder: string): Map<string, string> {
	const files = new Map<string, string>()
	const walk = (relative: string): void => {
		for (const entry of readdirSync(path.join(ROOT, relative))) {
			const child = `${relative}/${entry}`
			if (statSync(path.join(ROOT, child)).isDirectory()) walk(child)
			else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts'))
				files.set(child, readFileSync(path.join(ROOT, child), 'utf8'))
		}
	}
	walk(folder)
	return files
}

let loads = 0

/** The real configuration, under a local development environment. Nothing connects. */
async function realCollections(): Promise<readonly CollectionShape[]> {
	const names = ['DATABASE_URI', 'NODE_ENV', 'PAYLOAD_SECRET', 'PORT'] as const
	const before = names.map(name => [name, process.env[name]] as const)
	Reflect.set(process.env, 'DATABASE_URI', 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test')
	Reflect.set(process.env, 'NODE_ENV', 'development')
	Reflect.set(process.env, 'PAYLOAD_SECRET', 'k'.repeat(64))
	Reflect.set(process.env, 'PORT', '3123')
	try {
		const loaded = (await import(`../../src/payload.config.ts?load=${++loads}`)) as {
			default: Promise<SanitizedConfig>
		}
		return (await loaded.default).collections as unknown as readonly CollectionShape[]
	} finally {
		for (const [name, value] of before) {
			if (value === undefined) Reflect.deleteProperty(process.env, name)
			else Reflect.set(process.env, name, value)
		}
	}
}

/** Reads one made-up file and checks it against the real collections. */
async function check(source: string, others: Record<string, string> = {}) {
	const files = new Map(Object.entries({ 'src/fixture.ts': source, ...others }))
	const { keys, unresolved } = collectQueries(files)
	return { keys, unresolved, violations: findViolations(keys, await realCollections()) }
}

describe('ticket 300 : a key that is no field of the collection is refused', () => {
	test('a select on `prenom` of the profiles fails with the file, the line and the field; `firstName` passes', async () => {
		const wrong = await check(`await payload.find({
	collection: 'profiles',
	select: { prenom: true },
})`)
		expect(wrong.unresolved).toEqual([])
		expect(describeViolations(wrong.violations)).toEqual([
			'src/fixture.ts:3 select « prenom » : « prenom » is not a field of profiles',
		])

		const right = await check(`await payload.find({ collection: 'profiles', select: { firstName: true } })`)
		expect(right.violations).toEqual([])
		expect(right.keys.map(({ path: key }) => key)).toEqual(['firstName'])
	})

	test('where, sort (with its minus sign), and a path that goes through a relationship', async () => {
		const wrong = await check(`
payload.find({
	collection: 'profiles',
	where: { and: [{ slug: { equals: 'a' } }, { or: [{ nomArtiste: { exists: true } }] }] },
	sort: ['-completeness', '-nomArtiste'],
	populate: { pros: { courriel: true } },
})
payload.find({ collection: 'profiles', where: { 'pro.email': { equals: 'a' } } })
payload.find({ collection: 'profiles', where: { 'pro.courriel': { equals: 'a' } } })`)
		expect(wrong.violations.map(({ kind, path: key }) => `${kind} ${key}`)).toEqual([
			'where nomArtiste',
			'sort nomArtiste',
			'populate pros.courriel',
			'where pro.courriel',
		])
	})

	test('a nested select is followed: a group, a relationship, and the fields Payload adds by itself', async () => {
		const result = await check(`
payload.find({ collection: 'profiles', select: { contactDetails: { phone: true, fax: true }, id: true, createdAt: true } })
payload.find({ collection: 'pros', select: { email: true, _verified: true, resetPasswordToken: true } })`)
		expect(result.violations.map(({ path: key }) => key)).toEqual(['contactDetails.fax'])
	})

	test('a collection that does not exist is refused', async () => {
		const result = await check(`payload.find({ collection: 'maquilleuses', select: { slug: true } })`)
		expect(describeViolations(result.violations)).toEqual([
			'src/fixture.ts:1 select « slug » : collection « maquilleuses » does not exist',
		])
	})
})

describe('ticket 300 : what is read, and what is said not to be read', () => {
	test('a named constant, a spread, a condition and an import are followed; a name is looked up in its own file first', async () => {
		const result = await check(
			`import { SHARED } from './shared'
const CARD = { slug: true, prenom: true }
const LOCAL = { slug: true }
payload.find({ collection: 'profiles', select: { ...CARD, ...(withTown && { town: true }) }, where: SHARED })
payload.find({ collection: 'profiles', select: withTown ? CARD : LOCAL })`,
			{
				'src/shared.ts': `export const SHARED = { and: [{ status: { equals: 'published' } }, { zonne: { exists: true } }] }`,
				// Same name, other file, other content: must not leak into the fixture.
				'src/other.ts': `const CARD = { firstName: true }\nexport { CARD }`,
			}
		)
		expect(result.unresolved).toEqual([])
		const found = new Set(result.violations.map(({ path: key }) => key))
		expect([...found].sort()).toEqual(['prenom', 'zonne'])
	})

	test('what cannot be followed is reported, and an « ignore » mark with a reason silences it', async () => {
		const open = await check(`
payload.find({ collection: wanted, select: { slug: true } })
payload.find({ collection: 'profiles', select: { [field]: true } })
payload.find({ collection: 'profiles', where: buildFilter() })`)
		expect(open.unresolved.map(({ kind }) => kind)).toEqual(['collection', 'select', 'where'])

		const marked = await check(`
// query-keys: ignore the collection comes from the caller, who passes a literal
payload.find({ collection: wanted, select: { slug: true } })
payload.find({
	collection: 'profiles',
	// query-keys: ignore the field is one of the three list names of save-bullets
	select: { [field]: true },
	where: buildFilter(), // query-keys: ignore the filter is built from the same constants
})`)
		expect(marked.unresolved).toEqual([])

		// A mark without a reason does not count.
		const bare = await check(`// query-keys: ignore
payload.find({ collection: wanted, select: { slug: true } })`)
		expect(bare.unresolved).toHaveLength(1)
	})
})

describe('ticket 300 : the reads that carry an « ignore » mark in src/ are checked here', () => {
	const read = (collection: string, kind: QueryKey['kind'], path: string): QueryKey => ({
		file: 'src/(read by hand)',
		line: 0,
		collection,
		kind,
		path,
	})

	test('the keys that come from a variable: the filters of the accounts, the two bullet lists, the collections given as a parameter', async () => {
		const collections = await realCollections()
		const keys = [
			// src/components/admin/AccountFilters.tsx : the filters are built by `filterWhere`.
			...(['non-confirmes', 'sans-profil', 'bloques'] as const).flatMap(filter =>
				Object.keys(filterWhere(filter, [1, 2])).map(path => read('pros', 'where', path))
			),
			// src/lib/dashboard/save-bullets.ts : `select: { [sorte.champ]: true }`.
			...[LANGUAGES, SKILLS].map(kind => read('profiles', 'select', kind.champ)),
			// src/collections/revalidate.ts : profiles, articles and talents; the visibility field is `status` or `_status`.
			...['profiles', 'articles', 'talents'].map(collection => read(collection, 'select', 'slug')),
			read('profiles', 'select', 'status'),
			read('profiles', 'select', 'publishable'),
			read('articles', 'select', '_status'),
			read('talents', 'select', '_status'),
			// src/demo-data/dataset.ts : talents and articles by slug. src/lib/auth/*.ts : admins and pros by email, by id.
			...['admins', 'pros'].flatMap(collection => [
				read(collection, 'where', 'email'),
				read(collection, 'where', 'id'),
			]),
		]
		expect(keys.length).toBeGreaterThan(10)
		expect(describeViolations(findViolations(keys, collections))).toEqual([])
		// The check sees a wrong key there too.
		expect(findViolations([read('pros', 'where', 'courriel')], collections)).toHaveLength(1)
	})
})

describe('ticket 300 : the code of src/', () => {
	test('every key read in src/ is a field of its collection, nothing is left unread, and it takes under 10 seconds', async () => {
		const started = performance.now()
		const { keys, unresolved } = collectQueries(sourceFiles('src'))
		const violations = findViolations(keys, await realCollections())
		const elapsed = performance.now() - started

		expect(describeViolations(violations)).toEqual([])
		expect(unresolved.map(item => `${item.file}:${item.line} ${item.kind} ${item.reason}`)).toEqual([])
		// Not an empty read that would pass by itself: the scan sees a good number of keys, of the four kinds.
		expect(keys.length).toBeGreaterThan(150)
		expect(new Set(keys.map(({ kind }) => kind))).toEqual(new Set(['select', 'where', 'sort']))
		expect(elapsed).toBeLessThan(10_000)
		console.info(`query-keys: ${keys.length} keys read in ${Math.round(elapsed)} ms`)
	})

	test('the file of the plan of the site before ticket 299 would have been refused (prenom, nom, nomArtiste)', async () => {
		const before = `export async function readIndexableProfiles(payload) {
	return payload.find({
		collection: 'profiles',
		where: INDEXABLE_FILTER,
		select: { slug: true, prenom: true, nom: true, nomArtiste: true, updatedAt: true },
		sort: ['slug', 'id'],
	})
}
const INDEXABLE_FILTER = { status: { equals: 'published' } }`
		const result = await check(before)
		expect(describeViolations(result.violations)).toEqual([
			'src/fixture.ts:5 select « prenom » : « prenom » is not a field of profiles',
			'src/fixture.ts:5 select « nom » : « nom » is not a field of profiles',
			'src/fixture.ts:5 select « nomArtiste » : « nomArtiste » is not a field of profiles',
		])
	})
})
