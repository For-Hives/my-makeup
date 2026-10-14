/**
 * Who may do what: the roles of the account collections, and the access rules built on them.
 *
 * - `admins` opens the admin panel. Its role is `admin` (everything) or `redaction` (articles
 *   and talents only: it reads and changes its own account, nothing else of the accounts).
 * - `pros` holds the accounts of the makeup artists. A makeup artist never enters the admin
 *   panel; she reads and changes her own account, and her own profile.
 *
 * One rule per subject: the collections call these functions and never test a role themselves.
 * Every rule here has its lines in the access matrix (tests/integration/payload-acces.test.ts),
 * played through REST and through the Local API with the rules active.
 *
 * A rule that answers a `Where` limits the documents to those that match it: Payload adds it to
 * the query, so a list holds only them and any other document is out of reach.
 */

import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'
// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { STATUT_PUBLIE } from './profil/statut'

/** The roles of an `admins` account, in the order the admin panel lists them. */
export const ROLES_ADMIN = ['admin', 'redaction'] as const
export type RoleAdmin = (typeof ROLES_ADMIN)[number]

/** The collections of accounts. */
export const COLLECTION_ADMINS = 'admins'
export const COLLECTION_PROS = 'pros'

type Utilisateur = PayloadRequest['user'] | undefined

/** An account of the admin panel with the role `admin`: it may do everything. */
export const estAdmin = (user: Utilisateur): boolean => user?.collection === COLLECTION_ADMINS && user.role === 'admin'

/** An account of the admin panel with the role `redaction`: articles and talents only. */
export const estRedaction = (user: Utilisateur): boolean =>
	user?.collection === COLLECTION_ADMINS && user.role === 'redaction'

/** The account of a makeup artist. */
export const estMaquilleuse = (user: Utilisateur): boolean => user?.collection === COLLECTION_PROS

/** Only the role `admin`, for a whole collection. */
export const adminSeulement: Access = ({ req: { user } }) => estAdmin(user)

/** Only the role `admin`, for one field: anyone else's value is ignored, the stored one is kept. */
export const champAdminSeulement: FieldAccess = ({ req: { user } }) => estAdmin(user)

/**
 * Nobody, through any API: the value is written by the server only (the import, a hook), through
 * the Local API without access control. Used for what must never change by a request, and for
 * what must never be read by one.
 */
export const jamais: FieldAccess = () => false

/** The documents of this collection that are the account behind the request itself. */
const soiMeme = (collection: string, user: Utilisateur): Where | false =>
	user?.collection === collection ? { id: { equals: user.id } } : false

/**
 * The role `admin` reaches every account of the collection; any other account of the same
 * collection reaches its own document only; everyone else, nothing.
 *
 * On `admins`: a `redaction` account reads and changes itself only. On `pros`: a makeup artist
 * reads and changes her own account only.
 */
export const adminOuSoiMeme =
	(collection: typeof COLLECTION_ADMINS | typeof COLLECTION_PROS): Access =>
	({ req: { user } }) =>
		estAdmin(user) || soiMeme(collection, user)

/**
 * The role `admin` reaches every profile; a makeup artist reaches the profile she owns (its
 * `pro` is her account); everyone else, nothing. An account without a profile matches no
 * document: an empty list, and a refusal on any write.
 */
export const adminOuProprietaire: Access = ({ req: { user } }) => {
	if (estAdmin(user)) return true
	if (user && estMaquilleuse(user)) return { pro: { equals: user.id } }
	return false
}

/** The profiles the public reads: the published ones (U53). */
export const PROFILS_PUBLIES: Where = { statut: { equals: STATUT_PUBLIE } }

/**
 * Reading profiles (ticket 021). The role `admin` reads every profile; a makeup artist reads her
 * own profile, whatever its status, and the published ones; anyone else, anonymous or `redaction`,
 * the published ones only (U53, I01). A session never shows less than the public sees.
 *
 * What each of them reads of a profile is then decided field by field (`champAdminOuProprietaire`).
 */
export const profilPublieOuProprietaire: Access = ({ req: { user } }) => {
	if (estAdmin(user)) return true
	if (user && estMaquilleuse(user)) return { or: [{ pro: { equals: user.id } }, PROFILS_PUBLIES] }
	return PROFILS_PUBLIES
}

/** The identifier of the account a relationship field holds: the identifier itself, or the account once populated. */
const identifiantDu = (valeur: unknown): string | undefined => {
	const id = typeof valeur === 'object' && valeur !== null && 'id' in valeur ? valeur.id : valeur
	return typeof id === 'number' || typeof id === 'string' ? String(id) : undefined
}

/**
 * Only the role `admin` and the makeup artist a document belongs to, for one field: the account
 * its field `champ` holds (`pro` on a profile, `owner` on a media). Anyone else does not read the
 * field: Payload strips it from the answer.
 *
 * Meant for `read`. The owner's own field is read with the same rule, so when it is stripped the
 * reader is not the owner, and every other field guarded by this rule is stripped too.
 */
export const champAdminOuProprietaire =
	(champ: 'pro' | 'owner'): FieldAccess =>
	({ req: { user }, doc }) => {
		if (estAdmin(user)) return true
		if (!user || !estMaquilleuse(user)) return false
		const proprietaire = identifiantDu((doc as Record<string, unknown> | undefined)?.[champ])
		return proprietaire !== undefined && proprietaire === String(user.id)
	}

/** The fields of a profile only its owner and `admin` read: the account, what the import wrote, what an admin decided. */
export const champDuProfilAdminOuProprietaire: FieldAccess = champAdminOuProprietaire('pro')
