/**
 * Who may do what: the roles of the account collections, and the access rules built on them.
 *
 * - `admins` opens the admin panel. Its role is `admin` (everything) or `editor` (articles
 *   and talents only: it reads and changes its own account, nothing else of the accounts).
 * - `pros` holds the accounts of the makeup artists. A makeup artist never enters the admin
 *   panel; she reads and changes her own account, and her own profile.
 * - The editorial collections (talents and articles) are written by the newsroom, `admin` and
 *   `editor`; everyone else reads their published documents only. The photos of the articles
 *   belong to nobody: the newsroom sends them and changes them.
 *
 * One rule per subject: the collections call these functions and never test a role themselves.
 * Every rule here has its lines in the access matrix (tests/integration/payload-access.test.ts),
 * played through REST and through the Local API with the rules active.
 *
 * A rule that answers a `Where` limits the documents to those that match it: Payload adds it to
 * the query, so a list holds only them and any other document is out of reach.
 */

import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'
// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { PUBLISHED_STATUS } from './profile/status'

/** The roles of an `admins` account, in the order the admin panel lists them. */
export const ROLES_ADMIN = ['admin', 'editor'] as const
export type RoleAdmin = (typeof ROLES_ADMIN)[number]

/** The collections of accounts. */
export const COLLECTION_ADMINS = 'admins'
export const COLLECTION_PROS = 'pros'

type User = PayloadRequest['user'] | undefined

/** An account of the admin panel with the role `admin`: it may do everything. */
export const isAdmin = (user: User): boolean => user?.collection === COLLECTION_ADMINS && user.role === 'admin'

/** An account of the admin panel with the role `editor`: articles and talents only. */
export const isEditor = (user: User): boolean => user?.collection === COLLECTION_ADMINS && user.role === 'editor'

/** The account of a makeup artist. */
export const isArtist = (user: User): boolean => user?.collection === COLLECTION_PROS

/**
 * Hides a collection from the admin panel unless the account has the role `admin`: the newsroom
 * (`editor`) sees the articles, the talents and their images, and nothing else (ticket 164). It
 * is a matter of what the panel shows; what an account reads and writes is said by the access
 * rules of the collection, which hold whatever the panel shows.
 */
export const hiddenExceptAdmin = ({ user }: { user: unknown }): boolean => !isAdmin(user as User)

/** Only the role `admin`, for a whole collection; never by an impossible identifier (`impossibleId`). */
export const adminOnly: Access = ({ req: { user }, id }) => !impossibleId(id) && isAdmin(user)

/** Only the role `admin`, for one field: anyone else's value is ignored, the stored one is kept. */
export const fieldAdminOnly: FieldAccess = ({ req: { user } }) => isAdmin(user)

/**
 * Nobody, through any API: the value is written by the server only (the import, a hook), through
 * the Local API without access control. Used for what must never change by a request, and for
 * what must never be read by one.
 */
export const neverAllowed: FieldAccess = () => false

/** The documents of this collection that are the account behind the request itself. */
const self = (collection: string, user: User): Where | false =>
	user?.collection === collection ? { id: { equals: user.id } } : false

/**
 * The role `admin` reaches every account of the collection; any other account of the same
 * collection reaches its own document only; everyone else, nothing. An identifier no account can
 * have is refused to all, before any query (ticket 048).
 *
 * On `admins`: a `editor` account reads and changes itself only. On `pros`: a makeup artist
 * reads and changes her own account only.
 */
export const adminOrSelf =
	(collection: typeof COLLECTION_ADMINS | typeof COLLECTION_PROS): Access =>
	({ req: { user }, id }) =>
		!impossibleId(id) && (isAdmin(user) || self(collection, user))

/**
 * The role `admin` reaches every profile; a makeup artist reaches the profile she owns (its
 * `pro` is her account); everyone else, nothing. An account without a profile matches no
 * document: an empty list, and a refusal on any write. An identifier no profile can have is
 * refused to all, before any query (ticket 048).
 */
export const adminOrOwner: Access = ({ req: { user }, id }) => {
	if (impossibleId(id)) return false
	if (isAdmin(user)) return true
	if (user && isArtist(user)) return { pro: { equals: user.id } }
	return false
}

/** The largest identifier of a document: the identifiers are `serial` columns of Postgres, 32-bit integers. */
const ID_MAX = 2_147_483_647

/**
 * True for an identifier a document may have: a whole number from 1 to `ID_MAX`, as a
 * number or as its digits. REST hands a rule `parseFloat` of the address (`abc` gives NaN, `1e999`
 * Infinity); the Local API, what its caller gives.
 */
export function possibleId(id: number | string): boolean {
	const numeric = typeof id === 'number' ? id : /^\d{1,10}$/.test(id) ? Number(id) : Number.NaN
	return Number.isInteger(numeric) && numeric >= 1 && numeric <= ID_MAX
}

/**
 * True when a request names a document by an identifier no document can have. Postgres refuses to
 * compare such a value with an identifier: the query would fail, and the request end in a 500
 * logged as an error. A rule that answers a `Where` refuses it first (403), before any query.
 */
const impossibleId = (id: number | string | null | undefined): boolean =>
	id !== undefined && id !== null && !possibleId(id)

/** The profiles the public reads: the published ones (U53). */
export const PUBLISHED_PROFILES: Where = { status: { equals: PUBLISHED_STATUS } }

/**
 * Reading profiles (ticket 021). The role `admin` reads every profile; a makeup artist reads her
 * own profile, whatever its status, and the published ones; anyone else, anonymous or `editor`,
 * the published ones only (U53, I01). A session never shows less than the public sees. An
 * identifier no profile can have is refused to all (`impossibleId`).
 *
 * What each of them reads of a profile is then decided field by field (`fieldAdminOrOwner`).
 */
export const publishedProfileOrOwner: Access = ({ req: { user }, id }) => {
	if (impossibleId(id)) return false
	if (isAdmin(user)) return true
	if (user && isArtist(user)) return { or: [{ pro: { equals: user.id } }, PUBLISHED_PROFILES] }
	return PUBLISHED_PROFILES
}

/** The identifier of the account a relationship field holds: the identifier itself, or the account once populated. */
const idFromValue = (valeur: unknown): string | undefined => {
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
export const fieldAdminOrOwner =
	(champ: 'pro' | 'owner'): FieldAccess =>
	({ req: { user }, doc }) => {
		if (isAdmin(user)) return true
		if (!user || !isArtist(user)) return false
		const owner = idFromValue((doc as Record<string, unknown> | undefined)?.[champ])
		return owner !== undefined && owner === String(user.id)
	}

/** The fields of a profile only its owner and `admin` read: the account, what the import wrote, what an admin decided. */
export const profileFieldAdminOrOwner: FieldAccess = fieldAdminOrOwner('pro')

/** A condition no document meets: a read limited by it finds nothing, and a document read by its identifier is not found. */
export const NO_DOCUMENT: Where = { id: { exists: false } }

/**
 * The media of the newsroom: those that belong to nobody, the photos of the articles (ticket 046).
 * A photo of a makeup artist always has its owner (ticket 043), and a profile only takes photos of
 * its own account: the two never mix.
 */
export const EDITORIAL_MEDIA: Where = { owner: { exists: false } }

/** True when this media is the main photo, or a photo of the gallery, of a published profile. */
export async function attachedToPublishedProfile(req: PayloadRequest, media: number | string): Promise<boolean> {
	const { totalDocs } = await req.payload.count({
		collection: 'profiles',
		overrideAccess: true,
		req,
		where: {
			and: [PUBLISHED_PROFILES, { or: [{ mainPicture: { equals: media } }, { gallery: { in: [media] } }] }],
		},
	})
	return totalDocs > 0
}

/**
 * True when this media is in the gallery of a published article (ticket 046). The article read is
 * its published version: a photo a draft adds stays out of reach until the article is published.
 */
export async function attachedToPublishedArticle(req: PayloadRequest, media: number | string): Promise<boolean> {
	const { totalDocs } = await req.payload.count({
		collection: 'articles',
		overrideAccess: true,
		req,
		where: { and: [ONLY_PUBLISHED, { gallery: { in: [media] } }] },
	})
	return totalDocs > 0
}

/**
 * Reading media (tickets 043 and 046, U56, I04).
 *
 * - The role `admin` reads every media.
 * - A list is closed to the public: a makeup artist lists her own media, the role `editor` the
 *   media of the newsroom (`EDITORIAL_MEDIA`), anyone else is refused.
 * - One media, read by its identifier, is read by anyone when it belongs to a published profile or
 *   when it is a photo of the newsroom in the gallery of a published article; a makeup artist also
 *   reads her own, `editor` those of the newsroom. Any other media is not found, as if it did not
 *   exist: the photo of a draft too.
 * - A published article never opens the photo of a makeup artist: its gallery takes only photos of
 *   the newsroom (src/lib/articles.ts), and should one get an owner afterwards, the article no
 *   longer opens it (docs/migration/SCHEMA.md, §8).
 * - An identifier no media can have is refused to all, before any query (`impossibleId`).
 *
 * Payload gives the identifier to the rule when it reads one document, never for a list: that is
 * how the two are told apart. A media populated in a profile is read as a list: for the public it
 * stays an identifier, and a public page reads the photos through src/services/public/.
 */
export const mediaRead: Access = async ({ req, id }) => {
	if (impossibleId(id)) return false
	const { user } = req
	if (isAdmin(user)) return true
	const owned = mediaOf(user)
	if (id === undefined || id === null) return owned ?? false
	if (await attachedToPublishedProfile(req, id)) return true
	if (!(await attachedToPublishedArticle(req, id))) return owned ?? NO_DOCUMENT
	// A published article opens the photos of the newsroom only, never the photo of a makeup artist.
	return owned && owned !== EDITORIAL_MEDIA ? { or: [owned, EDITORIAL_MEDIA] } : EDITORIAL_MEDIA
}

/**
 * The media an account reaches without them being public: hers for a makeup artist, those of the
 * newsroom for `editor`; none for anyone else.
 */
const mediaOf = (user: User): Where | undefined => {
	if (user && isArtist(user)) return { owner: { equals: user.id } }
	if (isEditor(user)) return EDITORIAL_MEDIA
	return undefined
}

/**
 * Sending a photo: a makeup artist, the newsroom (`admin` and `editor`, for the articles). The
 * server makes a makeup artist the owner; the photo of the newsroom belongs to nobody.
 */
export const adminEditorOrArtist: Access = ({ req: { user } }) => isAdminOrEditor(user) || isArtist(user)

/**
 * Changing or deleting a media: the role `admin`; the makeup artist who owns it; `editor` for a
 * media of the newsroom, never the photo of a makeup artist. Never by an impossible identifier.
 */
export const adminOrMediaOwner: Access = ({ req: { user }, id }) => {
	if (impossibleId(id)) return false
	if (isAdmin(user)) return true
	return mediaOf(user) ?? false
}

/** The fields of a media only its owner and `admin` read: the account that owns it. */
export const mediaFieldAdminOrOwner: FieldAccess = fieldAdminOrOwner('owner')

/**
 * The newsroom: an account of the admin panel with the role `admin` or `editor`. It writes the
 * editorial collections, talents (ticket 022) and articles (ticket 046).
 */
export const isAdminOrEditor = (user: User): boolean => isAdmin(user) || isEditor(user)

/**
 * Only the newsroom, for a whole collection: creating, changing, publishing, deleting, reading the
 * versions. Never by an impossible identifier.
 */
export const adminOrEditor: Access = ({ req: { user }, id }) => !impossibleId(id) && isAdminOrEditor(user)

/** Only the newsroom, for one field: anyone else gets the document without it. */
export const fieldAdminOrEditor: FieldAccess = ({ req: { user } }) => isAdminOrEditor(user)

/** The documents of an editorial collection that the public may read: the published ones. */
export const ONLY_PUBLISHED: Where = { _status: { equals: 'published' } }

/**
 * Reading an editorial collection (drafts on): the newsroom reads every document, drafts
 * included; everyone else, a makeup artist as an anonymous visitor, the published ones only. A
 * draft is out of reach for them, even through `?draft=true`: Payload adds the same condition to
 * the versions it would show instead. An identifier no document can have is refused to all.
 */
export const adminEditorOrPublished: Access = ({ req: { user }, id }) =>
	!impossibleId(id) && (isAdminOrEditor(user) || ONLY_PUBLISHED)
