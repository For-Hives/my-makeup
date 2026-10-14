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

/** The refusal of a document by Payload, by field path. */
function refusDePayload(strapiId: number, erreur: ValidationError): Refus {
	const champs = [...new Set(erreur.data.errors.map(({ path }) => path))].sort()
	return { strapiId, motif: 'refuse-par-payload', champs }
}

/** A code is printed only when it has the form of one: capitals, digits and `_`, never a value. */
const FORME_DE_CODE = /^[0-9A-Z_]{5,40}$/

/**
 * The code of an error of the database (its SQLSTATE, `23514`), or of the system (`ECONNRESET`),
 * read on the error or on one of its causes. Never its message nor its detail: the error of a
 * query carries the query and its parameters, an email or a hash among them.
 */
export function codeDeLErreur(erreur: unknown): string | undefined {
	let courante = erreur
	for (let profondeur = 0; profondeur < 5 && typeof courante === 'object' && courante !== null; profondeur++) {
		const { code } = courante as { code?: unknown }
		if (typeof code === 'string' && FORME_DE_CODE.test(code)) return code
		courante = (courante as { cause?: unknown }).cause
	}
	return undefined
}

/**
 * What the command says of an error the import did not write itself: its type and its code,
 * never its message, which may carry the values of a query.
 */
export function messageDUneErreurInattendue(erreur: unknown): string {
	const type = erreur instanceof Error && /^\w{1,60}$/.test(erreur.name) ? erreur.name : 'erreur sans type'
	const code = codeDeLErreur(erreur)
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
export class ImportInterrompu extends Error {
	override readonly name = 'ImportInterrompu'

	constructor(
		readonly collection: CollectionImportee,
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
			// A value Payload refuses is listed, and the run goes on. Anything else stops it, and the
			// error of the database is dropped here: its message holds the values of the query.
			if (!(erreur instanceof ValidationError))
				throw new ImportInterrompu(adaptateur.collection, attendu.strapiId, codeDeLErreur(erreur))
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

/**
 * The parity of a collection after a run: every document of the source the import takes is in
 * the target, with the same values. A document refused, before the write or by Payload, counts:
 * it is expected, and the target does not hold it as the source gives it.
 */
export interface Parite {
	/** The documents of the source the import takes, the refused ones included. */
	attendus: number
	/** Expected documents found in the target by their `strapiId`, the refused ones aside. */
	presents: number
	/** Found, with every compared value equal. */
	egaux: number
	/** `strapiId` of the documents refused during the run: listed, they wait for a decision (ticket 066). */
	refuses: number[]
	/** `strapiId` of the documents found with another value, the refused ones aside. */
	differents: number[]
	/** `strapiId` of the expected documents the target does not hold, the refused ones aside. */
	manquants: number[]
	/** `strapiId` of the documents of the target that no expected document names. */
	enTrop: number[]
	/** The fingerprints of the expected documents and of the target, the refused ones aside on both sides. */
	empreinteAttendue: string
	empreinteCible: string
}

/**
 * Compares the expected documents with the target, read again after the run. The refused
 * documents are counted apart: whatever the target holds for one of them (nothing, or the values
 * of an earlier run) is neither missing, nor different, nor more.
 */
export function parite(
	adaptateur: Adaptateur,
	attendus: readonly Attendu[],
	existants: readonly Existant[],
	refus: readonly Refus[] = []
): Parite {
	const refuses = [...new Set(refus.map(({ strapiId }) => strapiId))].sort((a, b) => a - b)
	const ecartes = new Set(refuses)
	const compares = attendus.filter(({ strapiId }) => !ecartes.has(strapiId))
	const plan = planifier(adaptateur, compares, existants)
	const ids = (genre: Action['genre']) =>
		plan.actions.filter(action => action.genre === genre).map(({ attendu }) => attendu.strapiId)
	const differents = ids('modification')
	const manquants = ids('creation')
	return {
		attendus: compares.length + refuses.length,
		presents: compares.length - manquants.length,
		egaux: ids('inchange').length,
		refuses,
		differents,
		manquants,
		enTrop: plan.enTrop.filter(strapiId => !ecartes.has(strapiId)),
		empreinteAttendue: empreinteDesDocuments(adaptateur, compares),
		empreinteCible: empreinteDesDocuments(
			adaptateur,
			existants
				.map(({ valeurs }) => ({ strapiId: Number(valeurs.strapiId), valeurs }))
				.filter(({ strapiId }) => !ecartes.has(strapiId))
		),
	}
}

/**
 * True when nothing but the refused documents separates the target from the source: nothing
 * different, nothing missing, nothing more, the same fingerprint.
 */
export const sansEcartInexplique = (p: Parite): boolean =>
	p.differents.length === 0 &&
	p.manquants.length === 0 &&
	p.enTrop.length === 0 &&
	p.empreinteAttendue === p.empreinteCible

/** True when a parity is complete: no document refused, and nothing else between the target and the source. */
export const pariteComplete = (p: Parite): boolean => p.refuses.length === 0 && sansEcartInexplique(p)
