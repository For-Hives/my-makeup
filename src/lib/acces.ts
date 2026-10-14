/**
 * Who may do what: the roles of the account collections, and the access rules built on them.
 *
 * - `admins` opens the admin panel. Its role is `admin` (everything) or `redaction` (articles
 *   and talents only: it reads and changes its own account, nothing else of the accounts).
 * - `pros` holds the accounts of the makeup artists. A makeup artist never enters the admin
 *   panel; she reads and changes her own account, and her own profile.
 * - The editorial collections (talents, then articles) are written by the newsroom, `admin` and
 *   `redaction`; everyone else reads their published documents only.
 *
 * One rule per subject: the collections call these functions and never test a role themselves.
 * Every rule here has its lines in the access matrix (tests/integration/payload-acces.test.ts),
 * played through REST and through the Local API with the rules active.
 *
 * A rule that answers a `Where` limits the documents to those that match it: Payload adds it to
 * the query, so a list holds only them and any other document is out of reach.
 */

import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'

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

/**
 * The newsroom: an account of the admin panel with the role `admin` or `redaction`. It writes the
 * editorial collections, talents (ticket 022) and articles (ticket 046).
 */
export const estAdminOuRedaction = (user: Utilisateur): boolean => estAdmin(user) || estRedaction(user)

/** Only the newsroom, for a whole collection: creating, changing, publishing, deleting, reading the versions. */
export const adminOuRedaction: Access = ({ req: { user } }) => estAdminOuRedaction(user)

/** Only the newsroom, for one field: anyone else gets the document without it. */
export const champAdminOuRedaction: FieldAccess = ({ req: { user } }) => estAdminOuRedaction(user)

/** The documents of an editorial collection that the public may read: the published ones. */
export const SEULEMENT_PUBLIES: Where = { _status: { equals: 'published' } }

/**
 * Reading an editorial collection (drafts on): the newsroom reads every document, drafts
 * included; everyone else, a makeup artist as an anonymous visitor, the published ones only. A
 * draft is out of reach for them, even through `?draft=true`: Payload adds the same condition to
 * the versions it would show instead.
 */
export const adminRedactionOuPublies: Access = ({ req: { user } }) => estAdminOuRedaction(user) || SEULEMENT_PUBLIES
