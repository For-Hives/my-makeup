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
 *   (src/lib/contexte-import.ts). A value the target refuses is listed by identifier and by
 *   field, never with the value itself (SCHEMA.md, rule 5).
 *
 * No `bun` import here: the import can run under Node too.
 */

import { createHash } from 'node:crypto'
import { type CollectionSlug, type Payload, type RequestContext, ValidationError } from 'payload'
import { CONTEXTE_IMPORT } from '../../../src/lib/contexte-import'

/** How two values of a field are said equal. */
export type Genre = 'texte' | 'date' | 'booleen' | 'nombre' | 'relation'

/** The collections the import writes. */
export type CollectionImportee = Extract<CollectionSlug, 'pros' | 'profils' | 'talents'>

/**
 * A transformation made on purpose: the field, and where the rule is written. A key of the
 * register of intended changes (`slug-stocke`), or a section of the frozen schema
 * (`SCHEMA.md §5.1`) for the two transformations that change no page.
 */
export interface Ecart {
	champ: string
	reference: string
}

/** A document of the source, as the target must hold it. */
export interface Attendu {
	strapiId: number
	/** The values of the compared fields, under the names of Payload. */
	valeurs: Readonly<Record<string, unknown>>
	/** Given at the creation only, never compared nor reported: the random password of an account. */
	aLaCreation?: Readonly<Record<string, unknown>>
	/** The transformations made on this document. */
	ecarts: readonly Ecart[]
}

/** A document the target refuses: its identifier, why, and the fields at fault. Never a value. */
export interface Refus {
	strapiId: number
	motif: string
	champs?: string[]
}

/** A document of the target that holds a `strapiId`. */
export interface Existant {
	id: number
	valeurs: Readonly<Record<string, unknown>>
}

export type Action =
	| { genre: 'creation'; attendu: Attendu }
	| { genre: 'modification'; attendu: Attendu; id: number; champs: string[] }
	| { genre: 'inchange'; attendu: Attendu; id: number }

/** What the import knows of a collection, besides its data. */
export interface Adaptateur {
	collection: CollectionImportee
	/** The compared fields and their kind. `createdAt` and `updatedAt` are restored after an update. */
	champs: Readonly<Record<string, Genre>>
	/** Options of the writes of one document: a draft, no confirmation email, more context. */
	options?: (attendu: Attendu) => OptionsDEcriture
}

export interface OptionsDEcriture {
	/**
	 * Created as a draft, without the validation of a published document. An update always writes
	 * the document itself (`draft: false`), whatever its status: a draft update of Payload would
	 * only write a new version, and the next run would find the document unchanged.
	 */
	brouillon?: boolean
	/** No confirmation email for a new account. */
	disableVerificationEmail?: boolean
	/** Context added to the import context. */
	contexte?: RequestContext
}

/** The plan of a collection: what to write, and what the target holds that the source does not give. */
export interface Plan {
	actions: Action[]
	/** `strapiId` of the documents of the target that no expected document names. Never deleted. */
	enTrop: number[]
}

/** What a run did in a collection. */
export interface Bilan {
	crees: number
	modifies: number
	inchanges: number
	refuses: Refus[]
}

const DATES = new Set(['createdAt', 'updatedAt'])

/** A value as it is compared: `undefined` is `null`, a date is an ISO string, a relation is an id. */
export function normaliser(genre: Genre, valeur: unknown): unknown {
	if (valeur === undefined || valeur === null) return null
	switch (genre) {
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
export function champsDifferents(adaptateur: Adaptateur, attendu: Attendu, existant: Existant): string[] {
	return Object.entries(adaptateur.champs)
		.filter(
			([champ, genre]) => normaliser(genre, attendu.valeurs[champ]) !== normaliser(genre, existant.valeurs[champ])
		)
		.map(([champ]) => champ)
}

/** What to do with each expected document, given what the target holds. */
export function planifier(adaptateur: Adaptateur, attendus: readonly Attendu[], existants: readonly Existant[]): Plan {
	const parStrapiId = new Map<number, Existant>()
	for (const existant of existants) parStrapiId.set(Number(existant.valeurs.strapiId), existant)
	const nommes = new Set(attendus.map(({ strapiId }) => strapiId))
	const actions = attendus.map((attendu): Action => {
		const existant = parStrapiId.get(attendu.strapiId)
		if (!existant) return { genre: 'creation', attendu }
		const champs = champsDifferents(adaptateur, attendu, existant)
		return champs.length === 0
			? { genre: 'inchange', attendu, id: existant.id }
			: { genre: 'modification', attendu, id: existant.id, champs }
	})
	const enTrop = [...parStrapiId.keys()].filter(strapiId => !nommes.has(strapiId)).sort((a, b) => a - b)
	return { actions, enTrop }
}

/** The plan in numbers, before anything is written: what a run would do. */
export function bilanDuPlan(plan: Plan): Bilan {
	const compter = (genre: Action['genre']) => plan.actions.filter(action => action.genre === genre).length
	return { crees: compter('creation'), modifies: compter('modification'), inchanges: compter('inchange'), refuses: [] }
}

/**
 * Every document of the target that holds a `strapiId`, with the compared fields. Hidden fields
 * are read too (the legacy hash of an account): they stay in memory, for the comparison only.
 */
export async function lireLaCible(payload: Payload, adaptateur: Adaptateur): Promise<Existant[]> {
	const select = Object.fromEntries([...Object.keys(adaptateur.champs), 'strapiId'].map(champ => [champ, true]))
	const { docs } = await payload.find({
		collection: adaptateur.collection,
		where: { strapiId: { exists: true } },
		select,
		depth: 0,
		pagination: false,
		overrideAccess: true,
		showHiddenFields: true,
	})
	return docs.map(doc => ({ id: Number(doc.id), valeurs: { ...doc } }))
}

/** The Local API, called the same way for the three collections; each adapter has typed its data. */
type Ecrire = (options: {
	collection: CollectionImportee
	id?: number
	data: Record<string, unknown>
	context: RequestContext
	depth: 0
	draft?: boolean
	disableVerificationEmail?: boolean
	overrideAccess: true
}) => Promise<{ id: number | string }>

const choisir = (valeurs: Readonly<Record<string, unknown>>, champs: readonly string[]) =>
	Object.fromEntries(champs.filter(champ => champ in valeurs).map(champ => [champ, valeurs[champ]]))

/** The refusal of a document by Payload, by field path; anything else is not a refusal and stops the run. */
function refusDePayload(strapiId: number, erreur: unknown): Refus {
	if (!(erreur instanceof ValidationError)) throw erreur
	const champs = [...new Set(erreur.data.errors.map(({ path }) => path))].sort()
	return { strapiId, motif: 'refuse-par-payload', champs }
}

/**
 * Writes the plan: the creations and the updates, one document at a time, each with the import
 * context. Payload replaces `updatedAt` at each update: the dates of the source are written back
 * afterwards, by the adapter of the database, so that the next run finds them equal.
 */
export async function ecrire(payload: Payload, adaptateur: Adaptateur, plan: Plan): Promise<Bilan> {
	const bilan: Bilan = { crees: 0, modifies: 0, inchanges: 0, refuses: [] }
	const creer = payload.create.bind(payload) as unknown as Ecrire
	const modifier = payload.update.bind(payload) as unknown as Ecrire
	for (const action of plan.actions) {
		const { attendu } = action
		if (action.genre === 'inchange') {
			bilan.inchanges++
			continue
		}
		const options = adaptateur.options?.(attendu) ?? {}
		const commun = {
			collection: adaptateur.collection,
			context: { ...CONTEXTE_IMPORT, ...options.contexte },
			depth: 0 as const,
			overrideAccess: true as const,
		}
		try {
			if (action.genre === 'creation') {
				await creer({
					...commun,
					data: { ...attendu.valeurs, ...attendu.aLaCreation },
					draft: options.brouillon === true,
					disableVerificationEmail: options.disableVerificationEmail,
				})
				bilan.crees++
				continue
			}
			const champs = action.champs.filter(champ => !DATES.has(champ))
			if (champs.length > 0)
				await modifier({ ...commun, id: action.id, data: choisir(attendu.valeurs, champs), draft: false })
			const dates = choisir(attendu.valeurs, ['createdAt', 'updatedAt'])
			if (Object.keys(dates).length > 0)
				await payload.db.updateOne({ collection: adaptateur.collection, id: action.id, data: dates })
			bilan.modifies++
		} catch (erreur) {
			bilan.refuses.push(refusDePayload(attendu.strapiId, erreur))
		}
	}
	return bilan
}

/**
 * The fingerprint of documents: a SHA-256 of their compared values, one line per document, in
 * the order of their `strapiId`. The expected documents and the target give the same one when
 * every value is equal. Only the fingerprint leaves the import, never a value.
 */
export function empreinteDesDocuments(
	adaptateur: Adaptateur,
	documents: readonly { strapiId: number; valeurs: Readonly<Record<string, unknown>> }[]
): string {
	const champs = Object.keys(adaptateur.champs).sort()
	const lignes = [...documents]
		.sort((a, b) => a.strapiId - b.strapiId)
		.map(({ strapiId, valeurs }) =>
			JSON.stringify([
				strapiId,
				...champs.map(champ => normaliser(adaptateur.champs[champ] ?? 'texte', valeurs[champ])),
			])
		)
	return createHash('sha256').update(lignes.join('\n')).digest('hex')
}

/** The parity of a collection after a run: every expected document is in the target, with the same values. */
export interface Parite {
	attendus: number
	/** Expected documents found in the target by their `strapiId`. */
	presents: number
	/** Found, with every compared value equal. */
	egaux: number
	/** `strapiId` of the documents found with another value. */
	differents: number[]
	/** `strapiId` of the expected documents the target does not hold. */
	manquants: number[]
	/** `strapiId` of the documents of the target that no expected document names. */
	enTrop: number[]
	empreinteAttendue: string
	empreinteCible: string
}

/** Compares the expected documents with the target, read again after the run. */
export function parite(adaptateur: Adaptateur, attendus: readonly Attendu[], existants: readonly Existant[]): Parite {
	const plan = planifier(adaptateur, attendus, existants)
	const ids = (genre: Action['genre']) =>
		plan.actions.filter(action => action.genre === genre).map(({ attendu }) => attendu.strapiId)
	const differents = ids('modification')
	const manquants = ids('creation')
	return {
		attendus: attendus.length,
		presents: attendus.length - manquants.length,
		egaux: ids('inchange').length,
		differents,
		manquants,
		enTrop: plan.enTrop,
		empreinteAttendue: empreinteDesDocuments(adaptateur, attendus),
		empreinteCible: empreinteDesDocuments(
			adaptateur,
			existants.map(({ valeurs }) => ({ strapiId: Number(valeurs.strapiId), valeurs }))
		),
	}
}

/** True when a parity is complete: nothing different, nothing missing, nothing more, same fingerprint. */
export const pariteComplete = (p: Parite): boolean =>
	p.differents.length === 0 &&
	p.manquants.length === 0 &&
	p.enTrop.length === 0 &&
	p.empreinteAttendue === p.empreinteCible
