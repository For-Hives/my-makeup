/**
 * How the import compares the source with the target, and writes the difference, one collection
 * at a time (docs/migration/IMPORT.md).
 *
 * - Each document of the source becomes an `Attendu`: the values the target must hold, under the
 *   names of Payload, and the transformations made on purpose (`ecarts`).
 * - A document of the target is found by its `strapiId` (SCHEMA.md, rule 1), never by anything
 *   else. Missing: it is created. Present with other values: the fields that differ are updated.
 *   Present with the same values: nothing is written. A second run on an unchanged source writes
 *   nothing at all.
 * - Nothing is deleted: a document of the target that the source no longer gives is listed.
 * - Every write goes through the Local API of Payload, with the import context
 *   (src/lib/import-context.ts). A value the target refuses is listed by identifier and by
 *   field, never with the value itself (SCHEMA.md, rule 5).
 *
 * No `bun` import here: the import can run under Node too.
 */

import { createHash } from 'node:crypto'
import { type CollectionSlug, type Payload, type RequestContext, ValidationError } from 'payload'
import { IMPORT_CONTEXT } from '../../../src/lib/import-context'

/**
 * How two values of a field are said equal. `objet` is a group of fields (the commune of a
 * profile): equal when every field is, and empty when every field is. `relations` is a list of
 * documents in order (a gallery). `liste` is a list of rows (the offers of a profile): equal when
 * the rows are, in the same order, whatever identifier each row got from Payload. `json` is a
 * value kept as it is (the formats of a file of the old site), its keys in any order.
 */
export type Kind = 'texte' | 'date' | 'booleen' | 'nombre' | 'relation' | 'relations' | 'objet' | 'liste' | 'json'

/** The collections the import writes. */
export type ImportedCollection = Extract<CollectionSlug, 'pros' | 'media' | 'profiles' | 'articles' | 'talents'>

/**
 * A transformation made on purpose: the field, and where the rule is written. A key of the
 * register of intended changes (`slug-stocke`), or a section of the frozen schema
 * (`SCHEMA.md §5.1`) for the two transformations that change no page.
 */
export interface Gap {
	field: string
	reference: string
}

/** A document of the source, as the target must hold it. */
export interface Expected {
	strapiId: number
	/** The values of the compared fields, under the names of Payload. */
	values: Readonly<Record<string, unknown>>
	/** Given at the creation only, never compared nor reported: the random password of an account. */
	onCreation?: Readonly<Record<string, unknown>>
	/** The transformations made on this document. */
	gaps: readonly Gap[]
}

/** A document the target refuses: its identifier, why, and the fields at fault. Never a value. */
export interface Refusal {
	strapiId: number
	reason: string
	fields?: string[]
}

/** A document of the target that holds a `strapiId`. */
export interface Existing {
	id: number
	values: Readonly<Record<string, unknown>>
}

export type Action =
	| { kind: 'creation'; expected: Expected }
	| { kind: 'modification'; expected: Expected; id: number; fields: string[] }
	| { kind: 'inchange'; expected: Expected; id: number }

/** What the import knows of a collection, besides its data. */
export interface Adapter {
	collection: ImportedCollection
	/** The compared fields and their kind. `createdAt` and `updatedAt` are restored after an update. */
	fields: Readonly<Record<string, Kind>>
	/**
	 * Compared fields the server computes at every save (the status of a profile): never written by
	 * the import, at the creation as at an update. Their expected value is what the server must
	 * compute from the written ones: a difference on them is a difference all the same.
	 */
	computed?: readonly string[]
	/**
	 * Compared fields the import only fills in: written when the target holds nothing for them, never
	 * over a value already there (a title the newsroom typed in the admin). An empty expected value
	 * writes nothing. They are left out of the fingerprint, which a later edit would change.
	 */
	seeds?: readonly string[]
	/**
	 * Compared fields of a document the target already holds that the import leaves exactly as they
	 * are: never compared, never written, left out of the fingerprint. Only a missing document is
	 * created, with all its fields. Used on a target the v3 is already using (ticket 227).
	 */
	frozen?: readonly string[]
	/**
	 * The value of a compared field when the expected document gives none: what the collection holds
	 * by default (the type of zone of a profile is « city »), so an expected document names a field
	 * only when it differs. A target that holds another value is a difference, and the update writes
	 * the default back (a zone of countries, or a review, left from an earlier run).
	 */
	defaults?: Readonly<Record<string, unknown>>
	/** Options of the writes of one document: a draft, no confirmation email, more context. */
	options?: (attendu: Expected) => WriteOptions
}

export interface WriteOptions {
	/**
	 * Created as a draft, without the validation of a published document. An update always writes
	 * the document itself (`draft: false`), whatever its status: a draft update of Payload would
	 * only write a new version, and the next run would find the document unchanged.
	 */
	draft?: boolean
	/** No confirmation email for a new account. */
	disableVerificationEmail?: boolean
	/** Context added to the import context. */
	context?: RequestContext
}

/** The plan of a collection: what to write, and what the target holds that the source does not give. */
export interface Plan {
	actions: Action[]
	/** `strapiId` of the documents of the target that no expected document names. Never deleted. */
	extra: number[]
}

/** What a run did in a collection. */
export interface Summary {
	created: number
	updated: number
	unchanged: number
	refused: Refusal[]
}

const DATES = new Set(['createdAt', 'updatedAt'])

/**
 * A group of fields as it is compared: its filled fields sorted by name, in JSON. An empty field
 * (an empty list too: the postal codes of a commune that has none, ticket 259) counts as an
 * absent one, and a group with no filled field is `null`, as Payload reads back an empty group.
 */
function normalizedGroup(valeur: object): string | null {
	const fields = Object.entries(valeur)
		.filter(([, sous]) => sous !== null && sous !== undefined && !(Array.isArray(sous) && sous.length === 0))
		.sort(([a], [b]) => a.localeCompare(b))
		// A list of objects in a field (the communes of a review) comes back from jsonb with its keys in
		// another order: the keys are sorted at every depth.
		.map(([champ, sous]) => [champ, sortedKeys(sous)])
	return fields.length === 0 ? null : JSON.stringify(fields)
}

/** Compares two names the same way on every machine: by their code units, never by a locale. */
const byName = ([a]: [string, unknown], [b]: [string, unknown]): number => (a < b ? -1 : a > b ? 1 : 0)

/** A value with the keys of each of its objects sorted, at every depth: two equal values give the same JSON. */
function sortedKeys(valeur: unknown): unknown {
	if (Array.isArray(valeur)) return valeur.map(sortedKeys)
	if (typeof valeur !== 'object' || valeur === null) return valeur
	return Object.entries(valeur)
		.sort(byName)
		.map(([cle, sous]) => [cle, sortedKeys(sous)])
}

/**
 * The rows of a list as they are compared: each row without the identifier Payload gave it, its
 * filled fields sorted by name, an empty field or an empty nested list counting as an absent one,
 * the rows in their order. The values themselves are compared as they are: the import gives them
 * in the form Payload reads back (a day of these lists at 12:00 UTC, src/lib/profile/lists.ts).
 */
function normalizedRows(lignes: readonly unknown[]): unknown[] {
	return lignes.map(ligne => {
		if (typeof ligne !== 'object' || ligne === null || Array.isArray(ligne)) return ligne
		return Object.entries(ligne)
			.filter(
				([champ, sous]) =>
					champ !== 'id' && sous !== null && sous !== undefined && !(Array.isArray(sous) && sous.length === 0)
			)
			.sort(byName)
			.map(([champ, sous]) => [champ, Array.isArray(sous) ? normalizedRows(sous) : sous])
	})
}

/** A value as it is compared: `undefined` is `null`, a date is an ISO string, a relation is an id. */
export function normalize(genre: Kind, valeur: unknown): unknown {
	if (valeur === undefined || valeur === null) return null
	switch (genre) {
		case 'objet':
			return typeof valeur === 'object' ? normalizedGroup(valeur) : valeur
		case 'relations': {
			const ids = (Array.isArray(valeur) ? valeur : [valeur]).map(id => normalize('relation', id))
			return ids.length === 0 ? null : JSON.stringify(ids)
		}
		case 'liste':
			if (!Array.isArray(valeur)) return valeur
			return valeur.length === 0 ? null : JSON.stringify(normalizedRows(valeur))
		case 'json':
			return JSON.stringify(sortedKeys(valeur))
		case 'date': {
			const date = valeur instanceof Date ? valeur : new Date(String(valeur))
			return Number.isNaN(date.getTime()) ? String(valeur) : date.toISOString()
		}
		case 'nombre':
			return Number(valeur)
		case 'relation':
			return typeof valeur === 'object' && 'id' in valeur ? Number(valeur.id) : Number(valeur)
		default:
			return valeur
	}
}

/** The fields whose value in the target differs from the expected one. */
export function differentFields(adaptateur: Adapter, attendu: Expected, existant: Existing): string[] {
	const seeds = new Set(adaptateur.seeds ?? [])
	const frozen = new Set(adaptateur.frozen ?? [])
	const empty = (valeur: unknown) => valeur === null || valeur === ''
	return Object.entries(adaptateur.fields)
		.filter(([champ, genre]) => {
			if (frozen.has(champ)) return false
			const intended = normalize(genre, attendu.values[champ] ?? adaptateur.defaults?.[champ])
			const present = normalize(genre, existant.values[champ])
			// A field the import only fills in differs when it is missing in the target, nothing else.
			if (seeds.has(champ)) return !empty(intended) && empty(present)
			return intended !== present
		})
		.map(([champ]) => champ)
}

/** What to do with each expected document, given what the target holds. */
export function planActions(adaptateur: Adapter, attendus: readonly Expected[], existants: readonly Existing[]): Plan {
	const byStrapiId = new Map<number, Existing>()
	for (const existing of existants) byStrapiId.set(Number(existing.values.strapiId), existing)
	const named = new Set(attendus.map(({ strapiId }) => strapiId))
	const actions = attendus.map((attendu): Action => {
		const existing = byStrapiId.get(attendu.strapiId)
		if (!existing) return { kind: 'creation', expected: attendu }
		const fields = differentFields(adaptateur, attendu, existing)
		return fields.length === 0
			? { kind: 'inchange', expected: attendu, id: existing.id }
			: { kind: 'modification', expected: attendu, id: existing.id, fields: fields }
	})
	const extra = [...byStrapiId.keys()].filter(strapiId => !named.has(strapiId)).sort((a, b) => a - b)
	return { actions, extra: extra }
}

/** The plan in numbers, before anything is written: what a run would do. */
export function planSummary(plan: Plan): Summary {
	const count = (genre: Action['kind']) => plan.actions.filter(action => action.kind === genre).length
	return { created: count('creation'), updated: count('modification'), unchanged: count('inchange'), refused: [] }
}

/**
 * Every document of the target that holds a `strapiId`, with the compared fields. Hidden fields
 * are read too (the legacy hash of an account): they stay in memory, for the comparison only.
 */
export async function readTarget(payload: Payload, adaptateur: Adapter): Promise<Existing[]> {
	const select = Object.fromEntries([...Object.keys(adaptateur.fields), 'strapiId'].map(champ => [champ, true]))
	const { docs } = await payload.find({
		collection: adaptateur.collection,
		where: { strapiId: { exists: true } },
		select,
		depth: 0,
		pagination: false,
		overrideAccess: true,
		showHiddenFields: true,
	})
	return docs.map(doc => ({ id: Number(doc.id), values: { ...doc } }))
}

/** The Local API, called the same way for the three collections; each adapter has typed its data. */
type Write = (options: {
	collection: ImportedCollection
	id?: number
	data: Record<string, unknown>
	context: RequestContext
	depth: 0
	draft?: boolean
	disableVerificationEmail?: boolean
	overrideAccess: true
}) => Promise<{ id: number | string }>

const choose = (valeurs: Readonly<Record<string, unknown>>, champs: readonly string[]) =>
	Object.fromEntries(champs.filter(champ => champ in valeurs).map(champ => [champ, valeurs[champ]]))

/** The refusal of a document by Payload, by field path. */
function payloadRefusal(strapiId: number, erreur: ValidationError): Refusal {
	const fields = [...new Set(erreur.data.errors.map(({ path }) => path))].sort()
	return { strapiId, reason: 'refuse-par-payload', fields: fields }
}

/** A code is printed only when it has the form of one: capitals, digits and `_`, never a value. */
const CODE_SHAPE = /^[0-9A-Z_]{5,40}$/

/**
 * The code of an error of the database (its SQLSTATE, `23514`), or of the system (`ECONNRESET`),
 * read on the error or on one of its causes. Never its message nor its detail: the error of a
 * query carries the query and its parameters, an email or a hash among them.
 */
export function errorCode(erreur: unknown): string | undefined {
	let current = erreur
	for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
		const { code } = current as { code?: unknown }
		if (typeof code === 'string' && CODE_SHAPE.test(code)) return code
		current = (current as { cause?: unknown }).cause
	}
	return undefined
}

/**
 * What the command says of an error the import did not write itself: its type and its code,
 * never its message, which may carry the values of a query.
 */
export function unexpectedErrorMessage(erreur: unknown): string {
	const type = erreur instanceof Error && /^\w{1,60}$/.test(erreur.name) ? erreur.name : 'erreur sans type'
	const code = errorCode(erreur)
	return [
		`L’import s’est arrêté sur une erreur inattendue (${type}${code ? `, code ${code}` : ''}).`,
		'Son texte n’est pas affiché : il peut porter des valeurs de la base.',
		'Ce qui était écrit avant reste écrit ; un nouveau passage reprend à partir de là.',
	].join(' ')
}

/**
 * A write the database failed for another reason than a value Payload refuses: a connection
 * lost, a time limit, a trigger, a full disk. The run stops there. The message names the
 * collection, the document and the code of the error, never the error itself, which is not kept.
 * What was written before stays written: the next run takes up from there.
 */
export class InterruptedImport extends Error {
	override readonly name = 'ImportInterrompu'

	constructor(
		readonly collection: ImportedCollection,
		readonly strapiId: number,
		readonly code: string | undefined
	) {
		super(
			[
				`L’import s’est arrêté : la base n’a pas écrit le document ${strapiId} de « ${collection} »` +
					`${code ? ` (code ${code})` : ''}.`,
				'Le texte de l’erreur n’est pas affiché : il porte les valeurs de la requête.',
				'Ce qui était écrit avant reste écrit ; un nouveau passage reprend à partir de là.',
			].join(' ')
		)
	}
}

/**
 * Writes the plan: the creations and the updates, one document at a time, each with the import
 * context. Payload replaces `updatedAt` at each update: the dates of the source are written back
 * afterwards, by the adapter of the database, so that the next run finds them equal.
 */
export async function write(payload: Payload, adaptateur: Adapter, plan: Plan): Promise<Summary> {
	const summary: Summary = { created: 0, updated: 0, unchanged: 0, refused: [] }
	const create = payload.create.bind(payload) as unknown as Write
	const update = payload.update.bind(payload) as unknown as Write
	// What the server computes is never sent: server code that writes it would make it a decision.
	const computed = new Set(adaptateur.computed ?? [])
	const written = (valeurs: Readonly<Record<string, unknown>>) =>
		Object.fromEntries(Object.entries(valeurs).filter(([champ]) => !computed.has(champ)))
	for (const action of plan.actions) {
		const { expected } = action
		if (action.kind === 'inchange') {
			summary.unchanged++
			continue
		}
		const options = adaptateur.options?.(expected) ?? {}
		const common = {
			collection: adaptateur.collection,
			context: { ...IMPORT_CONTEXT, ...options.context },
			depth: 0 as const,
			overrideAccess: true as const,
		}
		try {
			if (action.kind === 'creation') {
				await create({
					...common,
					data: { ...written(expected.values), ...expected.onCreation },
					draft: options.draft === true,
					disableVerificationEmail: options.disableVerificationEmail,
				})
				summary.created++
				continue
			}
			const fields = action.fields.filter(champ => !DATES.has(champ) && !computed.has(champ))
			if (fields.length > 0)
				await update({
					...common,
					id: action.id,
					data: choose({ ...adaptateur.defaults, ...expected.values }, fields),
					draft: false,
				})
			const dates = choose(expected.values, ['createdAt', 'updatedAt'])
			if (Object.keys(dates).length > 0)
				await payload.db.updateOne({ collection: adaptateur.collection, id: action.id, data: dates })
			summary.updated++
		} catch (error) {
			// A value Payload refuses is listed, and the run goes on. Anything else stops it, and the
			// error of the database is dropped here: its message holds the values of the query.
			if (!(error instanceof ValidationError))
				throw new InterruptedImport(adaptateur.collection, expected.strapiId, errorCode(error))
			summary.refused.push(payloadRefusal(expected.strapiId, error))
		}
	}
	return summary
}

/**
 * The fingerprint of documents: a SHA-256 of their compared values, one line per document, in
 * the order of their `strapiId`. The expected documents and the target give the same one when
 * every value is equal. Only the fingerprint leaves the import, never a value.
 */
export function documentsFingerprint(
	adaptateur: Adapter,
	documents: readonly { strapiId: number; values: Readonly<Record<string, unknown>> }[]
): string {
	const seeds = new Set([...(adaptateur.seeds ?? []), ...(adaptateur.frozen ?? [])])
	const fields = Object.keys(adaptateur.fields)
		.filter(champ => !seeds.has(champ))
		.sort()
	const rows = [...documents]
		.sort((a, b) => a.strapiId - b.strapiId)
		.map(({ strapiId, values: valeurs }) =>
			JSON.stringify([
				strapiId,
				...fields.map(champ =>
					normalize(adaptateur.fields[champ] ?? 'texte', valeurs[champ] ?? adaptateur.defaults?.[champ])
				),
			])
		)
	return createHash('sha256').update(rows.join('\n')).digest('hex')
}

/**
 * The parity of a collection after a run: every document of the source the import takes is in
 * the target, with the same values. A document refused, before the write or by Payload, counts:
 * it is expected, and the target does not hold it as the source gives it.
 */
export interface Parity {
	/** The documents of the source the import takes, the refused ones included. */
	expected: number
	/** Expected documents found in the target by their `strapiId`, the refused ones aside. */
	present: number
	/** Found, with every compared value equal. */
	equal: number
	/** `strapiId` of the documents refused during the run: listed, they wait for a decision (ticket 066). */
	refused: number[]
	/** `strapiId` of the documents found with another value, the refused ones aside. */
	different: number[]
	/** `strapiId` of the expected documents the target does not hold, the refused ones aside. */
	missing: number[]
	/** `strapiId` of the documents of the target that no expected document names. */
	extra: number[]
	/** The fingerprints of the expected documents and of the target, the refused ones aside on both sides. */
	expectedFingerprint: string
	targetFingerprint: string
}

/**
 * Compares the expected documents with the target, read again after the run. The refused
 * documents are counted apart: whatever the target holds for one of them (nothing, or the values
 * of an earlier run) is neither missing, nor different, nor more.
 */
export function parity(
	adaptateur: Adapter,
	attendus: readonly Expected[],
	existants: readonly Existing[],
	refus: readonly Refusal[] = []
): Parity {
	const refuses = [...new Set(refus.map(({ strapiId }) => strapiId))].sort((a, b) => a - b)
	const excluded = new Set(refuses)
	const compares = attendus.filter(({ strapiId }) => !excluded.has(strapiId))
	const plan = planActions(adaptateur, compares, existants)
	const ids = (genre: Action['kind']) =>
		plan.actions.filter(action => action.kind === genre).map(({ expected }) => expected.strapiId)
	const different = ids('modification')
	const missing = ids('creation')
	return {
		expected: compares.length + refuses.length,
		present: compares.length - missing.length,
		equal: ids('inchange').length,
		refused: refuses,
		different: different,
		missing: missing,
		extra: plan.extra.filter(strapiId => !excluded.has(strapiId)),
		expectedFingerprint: documentsFingerprint(adaptateur, compares),
		targetFingerprint: documentsFingerprint(
			adaptateur,
			existants
				.map(({ values: valeurs }) => ({ strapiId: Number(valeurs.strapiId), values: valeurs }))
				.filter(({ strapiId }) => !excluded.has(strapiId))
		),
	}
}

/**
 * True when nothing but the refused documents separates the target from the source: nothing
 * different, nothing missing, nothing more, the same fingerprint.
 */
export const withoutUnexplainedGap = (p: Parity): boolean =>
	p.different.length === 0 &&
	p.missing.length === 0 &&
	p.extra.length === 0 &&
	p.expectedFingerprint === p.targetFingerprint

/** True when a parity is complete: no document refused, and nothing else between the target and the source. */
export const parityComplete = (p: Parity): boolean => p.refused.length === 0 && withoutUnexplainedGap(p)
