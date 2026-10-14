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

/** The largest identifier of a document: the identifiers are `serial` columns of Postgres, 32-bit integers. */
const IDENTIFIANT_MAX = 2_147_483_647

/**
 * True for an identifier a document may have: a whole number from 1 to `IDENTIFIANT_MAX`, as a
 * number or as its digits. REST hands a rule `parseFloat` of the address (`abc` gives NaN, `1e999`
 * Infinity); the Local API, what its caller gives.
 */
export function identifiantPossible(id: number | string): boolean {
	const nombre = typeof id === 'number' ? id : /^\d{1,10}$/.test(id) ? Number(id) : Number.NaN
	return Number.isInteger(nombre) && nombre >= 1 && nombre <= IDENTIFIANT_MAX
}

/**
 * True when a request names a document by an identifier no document can have. Postgres refuses to
 * compare such a value with an identifier: the query would fail, and the request end in a 500
 * logged as an error. A rule that answers a `Where` refuses it first (403), before any query.
 */
const identifiantImpossible = (id: number | string | null | undefined): boolean =>
	id !== undefined && id !== null && !identifiantPossible(id)

/** The profiles the public reads: the published ones (U53). */
export const PROFILS_PUBLIES: Where = { statut: { equals: STATUT_PUBLIE } }

/**
 * Reading profiles (ticket 021). The role `admin` reads every profile; a makeup artist reads her
 * own profile, whatever its status, and the published ones; anyone else, anonymous or `redaction`,
 * the published ones only (U53, I01). A session never shows less than the public sees. An
 * identifier no profile can have is refused to all (`identifiantImpossible`).
 *
 * What each of them reads of a profile is then decided field by field (`champAdminOuProprietaire`).
 */
export const profilPublieOuProprietaire: Access = ({ req: { user }, id }) => {
	if (identifiantImpossible(id)) return false
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

/** A condition no document meets: a read limited by it finds nothing, and a document read by its identifier is not found. */
export const AUCUN_DOCUMENT: Where = { id: { exists: false } }

/** True when this media is the main photo, or a photo of the gallery, of a published profile. */
export async function rattacheAUnProfilPublie(req: PayloadRequest, media: number | string): Promise<boolean> {
	const { totalDocs } = await req.payload.count({
		collection: 'profils',
		overrideAccess: true,
		req,
		where: {
			and: [PROFILS_PUBLIES, { or: [{ photoPrincipale: { equals: media } }, { galerie: { in: [media] } }] }],
		},
	})
	return totalDocs > 0
}

/**
 * Reading media (ticket 043, U56, I04).
 *
 * - The role `admin` reads every media.
 * - A list is closed to the public: a makeup artist lists her own media, anyone else is refused.
 * - One media, read by its identifier, is read by anyone when it belongs to a published profile;
 *   a makeup artist also reads her own. Any other media is not found, as if it did not exist.
 * - An identifier no media can have is refused to all, before any query (`identifiantImpossible`).
 *
 * Payload gives the identifier to the rule when it reads one document, never for a list: that is
 * how the two are told apart. A media populated in a profile is read as a list: for the public it
 * stays an identifier, and a public page reads the photos through src/services/public/.
 */
export const lectureDesMedias: Access = async ({ req, id }) => {
	if (identifiantImpossible(id)) return false
	const { user } = req
	if (estAdmin(user)) return true
	const siens: Where | undefined = user && estMaquilleuse(user) ? { owner: { equals: user.id } } : undefined
	if (id === undefined || id === null) return siens ?? false
	if (await rattacheAUnProfilPublie(req, id)) return true
	return siens ?? AUCUN_DOCUMENT
}

/** Sending a photo: a makeup artist, or the role `admin`. The server makes her the owner. */
export const adminOuMaquilleuse: Access = ({ req: { user } }) => estAdmin(user) || estMaquilleuse(user)

/** Changing or deleting a media: the role `admin`, or the makeup artist who owns it; never by an impossible identifier. */
export const adminOuProprietaireDuMedia: Access = ({ req: { user }, id }) => {
	if (identifiantImpossible(id)) return false
	if (estAdmin(user)) return true
	if (user && estMaquilleuse(user)) return { owner: { equals: user.id } }
	return false
}

/** The fields of a media only its owner and `admin` read: the account that owns it. */
export const champDuMediaAdminOuProprietaire: FieldAccess = champAdminOuProprietaire('owner')
