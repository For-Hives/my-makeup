/**
 * The table of decisions of the import: what a person decided for the cases the import cannot
 * decide alone (ticket 066). It is a JSON file outside the repository for the real data, given to
 * the command by `--decisions <fichier>`; on the bench, a fixture of fictional identifiers.
 *
 * It names documents by their identifier in the old base, never by a value:
 *
 *   { "emailsPartages": [{ "comptes": [9, 10, 11, 12], "retenu": 9 }], "profilsEcartes": [29] }
 *
 * - `emailsPartages`: accounts of the old site that share one email (edge spaces and capitals
 *   aside). The v3 has one account per email: only `retenu` is taken, the others are set aside.
 *   A group the source holds without its decision stops the import before any write.
 * - `profilsEcartes`: profiles whose account a decision above sets aside, and that a person
 *   decided to leave aside with it. Such a profile without its decision stops the import before
 *   any write (docs/migration/SCHEMA.md, §11).
 */

import { z } from 'zod'
import { ImportRefuse } from './cible'

const identifiant = z.number().int().positive()

const SCHEMA_DES_DECISIONS = z
	.object({
		emailsPartages: z
			.array(
				z
					.object({ comptes: z.array(identifiant).min(2), retenu: identifiant })
					.strict()
					.refine(({ comptes, retenu }) => comptes.includes(retenu), {
						message: 'le compte retenu doit être l’un des comptes du groupe',
					})
					.refine(({ comptes }) => new Set(comptes).size === comptes.length, {
						message: 'un compte est nommé deux fois',
					})
			)
			.default([]),
		profilsEcartes: z
			.array(identifiant)
			.refine(profils => new Set(profils).size === profils.length, { message: 'un profil est nommé deux fois' })
			.default([]),
	})
	.strict()

export type Decisions = z.infer<typeof SCHEMA_DES_DECISIONS>

/** No decision at all: every case the import cannot decide stops it. */
export const AUCUNE_DECISION: Decisions = { emailsPartages: [], profilsEcartes: [] }

/** The table of decisions read from the text of its file, or `ImportRefuse` with what is wrong, never a value. */
export function lireLesDecisions(texte: string): Decisions {
	let json: unknown
	try {
		json = JSON.parse(texte)
	} catch {
		throw new ImportRefuse('La table de décision n’est pas un JSON valide : rien n’est écrit.')
	}
	const lu = SCHEMA_DES_DECISIONS.safeParse(json)
	if (lu.success) {
		const nommes = lu.data.emailsPartages.flatMap(({ comptes }) => comptes)
		if (new Set(nommes).size !== nommes.length)
			throw new ImportRefuse('La table de décision nomme un compte dans deux groupes : rien n’est écrit.')
		return lu.data
	}
	const problemes = lu.error.issues.map(({ path, message }) => `${path.join('.') || '(racine)'} : ${message}`)
	throw new ImportRefuse(`La table de décision est refusée : ${problemes.join(' ; ')}. Rien n’est écrit.`)
}

/** Two lists of identifiers that name the same accounts. */
const memesComptes = (a: readonly number[], b: readonly number[]): boolean =>
	a.length === b.length && [...a].sort((x, y) => x - y).every((id, rang) => id === [...b].sort((x, y) => x - y)[rang])

export interface ApplicationDesDecisions {
	/** The accounts set aside by a decision. */
	ecartes: number[]
	/** The groups the source holds that no decision names exactly: the import stops. */
	sansDecision: number[][]
	/** Decisions that name no group of the source: they have no effect. */
	sansObjet: number
}

/**
 * Applies the decisions to the groups of accounts the source holds. A decision applies to a group
 * when it names exactly its accounts: a group that changed since the decision was written (an
 * account added or deleted) is a new case, and stops the import.
 */
export function appliquerLesDecisions(
	groupes: readonly number[][],
	decisions: Pick<Decisions, 'emailsPartages'>
): ApplicationDesDecisions {
	const ecartes: number[] = []
	const sansDecision: number[][] = []
	const appliquees = new Set<number>()
	for (const groupe of groupes) {
		const rang = decisions.emailsPartages.findIndex(({ comptes }) => memesComptes(comptes, groupe))
		const decision = decisions.emailsPartages[rang]
		if (!decision) {
			sansDecision.push(groupe)
			continue
		}
		appliquees.add(rang)
		ecartes.push(...groupe.filter(id => id !== decision.retenu))
	}
	return {
		ecartes: ecartes.sort((a, b) => a - b),
		sansDecision,
		sansObjet: decisions.emailsPartages.length - appliquees.size,
	}
}
