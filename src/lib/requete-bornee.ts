import { APIError, type CollectionBeforeOperationHook, type PayloadRequest, type Plugin } from 'payload'
// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { estAdmin } from './acces'

/**
 * Every request on a collection is bounded before it reaches the database (ticket 048; plan 02
 * §7.2, U60; plan 01 §1.2, the filters through relations that leaked the accounts of the old API).
 *
 * - **At most `CONDITIONS_MAX` conditions** in a filter, for anyone but `admin`: a condition is one
 *   operator on one field, wherever it sits in the `and` and the `or`.
 * - **Never a secret of an account** (`CHAMPS_SECRETS`), for anyone, `admin` included: as a
 *   filter, as a sort, through a relation (`pro.hash`) or in a nested filter.
 * - **Never a private field** (`CHAMPS_PRIVES`) for anyone but `admin`: the address of an account,
 *   the contact details, the internal note and the score of a profile.
 *
 * A field is named by any segment of a path: `pro.email`, `coordonnees.telephone`,
 * `-sessions.expiresAt` all name one. The refusal is a 400 with the same French sentence whatever
 * the data: it says nothing of what the database holds, since it never asks it.
 *
 * The other private fields (the status of a profile, its account, the owner of a photo…) are
 * refused by Payload itself, which checks a filter and a sort against the reading rule of each
 * field. These two lists hold what must never pass, whatever a reading rule says.
 *
 * Code of the server that reads without the rules (`overrideAccess`) is not bounded: it is not a
 * request of a visitor.
 */

/** The most conditions a filter holds for anyone but `admin` (U60). */
export const CONDITIONS_MAX = 20

/** The secrets of an account: never a filter nor a sort, for anyone. */
export const CHAMPS_SECRETS = [
	'hash',
	'salt',
	'sessions',
	'legacyBcrypt',
	'resetPasswordToken',
	'resetPasswordExpiration',
	'_verificationToken',
	'loginAttempts',
	'lockUntil',
	'apiKey',
	'apiKeyIndex',
] as const

/** What only `admin` filters or sorts on. */
export const CHAMPS_PRIVES = ['email', 'coordonnees', 'noteInterne', 'score'] as const

export const MESSAGE_TROP_DE_CONDITIONS = `Cette recherche compte trop de conditions : ${CONDITIONS_MAX} au plus.`
export const MESSAGE_CHAMP_PRIVE = 'Cette recherche porte sur un champ qui ne sert ni de filtre ni de tri.'

/** What a request asks of the database, as Payload hands it to an operation. */
export interface Requete {
	where?: unknown
	sort?: unknown
	/** The field of a `distinct` read. */
	field?: unknown
	/** The filters and sorts of the joined collections. */
	joins?: unknown
}

const estUnObjet = (valeur: unknown): valeur is Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

/** `and` and `or`, in any case, as Payload reads them. */
const estUnLien = (cle: string): boolean => ['and', 'or'].includes(cle.toLowerCase())

/** The filters an `and` or an `or` holds: a list, or an object with numbered keys once a list is too long. */
const filtresDe = (valeur: unknown): unknown[] =>
	Array.isArray(valeur) ? valeur : estUnObjet(valeur) ? Object.values(valeur) : []

/**
 * The conditions of a filter: one per operator on a field, wherever it sits; a `contains` that
 * holds a filter of its own (the photos of a profile) adds that filter's conditions.
 */
export function compterLesConditions(filtre: unknown): number {
	if (!estUnObjet(filtre)) return 0
	let total = 0
	for (const [cle, valeur] of Object.entries(filtre)) {
		if (estUnLien(cle)) {
			for (const sous of filtresDe(valeur)) total += compterLesConditions(sous)
			continue
		}
		if (!estUnObjet(valeur)) {
			total += 1
			continue
		}
		for (const [operateur, operande] of Object.entries(valeur)) {
			total += 1
			if (operateur === 'contains' && estUnObjet(operande)) total += compterLesConditions(operande)
		}
	}
	return total
}

/** The paths of the fields a filter names, nested filters of a `contains` included. */
export function cheminsDuFiltre(filtre: unknown): string[] {
	if (!estUnObjet(filtre)) return []
	return Object.entries(filtre).flatMap(([cle, valeur]) => {
		if (estUnLien(cle)) return filtresDe(valeur).flatMap(cheminsDuFiltre)
		const imbriques = estUnObjet(valeur)
			? Object.entries(valeur).flatMap(([operateur, operande]) =>
					operateur === 'contains' && estUnObjet(operande) ? cheminsDuFiltre(operande) : []
				)
			: []
		return [cle, ...imbriques]
	})
}

/** The paths of the fields a sort names: `-score`, `title,-score` or a list of them. */
export function cheminsDuTri(tri: unknown): string[] {
	const champs = Array.isArray(tri) ? tri : typeof tri === 'string' ? tri.split(',') : []
	return champs
		.filter((champ): champ is string => typeof champ === 'string')
		.map(champ => champ.trim().replace(/^[-+]/, ''))
		.filter(champ => champ !== '')
}

/** Every path a request names: its filter, its sort, the field of a `distinct`, its joins. */
export function cheminsDeLaRequete({ where, sort, field, joins }: Requete): string[] {
	const jointures = estUnObjet(joins) ? Object.values(joins).filter(estUnObjet) : []
	return [
		...cheminsDuFiltre(where),
		...cheminsDuTri(sort),
		...(typeof field === 'string' ? [field] : []),
		...jointures.flatMap(jointure => [...cheminsDuFiltre(jointure.where), ...cheminsDuTri(jointure.sort)]),
	]
}

/** The conditions of a request: its filter and those of its joins. */
const conditionsDeLaRequete = ({ where, joins }: Requete): number =>
	compterLesConditions(where) +
	(estUnObjet(joins)
		? Object.values(joins).reduce<number>((n, j) => n + compterLesConditions(estUnObjet(j) ? j.where : undefined), 0)
		: 0)

/** The segments of a path: `pro.email`, `pro__email` (GraphQL's way) and `pro.email.fr` give `pro`, `email`… */
const segmentsDe = (chemin: string): string[] => chemin.replace(/__/g, '.').split('.')

/**
 * Why this request is refused to this account, or nothing when it passes (U60). `admin` passes
 * the bound and the private fields, never the secrets.
 */
export function refusDeLaRequete(requete: Requete, user: PayloadRequest['user'] | undefined): string | undefined {
	const admin = estAdmin(user)
	if (!admin && conditionsDeLaRequete(requete) > CONDITIONS_MAX) return MESSAGE_TROP_DE_CONDITIONS
	const interdits: readonly string[] = admin ? CHAMPS_SECRETS : [...CHAMPS_SECRETS, ...CHAMPS_PRIVES]
	const nomme = cheminsDeLaRequete(requete).some(chemin => segmentsDe(chemin).some(s => interdits.includes(s)))
	return nomme ? MESSAGE_CHAMP_PRIVE : undefined
}

/**
 * `beforeOperation` of every collection: the first thing an operation does, before its access
 * rules and before the database. Throws a 400 when the request is refused.
 */
export const requeteBornee: CollectionBeforeOperationHook = ({ args, overrideAccess, req }) => {
	if (overrideAccess ?? (args as { overrideAccess?: boolean }).overrideAccess) return args
	const refus = refusDeLaRequete(args as Requete, req.user)
	if (refus) throw new APIError(refus, 400, null, true)
	return args
}

/**
 * Puts `requeteBornee` first in the `beforeOperation` of every collection of the configuration,
 * those of later tickets included. Payload's own collections (document locks, preferences,
 * migrations) are added after the plugins and are not bounded here.
 */
export const requetesBornees: Plugin = config => ({
	...config,
	collections: config.collections?.map(collection => ({
		...collection,
		hooks: {
			...collection.hooks,
			beforeOperation: [requeteBornee, ...(collection.hooks?.beforeOperation ?? [])],
		},
	})),
})
