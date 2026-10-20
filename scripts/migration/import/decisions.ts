/**
 * The table of decisions of the import: what a person decided for the cases the import cannot
 * decide alone (ticket 066). It is a JSON file outside the repository for the real data, given to
 * the command by `--decisions <fichier>`; on the bench, a fixture of fictional identifiers.
 *
 * It names documents by their identifier in the old base, never by a value:
 *
 *   { "emailsPartages": [{ "comptes": [9, 10, 11, 12], "retenu": 9 }], "profilsEcartes": [29],
 *     "communes": [{ "profil": 28, "codeInsee": "74243" }] }
 *
 * - `emailsPartages`: accounts of the old site that share one email (edge spaces and capitals
 *   aside). The v3 has one account per email: only `retenu` is taken, the others are set aside; the kept account without a legacy hash takes
 *   the one of the first account set aside that has one (ticket 066 default), but only when the kept account is a local one: the old site never verified emails, so a password must not open a Google or Facebook account that had none.
 *   `"pretDuHash": false` on a group refuses the loan; `true` grants it to a kept account that is not local (a person confirmed both accounts are the same one).
 *   A group the source holds without its decision stops the import before any write.
 * - `profilsEcartes`: profiles a person decided to leave aside: a profile whose account a decision
 *   above sets aside, or a profile without an account in the source that is not one of the 13
 *   profiles of the spam (SCHEMA.md §4.1). Such a profile without its decision stops the import
 *   before any write (docs/migration/SCHEMA.md, §11).
 * - `communes`: for a profile whose city the import leaves « à revoir » (ticket 063), the commune a
 *   person chose, by its INSEE code, or `null` for none: the zone stays empty, and the profile is no
 *   longer « à revoir ». A line for a profile that is not « à revoir » is without effect.
 */

import { z } from 'zod'
import { departmentOfInseeCode } from '../../../src/lib/profile/zone'
import { ImportRefuse } from './target'

const identifier = z.number().int().positive()

const DECISIONS_SCHEMA = z
	.object({
		emailsPartages: z
			.array(
				z
					.object({ comptes: z.array(identifier).min(2), retenu: identifier, pretDuHash: z.boolean().optional() })
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
			.array(identifier)
			.refine(profils => new Set(profils).size === profils.length, { message: 'un profil est nommé deux fois' })
			.default([]),
		communes: z
			.array(
				z
					.object({
						profil: identifier,
						codeInsee: z
							.string()
							.refine(code => departmentOfInseeCode(code) !== null, { message: 'code INSEE mal formé' })
							.nullable(),
					})
					.strict()
			)
			.refine(lignes => new Set(lignes.map(({ profil }) => profil)).size === lignes.length, {
				message: 'un profil est nommé deux fois',
			})
			.optional(),
	})
	.strict()

export type Decisions = z.infer<typeof DECISIONS_SCHEMA>

/** No decision at all: every case the import cannot decide stops it. */
export const NO_DECISION: Decisions = { emailsPartages: [], profilsEcartes: [] }

/** The table of decisions read from the text of its file, or `ImportRefuse` with what is wrong, never a value. */
export function readDecisions(texte: string): Decisions {
	let json: unknown
	try {
		json = JSON.parse(texte)
	} catch {
		throw new ImportRefuse('La table de décision n’est pas un JSON valide : rien n’est écrit.')
	}
	const read = DECISIONS_SCHEMA.safeParse(json)
	if (read.success) {
		const named = read.data.emailsPartages.flatMap(({ comptes }) => comptes)
		if (new Set(named).size !== named.length)
			throw new ImportRefuse('La table de décision nomme un compte dans deux groupes : rien n’est écrit.')
		return read.data
	}
	const problems = read.error.issues.map(({ path, message }) => `${path.join('.') || '(racine)'} : ${message}`)
	throw new ImportRefuse(`La table de décision est refusée : ${problems.join(' ; ')}. Rien n’est écrit.`)
}

/** Two lists of identifiers that name the same accounts. */
const sameAccounts = (a: readonly number[], b: readonly number[]): boolean =>
	a.length === b.length && [...a].sort((x, y) => x - y).every((id, rang) => id === [...b].sort((x, y) => x - y)[rang])

export interface DecisionsApplication {
	/** The accounts set aside by a decision. */
	ecartes: number[]
	/** For each group decided, the account kept and the accounts set aside in its favour. */
	rattaches: { retenu: number; ecartes: number[]; pretDuHash: boolean | undefined }[]
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
export function applyDecisions(
	groupes: readonly number[][],
	decisions: Pick<Decisions, 'emailsPartages'>
): DecisionsApplication {
	const excluded: number[] = []
	const attached: DecisionsApplication['rattaches'] = []
	const withoutDecision: number[][] = []
	const applied = new Set<number>()
	for (const group of groupes) {
		const position = decisions.emailsPartages.findIndex(({ comptes }) => sameAccounts(comptes, group))
		const decision = decisions.emailsPartages[position]
		if (!decision) {
			withoutDecision.push(group)
			continue
		}
		applied.add(position)
		const others = group.filter(id => id !== decision.retenu)
		excluded.push(...others)
		attached.push({ retenu: decision.retenu, ecartes: others, pretDuHash: decision.pretDuHash })
	}
	return {
		ecartes: excluded.sort((a, b) => a - b),
		rattaches: attached,
		sansDecision: withoutDecision,
		sansObjet: decisions.emailsPartages.length - applied.size,
	}
}
