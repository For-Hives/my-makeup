import type { Payload } from 'payload'
import type { Profile } from '@/payload-types'
import {
	cleanRow,
	LIST_MESSAGES,
	type ListDefinition,
	listSchema,
	profileRows,
	rowErrors,
	type SavedList,
	type SentRow,
	sameRow,
} from './list'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

const isRow = (valeur: unknown): valeur is Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

/** The stored rows of a list, by identifier. */
const byId = (brutes: unknown): Map<string, Record<string, unknown>> =>
	new Map(
		(Array.isArray(brutes) ? brutes : [])
			.filter(isRow)
			.flatMap(ligne => (typeof ligne.id === 'string' ? [[ligne.id, ligne] as const] : []))
	)

type Refusal = { readonly message: string }

/**
 * The options of one row (ticket 132), checked and ready to store, or the refusal. Each option is
 * trimmed; its bounds are checked, what it requires only for a new or changed option; two options
 * that say the same are refused (rule L6). An option keeps its identifier only when it is one of
 * the stored options of this very row (rule L1).
 */
function optionsToWrite(
	definition: ListDefinition,
	nomDeLaLigne: string,
	envoyees: readonly SentRow[],
	stockee: Record<string, unknown> | undefined,
	maintenant: Date
): Record<string, unknown>[] | Refusal {
	const subOptions = definition.options
	if (subOptions === undefined) return []
	const knownById = byId(stockee?.options)
	const written: Record<string, unknown>[] = []
	const views: Record<string, string>[] = []
	for (const sent of envoyees) {
		const values = cleanRow(subOptions, sent.valeurs)
		const known = sent.id === undefined ? undefined : knownById.get(sent.id)
		const unchanged = known !== undefined && sameRow(subOptions, subOptions.depuisLeStockage(known), values)
		const first = Object.values(rowErrors(subOptions, values, { avecRequis: !unchanged, maintenant }))[0]
		const name = subOptions.nom(values) || `option n° ${written.length + 1}`
		if (first !== undefined) return { message: LIST_MESSAGES.optionInvalide(nomDeLaLigne, name, first) }
		if (views.some(autre => sameRow(subOptions, autre, values)))
			return { message: LIST_MESSAGES.optionsEnDouble(nomDeLaLigne, name) }
		views.push(values)
		written.push({
			...(known === undefined ? {} : { id: sent.id }),
			...subOptions.versLeStockage(values),
		})
	}
	return written
}

/**
 * Saves a list of the signed-in makeup artist (tickets 129 to 131), and tells the truth about it,
 * like the networks (src/lib/dashboard/save-networks.ts):
 *
 * - the request is read by the strict schema of the section: the rows, each with its texts and no
 *   other key. A key that is not a field refuses it whole;
 * - each row is trimmed and checked by the rule the form uses (src/lib/dashboard/list.ts). The bounds
 *   are checked for every row. What a row requires is checked for a new row and a changed one only:
 *   an imported row with an empty field (SCHEMA.md §2) never blocks the save of another one;
 * - the profile written is hers, found by her account: the request holds no identifier of profile;
 * - the whole list is written, in the order sent. A row keeps the identifier the server gave it
 *   (rule L1, `identitesDesLignes`); a row sent without one is new. The options of an offer (ticket
 *   132) are written as sent, in order, each with its own identifier; an offer sent with none of the
 *   key keeps the stored options;
 * - the write goes through the access rules and the hooks of the collection, as herself, so the server
 *   recomputes whether the profile is publishable (U04);
 * - the rows given back are those the database stored. A failure gives back a message in French and no
 *   row (E31).
 */
export async function saveList(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown,
	definition: ListDefinition,
	maintenant: Date = new Date()
): Promise<SaveResult<SavedList>> {
	const shape = listSchema(definition).safeParse(saisie)
	if (!shape.success) return { ok: false, message: FAILURE_MESSAGE }
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const profile = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			disableErrors: true,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		if (profile === null) return { ok: false, message: FAILURE_MESSAGE }
		const storedRows = byId((profile as unknown as Record<string, unknown>)[definition.section])

		const rows: Record<string, unknown>[] = []
		for (const sent of shape.data.lignes as readonly SentRow[]) {
			const values = cleanRow(definition, sent.valeurs)
			const storedRow = sent.id === undefined ? undefined : storedRows.get(sent.id)
			const unchanged = storedRow !== undefined && sameRow(definition, definition.depuisLeStockage(storedRow), values)
			const errors = rowErrors(definition, values, { avecRequis: !unchanged, maintenant })
			const first = Object.values(errors)[0]
			if (first !== undefined)
				return {
					ok: false,
					message: LIST_MESSAGES.ligneInvalide(
						definition.nom(values) || `${definition.singulier} n° ${rows.length + 1}`,
						first
					),
				}
			// Options sent replace the stored ones; none sent keeps them.
			const options =
				sent.options === undefined
					? undefined
					: optionsToWrite(definition, definition.nom(values), sent.options, storedRow, maintenant)
			if (options !== undefined && 'message' in options) return { ok: false, message: options.message }
			rows.push({
				...(storedRow === undefined ? {} : { id: sent.id }),
				...definition.versLeStockage(values),
				...(options === undefined ? (storedRow === undefined ? {} : definition.garder?.(storedRow)) : { options }),
			})
		}

		const stored = await payload.update({
			collection: 'profiles',
			data: { [definition.section]: rows } as Partial<Profile>,
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return { ok: true, valeurs: { lignes: profileRows(definition, stored) } }
	} catch (error) {
		return payloadFailure(error, ['lignes'] as const, () => 'lignes')
	}
}
