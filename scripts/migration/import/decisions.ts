/**
 * The table of decisions of the import: what a person decided for the cases the import cannot
 * decide alone (ticket 066). It is a JSON file outside the repository for the real data, given to
 * the command by `--decisions <file>`; on the bench, a fixture of fictional identifiers.
 *
 * It names documents by their identifier in the old base, never by a value:
 *
 *   { "sharedEmails": [{ "accounts": [9, 10, 11, 12], "kept": 9 }], "excludedProfiles": [29],
 *     "cities": [{ "profile": 28, "inseeCode": "74243" }] }
 *
 * - `sharedEmails`: accounts of the old site that share one email (edge spaces and capitals
 *   aside). The v3 has one account per email: only `kept` is taken, the others are set aside; the kept account without a legacy hash takes
 *   the one of the first account set aside that has one (ticket 066 default), but only when the kept account is a local one: the old site never verified emails, so a password must not open a Google or Facebook account that had none.
 *   `"lendHash": false` on a group refuses the loan; `true` grants it to a kept account that is not local (a person confirmed both accounts are the same one).
 *   A group the source holds without its decision stops the import before any write.
 * - `excludedProfiles`: profiles a person decided to leave aside: a profile whose account a decision
 *   above sets aside, or a profile without an account in the source that is not one of the 13
 *   profiles of the spam (SCHEMA.md §4.1). Such a profile without its decision stops the import
 *   before any write (docs/migration/SCHEMA.md, §11).
 * - `cities`: for a profile whose city the import leaves « à revoir » (ticket 063), the commune a
 *   person chose, by its INSEE code, or `null` for none: the zone stays empty, and the profile is no
 *   longer « à revoir ». A line for a profile that is not « à revoir » is without effect.
 */

import { z } from 'zod'
import { departmentOfInseeCode } from '../../../src/lib/profile/zone'
import { ImportRefuse } from './target'

const identifier = z.number().int().positive()

const DECISIONS_SCHEMA = z
	.object({
		sharedEmails: z
			.array(
				z
					.object({ accounts: z.array(identifier).min(2), kept: identifier, lendHash: z.boolean().optional() })
					.strict()
					.refine(({ accounts: comptes, kept: retenu }) => comptes.includes(retenu), {
						message: 'le compte retenu doit être l’un des comptes du groupe',
					})
					.refine(({ accounts: comptes }) => new Set(comptes).size === comptes.length, {
						message: 'un compte est nommé deux fois',
					})
			)
			.default([]),
		excludedProfiles: z
			.array(identifier)
			.refine(profils => new Set(profils).size === profils.length, { message: 'un profil est nommé deux fois' })
			.default([]),
		cities: z
			.array(
				z
					.object({
						profile: identifier,
						inseeCode: z
							.string()
							.refine(code => departmentOfInseeCode(code) !== null, { message: 'code INSEE mal formé' })
							.nullable(),
					})
					.strict()
			)
			.refine(lignes => new Set(lignes.map(({ profile: profil }) => profil)).size === lignes.length, {
				message: 'un profil est nommé deux fois',
			})
			.optional(),
	})
	.strict()

export type Decisions = z.infer<typeof DECISIONS_SCHEMA>

/** No decision at all: every case the import cannot decide stops it. */
export const NO_DECISION: Decisions = { sharedEmails: [], excludedProfiles: [] }

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
		const named = read.data.sharedEmails.flatMap(({ accounts: comptes }) => comptes)
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
	excluded: number[]
	/** For each group decided, the account kept and the accounts set aside in its favour. */
	attached: { kept: number; excluded: number[]; lendHash: boolean | undefined }[]
	/** The groups the source holds that no decision names exactly: the import stops. */
	withoutDecision: number[][]
	/** Decisions that name no group of the source: they have no effect. */
	pointless: number
}

/**
 * Applies the decisions to the groups of accounts the source holds. A decision applies to a group
 * when it names exactly its accounts: a group that changed since the decision was written (an
 * account added or deleted) is a new case, and stops the import.
 */
export function applyDecisions(
	groupes: readonly number[][],
	decisions: Pick<Decisions, 'sharedEmails'>
): DecisionsApplication {
	const excluded: number[] = []
	const attached: DecisionsApplication['attached'] = []
	const withoutDecision: number[][] = []
	const applied = new Set<number>()
	for (const group of groupes) {
		const position = decisions.sharedEmails.findIndex(({ accounts: comptes }) => sameAccounts(comptes, group))
		const decision = decisions.sharedEmails[position]
		if (!decision) {
			withoutDecision.push(group)
			continue
		}
		applied.add(position)
		const others = group.filter(id => id !== decision.kept)
		excluded.push(...others)
		attached.push({ kept: decision.kept, excluded: others, lendHash: decision.lendHash })
	}
	return {
		excluded: excluded.sort((a, b) => a - b),
		attached: attached,
		withoutDecision: withoutDecision,
		pointless: decisions.sharedEmails.length - applied.size,
	}
}
