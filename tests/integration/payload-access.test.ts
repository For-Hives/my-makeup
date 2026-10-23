import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
	type CollectionEditorial,
	type Distribution,
	describeName,
	distribute,
	type Line,
	type MatrixCollection,
	ROLES,
	type Role,
	run,
	STREETS,
} from '../support/access-matrix'
import { emptySink } from '../support/mailpit'
import { emptyBase } from '../support/payload-test'
import { emptyStorage } from '../support/s3'

/** The owner of a document and the role `admin`: who reads the private fields of a profile or a media. */
const OWNER_AND_ADMIN: readonly Role[] = ['maquilleuse', 'admin']

/** A review of the zone as a request may send it: no API writes it (ticket 259). */
const SENT_REVIEW = {
	reason: 'sharedPostalCode',
	postalCode: '62149',
	candidates: [{ inseeCode: '62200', name: 'Cambrin', department: '62' }],
} as const

/**
 * What a request may send on the state of A's profile, which only has a photo (ticket 044): each
 * value differs from what the server computes, so that a write that took would show.
 */
const SENT_STATE = [
	['completeness', 13],
	['active', true],
	['publishable', true],
	['fullyEmpty', true],
	['activeSince', '2020-01-01T00:00:00.000Z'],
	['publishableSince', '2020-01-01T00:00:00.000Z'],
	['fullyEmptySince', '2020-01-01T00:00:00.000Z'],
] as const

/**
 * The field-level reading of A's document, which every role reads (her profile is published, her
 * photo is its main photo): for each field, the roles that read it; every other role reads the
 * document without it. One line per field and per role.
 */
const fieldsReads = (collection: MatrixCollection, lecteurs: [string, readonly Role[]][]): Line[] =>
	lecteurs.flatMap(([champ, quiLit]) =>
		ROLES.map(
			(role): Line => ({
				role,
				collection,
				operation: 'lire',
				document: 'maquilleuse',
				champ,
				attendu: quiLit.includes(role) ? 'visible' : 'absent',
			})
		)
	)

/**
 * The rules of the newsroom on one editorial collection (src/collections/editor.ts): the
 * newsroom (`editor` and `admin`) creates, changes, publishes, unpublishes and deletes, and reads
 * drafts too; everyone else, a makeup artist as an anonymous visitor, reads the published documents
 * only and writes nothing (U59). Nobody writes `strapiId`. Talents (ticket 022), articles (046).
 */
const editorLines = (collection: CollectionEditorial): Line[] => [
	...(['anonyme', 'maquilleuse', 'autreMaquilleuse', 'sansProfil'] as const).flatMap((role): Line[] => [
		{ role, collection, operation: 'lister', attendu: 'publies' },
		{ role, collection, operation: 'lire', document: 'publie', attendu: 'autorise' },
		{ role, collection, operation: 'lire', document: 'brouillon', attendu: 'refuse' },
		{ role, collection, operation: 'creer', attendu: 'refuse' },
		{ role, collection, operation: 'modifier', document: 'publie', attendu: 'refuse' },
		{
			role,
			collection,
			operation: 'modifier',
			document: 'brouillon',
			champ: '_status',
			valeur: 'published',
			attendu: 'refuse',
		},
		{ role, collection, operation: 'supprimer', document: 'publie', attendu: 'refuse' },
		{ role, collection, operation: 'supprimer', document: 'brouillon', attendu: 'refuse' },
	]),
	...(['redaction', 'admin'] as const).flatMap((role): Line[] => [
		{ role, collection, operation: 'lister', attendu: 'tous' },
		{ role, collection, operation: 'lire', document: 'publie', attendu: 'autorise' },
		{ role, collection, operation: 'lire', document: 'brouillon', attendu: 'autorise' },
		// Created published: created and published in one request.
		{ role, collection, operation: 'creer', attendu: 'autorise' },
		{ role, collection, operation: 'modifier', document: 'publie', attendu: 'autorise' },
		{ role, collection, operation: 'modifier', document: 'brouillon', attendu: 'autorise' },
		{
			role,
			collection,
			operation: 'modifier',
			document: 'brouillon',
			champ: '_status',
			valeur: 'published',
			attendu: 'autorise',
		},
		{
			role,
			collection,
			operation: 'modifier',
			document: 'publie',
			champ: '_status',
			valeur: 'draft',
			attendu: 'autorise',
		},
		{
			role,
			collection,
			operation: 'modifier',
			document: 'publie',
			champ: 'slug',
			valeur: 'une-autre-adresse',
			attendu: 'autorise',
		},
		{
			role,
			collection,
			operation: 'modifier',
			document: 'publie',
			champ: 'strapiId',
			valeur: 999,
			attendu: 'ignore',
		},
		{ role, collection, operation: 'supprimer', document: 'publie', attendu: 'autorise' },
	]),
]

/**
 * The access matrix (plan 01 §5 P3; docs/tests/banc.md, « La matrice d'accès »).
 *
 * Every access rule of a collection has its lines here: who acts, on what, and what must happen.
 * Each line is played twice, through REST and through the Local API with the rules active, and
 * gives one test per way in. A rule added without its lines is a rule nobody checks.
 */
const MATRIX: Line[] = [
	// admins (ticket 018): the role `admin` does everything; `editor` reaches its own account
	// only, and never its role; nobody else reaches any account.
	{ role: 'anonyme', collection: 'admins', operation: 'lister', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'lire', document: 'admin', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'creer', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'modifier', document: 'admin', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'supprimer', document: 'admin', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'lister', attendu: 'soi' },
	{ role: 'redaction', collection: 'admins', operation: 'lire', document: 'redaction', attendu: 'autorise' },
	{ role: 'redaction', collection: 'admins', operation: 'lire', document: 'admin', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'creer', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'modifier', document: 'redaction', attendu: 'autorise' },
	{ role: 'redaction', collection: 'admins', operation: 'modifier', document: 'admin', attendu: 'refuse' },
	{
		role: 'redaction',
		collection: 'admins',
		operation: 'modifier',
		document: 'redaction',
		champ: 'role',
		valeur: 'admin',
		attendu: 'ignore',
	},
	{ role: 'redaction', collection: 'admins', operation: 'supprimer', document: 'redaction', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'supprimer', document: 'admin', attendu: 'refuse' },
	{ role: 'admin', collection: 'admins', operation: 'lister', attendu: 'tous' },
	{ role: 'admin', collection: 'admins', operation: 'lire', document: 'redaction', attendu: 'autorise' },
	{ role: 'admin', collection: 'admins', operation: 'creer', attendu: 'autorise' },
	{ role: 'admin', collection: 'admins', operation: 'modifier', document: 'redaction', attendu: 'autorise' },
	{
		role: 'admin',
		collection: 'admins',
		operation: 'modifier',
		document: 'redaction',
		champ: 'role',
		valeur: 'admin',
		attendu: 'autorise',
	},
	{ role: 'admin', collection: 'admins', operation: 'supprimer', document: 'redaction', attendu: 'autorise' },
	// A makeup artist reaches no account of the admin panel (ticket 019).
	{ role: 'maquilleuse', collection: 'admins', operation: 'lister', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'lire', document: 'admin', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'creer', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'modifier', document: 'admin', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'supprimer', document: 'admin', attendu: 'refuse' },

	// pros (ticket 019): a makeup artist reads and changes her own account only (U57, I06), never
	// its reserved fields; `admin` reaches every account; nobody else reaches any.
	{ role: 'anonyme', collection: 'pros', operation: 'lister', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'creer', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'lister', attendu: 'soi' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'creer', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'modifier', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'supprimer', document: 'autreMaquilleuse', attendu: 'refuse' },
	...(
		[
			['blocked', true],
			['_verified', false],
			['legacyProvider', 'facebook'],
			['strapiId', 999],
		] as const
	).map(
		([champ, valeur]): Line => ({
			role: 'maquilleuse',
			collection: 'pros',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu: 'ignore',
		})
	),
	{ role: 'autreMaquilleuse', collection: 'pros', operation: 'lister', attendu: 'soi' },
	{ role: 'autreMaquilleuse', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'autreMaquilleuse', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'lister', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'creer', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'admin', collection: 'pros', operation: 'lister', attendu: 'tous' },
	{ role: 'admin', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'pros', operation: 'creer', attendu: 'autorise' },
	{ role: 'admin', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'autorise' },
	...(
		[
			['blocked', true, 'autorise'],
			['_verified', false, 'autorise'],
			['legacyProvider', 'facebook', 'ignore'],
			['strapiId', 999, 'ignore'],
		] as const
	).map(
		([champ, valeur, attendu]): Line => ({
			role: 'admin',
			collection: 'pros',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu,
		})
	),
	{ role: 'sansProfil', collection: 'pros', operation: 'lister', attendu: 'soi' },

	// profils (tickets 020 and 021): a makeup artist changes her own profile only (U54, I02), never
	// its account, its slug, what the import wrote or what an admin decides (I03, U55); she reads
	// her own profile and the published ones; anyone else reads the published profiles only (U53,
	// I01); an account without a profile gets the published ones and a refusal on any write;
	// `admin` reaches every profile. In the cast, A's profile is published and B's is a draft.
	{ role: 'anonyme', collection: 'profiles', operation: 'lister', attendu: 'publies' },
	{ role: 'anonyme', collection: 'profiles', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'anonyme', collection: 'profiles', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'profiles', operation: 'creer', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'profiles', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'profiles', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'profiles', operation: 'lister', attendu: 'soi' },
	{ role: 'maquilleuse', collection: 'profiles', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'profiles', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'profiles', operation: 'creer', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'profiles', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{
		role: 'maquilleuse',
		collection: 'profiles',
		operation: 'modifier',
		document: 'autreMaquilleuse',
		attendu: 'refuse',
	},
	{ role: 'maquilleuse', collection: 'profiles', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{
		role: 'maquilleuse',
		collection: 'profiles',
		operation: 'supprimer',
		document: 'autreMaquilleuse',
		attendu: 'refuse',
	},
	...(
		[
			['slug', 'une-autre-adresse'],
			['strapiId', 999],
			['legacyUsername', 'Ancien Pseudo'],
			['pro', { compteDe: 'sansProfil' }],
			// Reserved to the role `admin` (ticket 021, I03, U55).
			['status', 'hidden'],
			['reason', 'Motif envoyé par la maquilleuse'],
			['moderationAction', 'suspend'],
			['verified', true],
			['verifiedAt', '2026-10-14T00:00:00.000Z'],
			['internalNote', 'Note envoyée par la maquilleuse'],
			['score', 99],
			['superArtist', true],
			// Traced by the server only (ticket 042).
			['consentedAt', '2020-01-01T00:00:00.000Z'],
			['consentSource', 'import'],
			// Computed by the server at every save (ticket 044); its choice, by an admin only.
			['chosenStatus', 'hidden'],
			// Written by the import alone (ticket 259).
			['zoneReview', SENT_REVIEW],
			...SENT_STATE,
		] as const
	).map(
		([champ, valeur]): Line => ({
			role: 'maquilleuse',
			collection: 'profiles',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu: 'ignore',
		})
	),
	// Her contact details, and her choice to show them, are hers to write (ticket 042); so is her zone (ticket 259).
	...(
		[
			['contactDetails', { phone: '06 39 98 11 11', email: 'contact-a@example.test' }],
			['publicContact', true],
			['countries', ['BE', 'IT']],
			// Her SIRET, optional (issue 1004): hers to write, as an admin's.
			['siret', '12345678901237'],
		] as const
	).map(
		([champ, valeur]): Line => ({
			role: 'maquilleuse',
			collection: 'profiles',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu: 'autorise',
		})
	),
	...(['autreMaquilleuse', 'sansProfil', 'redaction', 'anonyme'] as const).map(
		(role): Line => ({
			role,
			collection: 'profiles',
			operation: 'modifier',
			document: 'maquilleuse',
			champ: 'siret',
			valeur: '12345678901237',
			attendu: 'refuse',
		})
	),
	{
		role: 'autreMaquilleuse',
		collection: 'profiles',
		operation: 'modifier',
		document: 'maquilleuse',
		champ: 'contactDetails',
		valeur: { phone: '06 39 98 22 22', email: 'contact-b@example.test' },
		attendu: 'refuse',
	},
	{ role: 'autreMaquilleuse', collection: 'profiles', operation: 'lister', attendu: 'soiEtPublies' },
	{ role: 'autreMaquilleuse', collection: 'profiles', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{
		role: 'autreMaquilleuse',
		collection: 'profiles',
		operation: 'modifier',
		document: 'maquilleuse',
		attendu: 'refuse',
	},
	{
		role: 'autreMaquilleuse',
		collection: 'profiles',
		operation: 'supprimer',
		document: 'maquilleuse',
		attendu: 'refuse',
	},
	{ role: 'sansProfil', collection: 'profiles', operation: 'lister', attendu: 'publies' },
	{ role: 'sansProfil', collection: 'profiles', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'sansProfil', collection: 'profiles', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'profiles', operation: 'creer', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'profiles', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'profiles', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profiles', operation: 'lister', attendu: 'publies' },
	{ role: 'redaction', collection: 'profiles', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'redaction', collection: 'profiles', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profiles', operation: 'creer', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profiles', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{
		role: 'redaction',
		collection: 'profiles',
		operation: 'modifier',
		document: 'maquilleuse',
		champ: 'contactDetails',
		valeur: { phone: '06 39 98 33 33', email: 'contact-redaction@example.test' },
		attendu: 'refuse',
	},
	{ role: 'redaction', collection: 'profiles', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	// What each role reads of A's published profile, field by field (tickets 021, 042 and 043).
	...fieldsReads('profiles', [
		// Public: her networks (042), her photos (043), the badge of the search (021).
		['networks', ROLES],
		['mainPicture', ROLES],
		['gallery', ROLES],
		['superArtist', ROLES],
		// Her account, what the import wrote, what an admin decided (021, I01).
		['pro', OWNER_AND_ADMIN],
		['strapiId', OWNER_AND_ADMIN],
		['legacyUsername', OWNER_AND_ADMIN],
		['status', OWNER_AND_ADMIN],
		['reason', OWNER_AND_ADMIN],
		['moderationAction', OWNER_AND_ADMIN],
		['verified', OWNER_AND_ADMIN],
		['verifiedAt', OWNER_AND_ADMIN],
		['siret', OWNER_AND_ADMIN],
		// For the admin panel only (021).
		['internalNote', ['admin']],
		['score', ['admin']],
		// Her contact details, her choice to show them and its trace (042, U59, I07).
		['contactDetails', OWNER_AND_ADMIN],
		['publicContact', OWNER_AND_ADMIN],
		['consentedAt', OWNER_AND_ADMIN],
		['consentSource', OWNER_AND_ADMIN],
		// Its zone is public with the profile; its review only for her and the admin (259).
		['zoneKind', ROLES],
		['countries', ROLES],
		['town', ROLES],
		['city', ROLES],
		['zoneReview', OWNER_AND_ADMIN],
		// Its state, public; since when, and the status an admin chose, for her and the admin (044).
		['completeness', ROLES],
		['active', ROLES],
		['publishable', ROLES],
		['fullyEmpty', ROLES],
		['activeSince', OWNER_AND_ADMIN],
		['publishableSince', OWNER_AND_ADMIN],
		['fullyEmptySince', OWNER_AND_ADMIN],
		['chosenStatus', OWNER_AND_ADMIN],
	]),
	{ role: 'admin', collection: 'profiles', operation: 'lister', attendu: 'tous' },
	{ role: 'admin', collection: 'profiles', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'profiles', operation: 'creer', attendu: 'autorise' },
	{ role: 'admin', collection: 'profiles', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'profiles', operation: 'supprimer', document: 'maquilleuse', attendu: 'autorise' },
	...(
		[
			['slug', 'une-autre-adresse', 'ignore'],
			['strapiId', 999, 'ignore'],
			['legacyUsername', 'Ancien Pseudo', 'ignore'],
			['pro', { compteDe: 'sansProfil' }, 'autorise'],
			// The admin chooses the status; the server computes it, from her choice (ticket 044).
			['status', 'hidden', 'ignore'],
			// Hiding needs a reason in the same request (issue 1005); without it the save is refused
			// (tests/integration/profile-moderation.test.ts).
			['chosenStatus', 'hidden', 'autorise', { reason: 'Photos sans rapport avec le maquillage.' }],
			['moderationAction', 'suspend', 'autorise'],
			['reason', 'Photos sans rapport avec le maquillage', 'autorise'],
			['verified', true, 'autorise'],
			['siret', '12345678901237', 'autorise'],
			['internalNote', 'Relancée par téléphone', 'autorise'],
			['score', 4.5, 'autorise'],
			['superArtist', true, 'autorise'],
			['contactDetails', { phone: '06 39 98 44 44', email: 'contact-admin@example.test' }, 'autorise'],
			['consentedAt', '2020-01-01T00:00:00.000Z', 'ignore'],
			['consentSource', 'import', 'ignore'],
			// No API writes the review of the zone, an admin's included (ticket 259).
			['zoneReview', SENT_REVIEW, 'ignore'],
			// The state stays the server's (ticket 044).
			...SENT_STATE.map(([champ, valeur]) => [champ, valeur, 'ignore'] as const),
		] as const
	).map(
		([champ, valeur, attendu, avec]: readonly [string, unknown, Line['attendu'], Record<string, unknown>?]): Line => ({
			role: 'admin',
			collection: 'profiles',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			...(avec ? { avec } : {}),
			attendu,
		})
	),

	// media (ticket 043): the public never lists the media, and reads one only when it belongs to a
	// published profile (U56, I04); a makeup artist sends photos, lists and reads her own, changes
	// and deletes her own only, never their owner nor where their object is; `admin` reaches every
	// media. In the cast, A's photo is the main photo of her published profile, B's of her draft.
	{ role: 'anonyme', collection: 'media', operation: 'lister', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'media', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'anonyme', collection: 'media', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'media', operation: 'creer', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'media', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'media', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'media', operation: 'lister', attendu: 'soi' },
	{ role: 'maquilleuse', collection: 'media', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'media', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'media', operation: 'creer', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'media', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'media', operation: 'modifier', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'media', operation: 'supprimer', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'media', operation: 'supprimer', document: 'autreMaquilleuse', attendu: 'refuse' },
	...(
		[
			['owner', { compteDe: 'autreMaquilleuse' }],
			['prefix', 'un-autre-dossier'],
			['filename', 'un-autre-nom.png'],
			['strapiId', 999],
			['objectMissing', true],
		] as const
	).map(
		([champ, valeur]): Line => ({
			role: 'maquilleuse',
			collection: 'media',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu: 'ignore',
		})
	),
	{ role: 'autreMaquilleuse', collection: 'media', operation: 'lister', attendu: 'soi' },
	{ role: 'autreMaquilleuse', collection: 'media', operation: 'creer', attendu: 'autorise' },
	{ role: 'autreMaquilleuse', collection: 'media', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'autreMaquilleuse', collection: 'media', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'autreMaquilleuse', collection: 'media', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'media', operation: 'lister', attendu: 'aucun' },
	{ role: 'sansProfil', collection: 'media', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'sansProfil', collection: 'media', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'media', operation: 'creer', attendu: 'autorise' },
	{ role: 'sansProfil', collection: 'media', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'media', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	// The newsroom lists, reads, sends, changes and deletes the photos of the articles, which belong
	// to nobody; a photo of a makeup artist it only reads when it is public (ticket 046).
	{ role: 'redaction', collection: 'media', operation: 'lister', attendu: 'sansProprietaire' },
	{ role: 'redaction', collection: 'media', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'redaction', collection: 'media', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'media', operation: 'lire', document: 'publie', attendu: 'autorise' },
	{ role: 'redaction', collection: 'media', operation: 'lire', document: 'brouillon', attendu: 'autorise' },
	{ role: 'redaction', collection: 'media', operation: 'creer', attendu: 'autorise' },
	{ role: 'redaction', collection: 'media', operation: 'modifier', document: 'brouillon', attendu: 'autorise' },
	{
		role: 'redaction',
		collection: 'media',
		operation: 'modifier',
		document: 'brouillon',
		champ: 'owner',
		valeur: { compteDe: 'maquilleuse' },
		attendu: 'ignore',
	},
	{ role: 'redaction', collection: 'media', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'media', operation: 'supprimer', document: 'brouillon', attendu: 'autorise' },
	{ role: 'redaction', collection: 'media', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	// The photo of a published article is read by everyone; the photo of a draft by the newsroom
	// only (ticket 046). Nobody else changes or deletes them.
	...(['anonyme', 'maquilleuse', 'autreMaquilleuse', 'sansProfil'] as const).flatMap((role): Line[] => [
		{ role, collection: 'media', operation: 'lire', document: 'publie', attendu: 'autorise' },
		{ role, collection: 'media', operation: 'lire', document: 'brouillon', attendu: 'refuse' },
		{ role, collection: 'media', operation: 'modifier', document: 'publie', attendu: 'refuse' },
		{ role, collection: 'media', operation: 'supprimer', document: 'publie', attendu: 'refuse' },
	]),
	// What each role reads of A's photo, field by field (ticket 043).
	...fieldsReads('media', [
		['url', ROLES],
		['alt', ROLES],
		['owner', OWNER_AND_ADMIN],
		['strapiId', ['admin']],
		['strapiFormats', ['admin']],
		// Ticket 275: read with the media (the pages leave a marked photo out), written by the import only.
		['objectMissing', ROLES],
	]),
	{ role: 'admin', collection: 'media', operation: 'lister', attendu: 'tous' },
	{ role: 'admin', collection: 'media', operation: 'lire', document: 'autreMaquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'media', operation: 'lire', document: 'brouillon', attendu: 'autorise' },
	{ role: 'admin', collection: 'media', operation: 'creer', attendu: 'autorise' },
	{ role: 'admin', collection: 'media', operation: 'modifier', document: 'autreMaquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'media', operation: 'supprimer', document: 'autreMaquilleuse', attendu: 'autorise' },
	...(
		[
			['owner', { compteDe: 'sansProfil' }, 'autorise'],
			['prefix', 'un-autre-dossier', 'ignore'],
			['strapiId', 999, 'ignore'],
			['objectMissing', true, 'ignore'],
		] as const
	).map(
		([champ, valeur, attendu]): Line => ({
			role: 'admin',
			collection: 'media',
			operation: 'modifier',
			document: 'autreMaquilleuse',
			champ,
			valeur,
			attendu,
		})
	),

	// The date of the last sign-in (ticket 077): her own account shows it to her and to an admin;
	// no request writes it, hers included.
	{
		role: 'maquilleuse',
		collection: 'pros',
		operation: 'lire',
		document: 'maquilleuse',
		champ: 'lastSignInAt',
		attendu: 'visible',
	},
	{
		role: 'admin',
		collection: 'pros',
		operation: 'lire',
		document: 'maquilleuse',
		champ: 'lastSignInAt',
		attendu: 'visible',
	},
	{
		role: 'maquilleuse',
		collection: 'pros',
		operation: 'modifier',
		document: 'maquilleuse',
		champ: 'lastSignInAt',
		valeur: '2020-01-01T00:00:00.000Z',
		attendu: 'ignore',
	},
	{
		role: 'admin',
		collection: 'pros',
		operation: 'modifier',
		document: 'maquilleuse',
		champ: 'lastSignInAt',
		valeur: '2020-01-01T00:00:00.000Z',
		attendu: 'ignore',
	},

	// The profile of an account (ticket 168, a join field with no stored value): the account list of the
	// admin shows whether one exists; the owner of the account does not read it, nor does she write it.
	{
		role: 'admin',
		collection: 'pros',
		operation: 'lire',
		document: 'maquilleuse',
		champ: 'profile',
		attendu: 'visible',
	},
	{
		role: 'maquilleuse',
		collection: 'pros',
		operation: 'lire',
		document: 'maquilleuse',
		champ: 'profile',
		attendu: 'absent',
	},
	{
		role: 'maquilleuse',
		collection: 'pros',
		operation: 'modifier',
		document: 'maquilleuse',
		champ: 'profile',
		valeur: [],
		attendu: 'ignore',
	},

	// The authentication journal (ticket 077): only an admin reads it, and nobody writes it through
	// an API, an admin included. The server writes it, and purges it after 90 days.
	...ROLES.flatMap((role): Line[] => {
		const collection = 'auth-events'
		const reads = role === 'admin'
		return [
			{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
			{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'creer', attendu: 'refuse' },
			{ role, collection, operation: 'modifier', attendu: 'refuse' },
			{ role, collection, operation: 'supprimer', attendu: 'refuse' },
		]
	}),

	// The daily search counts (issue 1002): only an admin reads them, and nobody writes them through an
	// API, an admin included. The server adds to them, and a daily task purges them after 400 days.
	...ROLES.flatMap((role): Line[] => {
		const collection = 'search-counts'
		const reads = role === 'admin'
		return [
			{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
			{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'creer', attendu: 'refuse' },
			{ role, collection, operation: 'modifier', attendu: 'refuse' },
			{ role, collection, operation: 'supprimer', attendu: 'refuse' },
		]
	}),

	// The moderation journal (issue 1005): only an admin reads it, and nobody writes it through an API, an
	// admin included. The server writes the line in the transaction of the moderation of a profile.
	...ROLES.flatMap((role): Line[] => {
		const collection = 'moderation-events'
		const reads = role === 'admin'
		return [
			{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
			{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'creer', attendu: 'refuse' },
			{ role, collection, operation: 'modifier', attendu: 'refuse' },
			{ role, collection, operation: 'supprimer', attendu: 'refuse' },
		]
	}),

	// The counter of the views of a profile (ticket 1001): only an admin reads it, and nobody writes it through
	// an API, an admin included. The server adds 1 and purges after 92 days. A makeup artist reads her own
	// numbers in her space, through the server.
	...ROLES.flatMap((role): Line[] => {
		const collection = 'profile-views'
		const reads = role === 'admin'
		return [
			{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
			{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'creer', attendu: 'refuse' },
			{ role, collection, operation: 'modifier', attendu: 'refuse' },
			{ role, collection, operation: 'supprimer', attendu: 'refuse' },
		]
	}),

	// The internal reports of the reminders (issue 1006): only an admin reads them, and nobody writes them through
	// an API, an admin included. The server writes the report of the day and the state of a profile.
	// The cache of the activity check (issue 1004) is closed in the same way: the SIRET is not in it, the daily task writes it.
	...(['reminder-reports', 'reminder-states', 'activity-checks'] as const).flatMap(collection =>
		ROLES.flatMap((role): Line[] => {
			const reads = role === 'admin'
			return [
				{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
				{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
				{ role, collection, operation: 'creer', attendu: 'refuse' },
				{ role, collection, operation: 'modifier', attendu: 'refuse' },
				{ role, collection, operation: 'supprimer', attendu: 'refuse' },
			]
		})
	),
	// The quote requests (issue 1003): only an admin reads them, and nobody writes them through an API, an admin
	// included. The server writes them; a makeup artist reads her own through the server, never through this
	// collection, which is closed to her whoever she is.
	...ROLES.flatMap((role): Line[] => {
		const collection = 'quote-requests'
		const reads = role === 'admin'
		return [
			{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
			{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'creer', attendu: 'refuse' },
			{ role, collection, operation: 'modifier', attendu: 'refuse' },
			{ role, collection, operation: 'supprimer', attendu: 'refuse' },
		]
	}),

	// The accounts of the old site deleted in the v3 (ticket 227): only an admin reads them, and nobody
	// writes them through an API, an admin included. The server writes the row when an account goes.
	...ROLES.flatMap((role): Line[] => {
		const collection = 'deleted-accounts'
		const reads = role === 'admin'
		return [
			{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
			{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'creer', attendu: 'refuse' },
			{ role, collection, operation: 'modifier', attendu: 'refuse' },
			{ role, collection, operation: 'supprimer', attendu: 'refuse' },
		]
	}),

	// Contact messages (tickets 158 and 163; plan 02 U58 adapted): only an admin reads them, and nobody
	// creates or deletes them through an API, an admin included. The form has no account: the server writes
	// the row. An admin changes its status (answered, spam) and nothing else: what the visitor typed and the
	// state of the mail are frozen. An anonymous visitor and a makeup artist reach nothing, and `editor`
	// does not see this collection.
	...ROLES.flatMap((role): Line[] => {
		const collection = 'contact-requests'
		const reads = role === 'admin'
		return [
			{ role, collection, operation: 'lister', attendu: reads ? 'tous' : 'refuse' },
			{ role, collection, operation: 'lire', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'lire', champ: 'message', attendu: reads ? 'visible' : 'refuse' },
			{ role, collection, operation: 'creer', attendu: 'refuse' },
			{ role, collection, operation: 'modifier', attendu: reads ? 'autorise' : 'refuse' },
			{ role, collection, operation: 'supprimer', attendu: 'refuse' },
			...(reads
				? ([
						{ role, collection, operation: 'modifier', champ: 'message', valeur: 'Texte réécrit', attendu: 'ignore' },
						{ role, collection, operation: 'modifier', champ: 'mailStatus', valeur: 'sent', attendu: 'ignore' },
						{
							role,
							collection,
							operation: 'modifier',
							champ: 'createdAt',
							valeur: '2000-01-01T00:00:00.000Z',
							attendu: 'ignore',
						},
						{
							role,
							collection,
							operation: 'modifier',
							champ: 'email',
							valeur: 'autre@example.test',
							attendu: 'ignore',
						},
					] satisfies Line[])
				: []),
		]
	}),

	// talents (ticket 022) and articles (ticket 046): the rules of the newsroom.
	...editorLines('talents'),
	...editorLines('articles'),
	// Payload's document locks (ticket 094): reserved to the accounts of the admin panel. A makeup
	// artist, a visitor and an account without a profile reach nothing; `editor` and `admin` list,
	// read, take, change and release a lock, the lock of the other admin included (a take-over).
	...(['anonyme', 'maquilleuse', 'autreMaquilleuse', 'sansProfil'] as const).flatMap((role): Line[] => [
		{ role, collection: 'payload-locked-documents', operation: 'lister', attendu: 'refuse' },
		{ role, collection: 'payload-locked-documents', operation: 'lire', document: 'admin', attendu: 'refuse' },
		// A lock in the name of an admin: the proof of the flaw, 201 before ticket 094.
		{ role, collection: 'payload-locked-documents', operation: 'creer', attendu: 'refuse' },
		{ role, collection: 'payload-locked-documents', operation: 'modifier', document: 'admin', attendu: 'refuse' },
		{ role, collection: 'payload-locked-documents', operation: 'supprimer', document: 'admin', attendu: 'refuse' },
	]),
	...(['redaction', 'admin'] as const).flatMap((role): Line[] => [
		{ role, collection: 'payload-locked-documents', operation: 'lister', attendu: 'tous' },
		{ role, collection: 'payload-locked-documents', operation: 'lire', document: 'admin', attendu: 'autorise' },
		{ role, collection: 'payload-locked-documents', operation: 'lire', document: 'redaction', attendu: 'autorise' },
		{ role, collection: 'payload-locked-documents', operation: 'creer', attendu: 'autorise' },
		{ role, collection: 'payload-locked-documents', operation: 'modifier', document: 'admin', attendu: 'autorise' },
		{ role, collection: 'payload-locked-documents', operation: 'supprimer', document: 'admin', attendu: 'autorise' },
	]),
]

let distribution: Distribution

beforeAll(async () => {
	distribution = await distribute()
})

// An account an admin creates through REST gets Payload's confirmation email: the mail catcher is
// emptied too. The photos of the cast and of the lines go to the object storage: emptied as well.
afterAll(async () => {
	await Promise.all([emptyBase(), emptySink(), emptyStorage()])
})

describe('La matrice d’accès, par l’API REST et par l’API locale avec les règles actives', () => {
	for (const line of MATRIX)
		for (const street of STREETS)
			test(describeName(line, street), async () => {
				expect(await run(line, street, distribution)).toBe(line.attendu)
			})
})
