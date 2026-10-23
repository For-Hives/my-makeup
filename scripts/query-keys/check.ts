/**
 * Checks the keys that `collect.ts` read against the real configuration of the collections (ticket 300).
 *
 * The collections are the sanitized configuration of Payload (`src/payload.config.ts`, loaded by the test):
 * its `flattenedFields` already holds what Payload adds by itself (`id`, `createdAt`, `updatedAt`, `_status`,
 * the fields of an account or of an upload), so no list of names is kept here. A path is followed through
 * groups, arrays, blocks and relationships (`pro.email` is the `email` of the collection `pros`).
 */
import type { QueryKey } from './collect'

/** The part of a field of the sanitized configuration that the check reads. */
export interface FieldShape {
	name?: string
	type: string
	flattenedFields?: readonly FieldShape[]
	blocks?: readonly { flattenedFields?: readonly FieldShape[] }[]
	relationTo?: string | readonly string[]
}

/** The part of a collection of the sanitized configuration that the check reads. */
export interface CollectionShape {
	slug: string
	flattenedFields: readonly FieldShape[]
	versions?: unknown
}

export interface Violation extends QueryKey {
	/** What is wrong: the collection does not exist, or the first segment of the path that does not. */
	problem: string
}

/**
 * The one name the sanitized configuration does not list: the `id` that Payload gives to every document
 * and to every row of an array or of a block (a collection with its own `id` field lists it, and wins).
 */
const IMPLICIT_ID = 'id'
/** The fields of a block row that Payload adds to every block. */
const BLOCK_ROW_FIELDS = ['blockType', 'blockName']
/** Types whose content is free: any path below them is fine. */
const FREE_TYPES = new Set(['json', 'point', 'richText'])

/** The first segment of `path` that `fields` do not have, or `undefined` when the whole path exists. */
function missingSegment(
	fields: readonly FieldShape[],
	segments: readonly string[],
	collections: ReadonlyMap<string, CollectionShape>,
	extra: readonly string[] = []
): string | undefined {
	const [head, ...rest] = segments
	if (head === undefined) return undefined
	const field = fields.find(candidate => candidate.name === head)
	if (!field) return (head === IMPLICIT_ID || extra.includes(head)) && rest.length === 0 ? undefined : head
	if (rest.length === 0 || FREE_TYPES.has(field.type)) return undefined
	if (field.relationTo !== undefined) {
		// A relationship to one collection continues in that collection; to several, only `relationTo` and `value`.
		if (typeof field.relationTo !== 'string') return undefined
		const target = collections.get(field.relationTo)
		return target ? missingSegment(target.flattenedFields, rest, collections) : field.relationTo
	}
	if (field.flattenedFields) return missingSegment(field.flattenedFields, rest, collections)
	if (field.blocks) {
		const results = field.blocks.map(block =>
			missingSegment(block.flattenedFields ?? [], rest, collections, BLOCK_ROW_FIELDS)
		)
		return results.includes(undefined) ? undefined : results[0]
	}
	return rest[0]
}

/** Every key whose path a collection does not have. */
export function findViolations(keys: readonly QueryKey[], collectionList: readonly CollectionShape[]): Violation[] {
	const collections = new Map(collectionList.map(collection => [collection.slug, collection]))
	const violations: Violation[] = []
	for (const read of keys) {
		// `populate` is keyed by the collection it fills: `populate: { pros: { email: true } }`.
		const populated = read.kind === 'populate' ? read.path.split('.') : undefined
		const key = populated ? { ...read, collection: populated[0] ?? '', path: populated.slice(1).join('.') } : read
		const collection = collections.get(key.collection)
		if (!collection) {
			violations.push({ ...read, problem: `collection « ${key.collection} » does not exist` })
			continue
		}
		let segments = key.path.split('.')
		// A query on the versions of a collection reads the fields of the document under `version`.
		if (segments[0] === 'version' && segments.length > 1 && collection.versions) segments = segments.slice(1)
		const missing = missingSegment(collection.flattenedFields, segments, collections)
		if (missing !== undefined)
			violations.push({ ...read, problem: `« ${missing} » is not a field of ${key.collection}` })
	}
	return violations
}

/** The violations as lines a person reads: file, line, field. */
export function describeViolations(violations: readonly Violation[]): string[] {
	return violations.map(
		violation => `${violation.file}:${violation.line} ${violation.kind} « ${violation.path} » : ${violation.problem}`
	)
}
