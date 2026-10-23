import { randomUUID } from 'node:crypto'
import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type {
	CollectionAfterChangeHook,
	CollectionBeforeChangeHook,
	CollectionBeforeOperationHook,
	CollectionBeforeValidateHook,
	CollectionConfig,
	PayloadRequest,
	RequiredDataFromCollectionSlug,
	Validate,
} from 'payload'
import { APIError, ValidationError } from 'payload'
import { SPECIALTY_BULLETS, SPECIALTY_MAX, SPECIALTY_OTHER_MAX, specialtyPatch } from '@/lib/specialty'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	adminOnly,
	adminOrOwner,
	fieldAdminOnly,
	hiddenExceptAdmin,
	isAdmin,
	neverAllowed,
	profileFieldAdminOrOwner,
	publishedProfileOrOwner,
} from '../lib/access'
import { GALLERY_MAX } from '../lib/media'
import { chooseCity } from '../lib/profile/choose-city-route'
import {
	CONSENT_SOURCES,
	consentAfter,
	emptyGroupIfNull,
	SOURCE_LABELS,
	validateContactEmail,
	validateNetworkLink,
	validatePhone,
} from '../lib/profile/contact-details'
import {
	HOLD_ACTIONS,
	type ModerationAction,
	moderationActionOf,
	REASON_MESSAGE,
	validReason,
} from '../lib/profile/moderation'
import { initialNamesOf } from '../lib/profile/initial-names'
import { ownerPhotos, validateGallery, validateMainPhoto } from '../lib/profile/photos'
import { validateSiret } from '../lib/profile/siret'
import {
	CHOICE_LABELS,
	INITIAL_CHOICE,
	INITIAL_STATUS,
	PROFILE_STATUSES,
	STATUS_CHOICES,
	STATUS_LABELS,
} from '../lib/profile/status'
import { ZONE_KINDS, ZONE_REVIEW_REASONS } from '../lib/profile/zone'
import { fallbackSlug, firstFreeSlug, slugify } from '../lib/slug'
import { LIST_FIELDS, rowIdentitiesBeforeWrite } from './profile-lists'
import { STATE_FIELDS, stateBeforeWrite } from './profiles/state'
import { clearZoneReview, wholeZone, zoneFields } from './profiles/zone'
import { refresh } from './revalidate'

/** The refresh of the page of a profile, the search and the sitemap (ticket 047). */
const REFRESH = refresh('profiles')

/**
 * What a creation of an account hands to Payload (`context`) when the account must stay without a
 * profile: the import, for the accounts that have none on the old site (ticket 025), and a test.
 */
export const NO_PROFILE_CONTEXT = { profilAutomatique: false } as const

/**
 * The slug a profile holds between its creation and the moment its identifier is known. It starts
 * with a character `slugifier` never writes, so it can never be taken for a real slug, and it never
 * leaves the transaction of the creation.
 */
const PROVISIONAL_PREFIX = '_provisoire-'

/** Which of these slugs a profile already has, read in the transaction of the request. */
const takenSlugs =
	(req: PayloadRequest) =>
	async (candidats: string[]): Promise<ReadonlySet<string>> => {
		const { docs } = await req.payload.find({
			collection: 'profiles',
			depth: 0,
			limit: candidats.length,
			overrideAccess: true,
			pagination: false,
			req,
			select: { slug: true },
			where: { slug: { in: candidats } },
		})
		return new Set(docs.map(({ slug }) => slug))
	}

/**
 * Two creations whose names give the same base wait for each other: the second reads the taken slugs
 * once the first has committed, and takes the next one. Without it, homonyms created at the same
 * moment computed the same free slug, and all but one failed on the unique index (CI of 15/10/2026).
 * A lock of PostgreSQL held until the end of the transaction of the creation, on the base alone: two
 * other names never wait for each other. Outside a transaction there is nothing to wait for.
 */
async function reserveBase(req: PayloadRequest, base: string): Promise<void> {
	const id = await req.transactionID
	// The adapter of the configuration is the PostgreSQL one; `sessions` holds the transaction of each request.
	const { sessions } = req.payload.db as unknown as Pick<PostgresAdapter, 'sessions'>
	const transaction = id === undefined || id === null ? undefined : sessions?.[id]
	await transaction?.db.execute(sql`select pg_advisory_xact_lock(hashtext(${`profils.slug:${base}`}))`)
}

/**
 * A new profile gets its slug from the name of its account, computed by the server with the rule
 * of the old site (src/lib/slug.ts): the first free of `base`, `base-2`, `base-3`… A name that
 * gives no slug (only emojis, or no name) gives `maquilleuse-<identifier of the profile>`, once
 * the identifier is known (`fallbackSlugAfterCreate`).
 *
 * The slug is computed once, at the creation: changing a name never changes it (I19), and no API
 * writes it. A slug given by the server itself (the import, with the slug of the old site) is kept.
 */
export const slugOnCreate: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
	if (operation !== 'create' || data.slug) return data
	const pro = Number(typeof data.pro === 'object' && data.pro !== null ? data.pro.id : data.pro)
	const account = Number.isInteger(pro)
		? await req.payload.findByID({
				collection: 'pros',
				depth: 0,
				disableErrors: true,
				id: pro,
				overrideAccess: true,
				req,
			})
		: null
	const base = slugify(account?.name)
	if (!base) return { ...data, slug: `${PROVISIONAL_PREFIX}${randomUUID()}` }
	await reserveBase(req, base)
	return { ...data, slug: await firstFreeSlug(base, takenSlugs(req)) }
}

/** The fallback slug, `maquilleuse-<id>`, written as soon as the profile has its identifier. */
export const fallbackSlugAfterCreate: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
	if (operation !== 'create' || !String(doc.slug).startsWith(PROVISIONAL_PREFIX)) return doc
	const slug = await firstFreeSlug(fallbackSlug(doc.id), takenSlugs(req))
	await req.payload.update({ collection: 'profiles', data: { slug }, depth: 0, id: doc.id, overrideAccess: true, req })
	return { ...doc, slug }
}

/** Ticket 1010: the shown specialty is composed from the bullets and « Autre » (src/lib/specialty.ts). */
export const composeSpecialty: CollectionBeforeChangeHook = ({ data, originalDoc }) => ({
	...data,
	...specialtyPatch(data, originalDoc),
})

/**
 * The trace of the consent to show the contact details (ticket 042): when `publicContact` is
 * switched on, the server writes the date and the source itself; switched off, both are emptied.
 * The rule is `consentAfter` (src/lib/profile/contact-details.ts).
 */
export const consentTrace: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
	const account = req.user?.collection === 'pros' || req.user?.collection === 'admins' ? req.user.collection : undefined
	return {
		...data,
		...consentAfter({ avant: originalDoc?.publicContact, donnees: data, compte: account, maintenant: new Date() }),
	}
}

/** The networks of a profile, as on the old site: a link each, public. */
const NETWORKS = [
	['youtube', 'YouTube'],
	['facebook', 'Facebook'],
	['instagram', 'Instagram'],
	['website', 'Site web'],
	['linkedin', 'LinkedIn'],
] as const

/**
 * Creating an account creates its empty profile, in the same transaction: if the profile cannot
 * be created, neither is the account. `NO_PROFILE_CONTEXT` leaves the account without one.
 */
export const profileOnAccountCreation: CollectionAfterChangeHook = async ({ context, doc, operation, req }) => {
	if (operation !== 'create' || context.profilAutomatique === false) return doc
	// The slug is not given: the collection computes it (`slugOnCreate`). The names are those the sign-up
	// (or Google) handed over, when it did (issue 1009).
	const names = initialNamesOf(context)
	const profile = { pro: doc.id, ...names } as RequiredDataFromCollectionSlug<'profiles'>
	await req.payload.create({ collection: 'profiles', data: profile, depth: 0, overrideAccess: true, req })
	return doc
}

/** The choice of status must be one of the choices; empty is the default. */
const CHOICE_MESSAGE = 'Ce statut n’existe pas : choisis automatique, brouillon, publié ou masqué.'

const isStatusChoice = (value: unknown): boolean =>
	value === undefined || value === null || (STATUS_CHOICES as readonly unknown[]).includes(value)

const validateStatusChoice: Validate = value => (isStatusChoice(value) ? true : CHOICE_MESSAGE)

/** The statuses a filter may name: the column is an enumeration of the database, which fails with a 500 on any other. */
const VALUES_BY_FIELD: Record<string, readonly string[]> = {
	status: PROFILE_STATUSES,
	chosenStatus: STATUS_CHOICES,
	// The enumerations of the zone (ticket 259) fail the same way on an unknown value.
	zoneKind: ZONE_KINDS,
	'zoneReview.reason': ZONE_REVIEW_REASONS,
}
const ZONE_FILTER_KEYS = ['zoneKind', 'zoneReview.reason']
const VALUE_OPERATORS = ['equals', 'not_equals', 'in', 'not_in', 'like', 'contains'] as const

/** Every value a `where` compares a status field with, whatever the nesting of `and` and `or`. */
export function unknownValues(where: unknown, trouvees: string[] = []): string[] {
	if (Array.isArray(where)) {
		for (const element of where) unknownValues(element, trouvees)
		return trouvees
	}
	if (typeof where !== 'object' || where === null) return trouvees
	for (const [key, candidate] of Object.entries(where)) {
		if (key === 'and' || key === 'or') unknownValues(candidate, trouvees)
		else if (key in VALUES_BY_FIELD && typeof candidate === 'object' && candidate !== null) {
			const allowed = VALUES_BY_FIELD[key] ?? []
			for (const operator of VALUE_OPERATORS) {
				const compare: unknown = (candidate as Record<string, unknown>)[operator]
				for (const v of Array.isArray(compare) ? compare : compare === undefined ? [] : [compare])
					if (typeof v !== 'string' || !allowed.includes(v)) trouvees.push(`${key} : ${String(v)}`)
			}
		}
	}
	return trouvees
}

/**
 * A filter on a status nobody holds is refused with a sentence (ticket 165), not answered by a 500
 * of the database: the admin panel builds such a filter from its address.
 */
export const refuseFilterOnUnknownStatus: CollectionBeforeOperationHook = ({ args, operation }) => {
	if (operation !== 'read' && operation !== 'count') return args
	const unknown = unknownValues((args as { where?: unknown }).where)
	if (unknown.some(value => ZONE_FILTER_KEYS.some(key => value.startsWith(`${key} :`))))
		throw new APIError('Ce filtre nomme un type de zone ou un motif de revue qui n’existe pas.', 400)
	if (unknown.length > 0)
		throw new APIError('Ce filtre nomme un statut qui n’existe pas : brouillon, publié ou masqué.', 400)
	return args
}

/**
 * An admin who sends a status that is no choice is told so (ticket 165). The check of the field
 * comes too late to see it: the hooks of `beforeChange` (the state of ticket 044) have already put
 * a valid choice back. What a makeup artist sends is ignored, as before.
 */
export const refuseUnknownChoice: CollectionBeforeValidateHook = ({ data, req }) => {
	if (req.user?.collection === 'admins' && !isStatusChoice(data?.chosenStatus))
		throw new ValidationError({
			collection: 'profiles',
			errors: [{ message: CHOICE_MESSAGE, path: 'chosenStatus' }],
			req,
		})
	return data
}

/** What `moderate` hands to `logModeration`, in the context of the request. */
const MODERATION_KEY = 'moderationEvent'
interface PendingModeration {
	readonly action: ModerationAction
	readonly reason: string
	readonly admin: number | null
}

/**
 * Issue 1005: an admin who hides, suspends or restores a profile gives a reason in the same request,
 * a new one (not the one already stored). Without it the save is refused and nothing changes. The word
 * (hide or suspend) is kept with the reason for the makeup artist; a restore empties both, and the
 * journal keeps them. A write by the server itself (the import, the demo data) has no admin and is not
 * moderation: it asks for nothing and writes no line.
 */
export const moderate: CollectionBeforeChangeHook = ({ context, data, operation, originalDoc, req }) => {
	if (operation !== 'update' || !isAdmin(req.user)) return data
	const action = moderationActionOf(originalDoc, data)
	if (action === null) return data
	const reason: unknown = data.reason
	const changed = typeof reason === 'string' && reason.trim() !== String(originalDoc?.reason ?? '').trim()
	if (!(changed && validReason(reason)))
		throw new ValidationError({
			collection: 'profiles',
			errors: [{ message: REASON_MESSAGE, path: 'reason' }],
			req,
		})
	const pending: PendingModeration = { action, reason: reason.trim(), admin: Number(req.user?.id) || null }
	context[MODERATION_KEY] = pending
	return action === 'restore'
		? { ...data, reason: null, moderationAction: null }
		: {
				...data,
				reason: pending.reason,
				moderationAction: (HOLD_ACTIONS as readonly string[]).includes(data.moderationAction)
					? data.moderationAction
					: 'hide',
			}
}

/** The line of the journal, written in the transaction of the change: both happen, or neither. */
export const logModeration: CollectionAfterChangeHook = async ({ context, doc, req }) => {
	const pending = context[MODERATION_KEY] as PendingModeration | undefined
	if (pending === undefined) return doc
	delete context[MODERATION_KEY]
	await req.payload.create({
		collection: 'moderation-events',
		data: {
			profile: doc.id,
			admin: pending.admin,
			action: pending.action,
			reason: pending.reason,
			date: new Date().toISOString(),
		},
		depth: 0,
		overrideAccess: true,
		req,
	})
	return doc
}

/** What only the role `admin` writes, and only `admin` and the owner read (ticket 021). */
const OWNER_READ_RESERVED = {
	read: profileFieldAdminOrOwner,
	create: fieldAdminOnly,
	update: fieldAdminOnly,
}

/** What only the role `admin` reads and writes, never the makeup artist herself (ticket 021). */
const INTERNAL = { read: fieldAdminOnly, create: fieldAdminOnly, update: fieldAdminOnly }

/**
 * The public identity of a makeup artist (plan 01 §6.1; docs/migration/SCHEMA.md, §5.2), tied to
 * one account and one only.
 *
 * - She reads and changes her own profile; an admin reaches every profile; anyone else, anonymous
 *   or `editor`, reads the published profiles only, and a makeup artist reads them too
 *   (ticket 021, U53, I01).
 * - What the public reads of a profile is its identity: never the account it belongs to, what the
 *   import wrote, nor what an admin decided about it, except the « Super maquilleuse » badge.
 * - Nobody creates a profile through an API but an admin: the server creates it with the account.
 * - Its photos (`mainPicture`, `gallery`: 10 at most, in order) are media of its own account:
 *   a makeup artist never attaches the photo of another one (ticket 043). A photo a save takes out
 *   of the profile, or the photos of a deleted profile, go to the bin of the storage once nothing
 *   references them, and profiles are deleted or changed one at a time, never by a `where`
 *   (src/collections/trash.ts, added through src/payload.config.ts, ticket 045).
 * - The networks are public. The contact details (`contactDetails`) are read by the owner and an
 *   admin only, never by the public through the API, even when she chose to show them
 *   (`publicContact`): a public page reads them through src/services/public/. The server traces
 *   that choice: the date and the source of the consent (ticket 042).
 * - `pro` (the account that owns it) is written by an admin only; `slug` by the server only, at
 *   the creation; `strapiId` and `legacyUsername` by the import only; the choice of the status,
 *   the reason, the verification, the SIRET, the internal note, the score and the badge by an
 *   admin only (I03, U55): what a makeup artist sends on them is ignored. The status itself is
 *   computed by the server (ticket 044).
 * - Its lists keep their order and the identifier of each row (src/collections/profile-lists.ts).
 * - Its zone is a commune with its INSEE code and postal codes, or one to five countries and a town
 *   abroad, then a radius of 0 to 200 km and « à domicile », never a postal address
 *   (src/collections/profiles/zone.ts, tickets 041 and 259). Its review (`zoneReview`) is private.
 * - At every save, the server computes and stores its completeness, whether it is active,
 *   publishable or entirely empty, and since when (src/collections/profiles/state.ts, ticket 044).
 *   Its status follows: an entirely empty profile is a draft, any other is published, unless an
 *   admin chose another status (`chosenStatus`); a hidden profile stays hidden whatever the save.
 * - A save or a deletion of a profile that is or was published refreshes its page, the search and
 *   the sitemap; the import refreshes nothing (src/collections/revalidate.ts, ticket 047).
 */
export const Profiles: CollectionConfig<'profiles'> = {
	slug: 'profiles',
	defaultSort: '-updatedAt',
	labels: { singular: 'Profil', plural: 'Profils' },
	// The list of the admin (ticket 165): where a profile stands at a glance, the last touched first. The
	// last activity of a profile is its last save (`updatedAt`): `derniereActivite` lives on the account
	// in the plan, not here (docs/migration/SCHEMA.md, §9). The filters of the panel read the stored
	// flags (`publishable`, `fullyEmpty`, `status`), so they cost no computation.
	admin: {
		useAsTitle: 'slug',
		// Ticket 308: the person first (photo and name, then her zone as the public pages write it), then the address.
		defaultColumns: [
			'listName',
			'listZone',
			'slug',
			'completeness',
			'publishable',
			'status',
			'zoneReview.reason',
			'updatedAt',
		],
		listSearchableFields: ['slug', 'firstName', 'lastName', 'artistName', 'city.name'],
		hidden: hiddenExceptAdmin,
	},
	access: {
		read: publishedProfileOrOwner,
		create: adminOnly,
		update: adminOrOwner,
		delete: adminOnly,
	},
	// Ticket 308: an admin picks a commune of a zone review by a button (src/lib/profile/choose-city.ts).
	endpoints: [chooseCity],
	hooks: {
		beforeOperation: [refuseFilterOnUnknownStatus, wholeZone],
		beforeValidate: [refuseUnknownChoice],
		// The state comes last: it reads the save as the other hooks leave it (ticket 044). The refresh
		// reads the stored row, which no hook changes before the write.
		beforeChange: [
			REFRESH.avantEcriture,
			composeSpecialty,
			rowIdentitiesBeforeWrite,
			slugOnCreate,
			consentTrace,
			clearZoneReview,
			moderate,
			stateBeforeWrite,
		],
		// The refresh comes after the fallback slug: a profile created public gets its final address.
		afterChange: [fallbackSlugAfterCreate, logModeration, REFRESH.apresEcriture],
		beforeDelete: [REFRESH.avantSuppression],
		afterDelete: [REFRESH.apresSuppression],
	},
	fields: [
		// Ticket 308: « Voir la page publique » and « Masquer… », at the top of the sheet. No data, no column.
		{
			name: 'profileActions',
			type: 'ui',
			admin: { components: { Field: '/components/admin/ProfileActions#ProfileActions' } },
		},
		// Ticket 308: the two first columns of the list. Virtual: they hold nothing, they read the row.
		{
			name: 'listName',
			label: 'Profil',
			type: 'ui',
			admin: { components: { Cell: '/components/admin/ProfileName#ProfileName' }, disableListColumn: false },
		},
		{
			name: 'listZone',
			label: 'Zone',
			type: 'ui',
			admin: { components: { Cell: '/components/admin/ProfileZone#ProfileZone' }, disableListColumn: false },
		},
		{
			name: 'pro',
			label: 'Compte',
			type: 'relationship',
			relationTo: 'pros',
			required: true,
			unique: true,
			access: { read: profileFieldAdminOrOwner, create: fieldAdminOnly, update: fieldAdminOnly },
		},
		{
			name: 'slug',
			label: 'Adresse du profil',
			type: 'text',
			required: true,
			unique: true,
			access: { create: neverAllowed, update: neverAllowed },
			admin: { readOnly: true, description: 'Calculée à la création du profil, elle ne change plus : /profil/<slug>.' },
		},
		{ name: 'firstName', label: 'Prénom', type: 'text', maxLength: 70 },
		{ name: 'lastName', label: 'Nom', type: 'text', maxLength: 70 },
		{ name: 'artistName', label: 'Nom d’artiste', type: 'text', maxLength: 70 },
		// Ticket 1010: the specialty is chosen from bullets, with « Autre » for a free text. `specialty` stays the
		// text shown and searched; the hook `composeSpecialty` writes it from the two fields below.
		{
			name: 'specialty',
			label: 'Spécialité (texte affiché)',
			type: 'text',
			maxLength: SPECIALTY_MAX,
			admin: {
				description: 'Composé à partir des puces et du texte « Autre » ; un texte saisi ici est rangé dans « Autre ».',
			},
		},
		{
			name: 'specialtyBullets',
			label: 'Spécialité : puces',
			type: 'select',
			hasMany: true,
			options: SPECIALTY_BULLETS.map(({ label, value }) => ({ label, value })),
		},
		{ name: 'specialtyOther', label: 'Spécialité : Autre', type: 'text', maxLength: SPECIALTY_OTHER_MAX },
		// Its commune, its radius and « à domicile », public with the profile (ticket 041).
		...zoneFields,
		{ name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 },
		{ name: 'available', label: 'Disponible', type: 'checkbox', defaultValue: true },
		// Its photos, media of its own account (ticket 043).
		{
			name: 'mainPicture',
			label: 'Photo principale',
			type: 'upload',
			relationTo: 'media',
			filterOptions: ownerPhotos,
			validate: validateMainPhoto,
		},
		{
			name: 'gallery',
			label: 'Galerie',
			type: 'upload',
			relationTo: 'media',
			hasMany: true,
			maxRows: GALLERY_MAX,
			filterOptions: ownerPhotos,
			validate: validateGallery,
			admin: { description: 'Dans l’ordre d’affichage, 10 photos au plus.' },
		},
		// The networks are public; the contact details are not (ticket 042).
		{
			name: 'networks',
			label: 'Réseaux',
			type: 'group',
			// `null` empties the group (Payload stops with a 500 on it otherwise, ticket 224).
			hooks: {
				beforeValidate: [
					({ value }) =>
						emptyGroupIfNull(
							value,
							NETWORKS.map(([name]) => name)
						),
				],
			},
			fields: NETWORKS.map(([name, label]) => ({ name, label, type: 'text' as const, validate: validateNetworkLink })),
		},
		{
			// Never read by the public through the API, whatever `publicContact` says: a public page
			// shows them through src/services/public/, and only when `publicContact` is true.
			name: 'contactDetails',
			label: 'Coordonnées',
			type: 'group',
			access: { read: profileFieldAdminOrOwner },
			hooks: { beforeValidate: [({ value }) => emptyGroupIfNull(value, ['phone', 'email'])] },
			admin: {
				description: 'Fermées au public. La page du profil ne les montre que si « Coordonnées publiques » est cochée.',
			},
			fields: [
				{ name: 'phone', label: 'Téléphone', type: 'text', validate: validatePhone },
				{ name: 'email', label: 'Email de contact', type: 'email', validate: validateContactEmail },
			],
		},
		{
			name: 'publicContact',
			label: 'Coordonnées publiques',
			type: 'checkbox',
			defaultValue: false,
			access: { read: profileFieldAdminOrOwner },
			admin: { description: 'Choisi par la maquilleuse : ses coordonnées s’affichent sur la page de son profil.' },
		},
		{
			name: 'consentedAt',
			label: 'Consentement donné le',
			type: 'date',
			access: { read: profileFieldAdminOrOwner, create: neverAllowed, update: neverAllowed },
			admin: {
				readOnly: true,
				date: { pickerAppearance: 'dayAndTime' },
				description: 'Posée par le serveur quand les coordonnées deviennent publiques.',
			},
		},
		{
			name: 'consentSource',
			label: 'Source du consentement',
			type: 'select',
			options: CONSENT_SOURCES.map(source => ({ label: SOURCE_LABELS[source], value: source })),
			access: { read: profileFieldAdminOrOwner, create: neverAllowed, update: neverAllowed },
			admin: { readOnly: true, description: 'Posée par le serveur, avec la date.' },
		},
		// Offers with their options, skills, languages, courses, experiences (ticket 040).
		...LIST_FIELDS,
		{
			name: 'legacyUsername',
			label: 'Nom d’utilisateur sur l’ancien site',
			type: 'text',
			access: { read: profileFieldAdminOrOwner, create: neverAllowed, update: neverAllowed },
			admin: { readOnly: true, description: 'Sert à rediriger l’ancienne adresse du profil vers la nouvelle.' },
		},
		{
			name: 'strapiId',
			label: 'Identifiant sur l’ancien site',
			type: 'number',
			unique: true,
			access: { read: profileFieldAdminOrOwner, create: neverAllowed, update: neverAllowed },
			admin: { readOnly: true },
		},
		// Computed by the server at every save, from the choice of an admin and the rule (ticket 044).
		{
			name: 'status',
			label: 'Statut',
			type: 'select',
			// Not `required`, so that a creation needs no status in its data: it gets the default, which
			// the server replaces. An empty status is not `publie`.
			defaultValue: INITIAL_STATUS,
			// Every public read filters on it.
			index: true,
			options: PROFILE_STATUSES.map(statut => ({ label: STATUS_LABELS[statut], value: statut })),
			// No API writes it: what a request sends, an admin's included, is ignored (src/lib/profile/state.ts).
			access: { read: profileFieldAdminOrOwner, create: neverAllowed, update: neverAllowed },
			admin: {
				readOnly: true,
				position: 'sidebar',
				description:
					'Posé par le serveur à chaque enregistrement, selon le statut choisi en dessous. Seuls les profils publiés sont lus par le public.',
			},
		},
		// Reserved to the role `admin` (tickets 021 and 044).
		{
			name: 'chosenStatus',
			label: 'Statut choisi par l’admin',
			type: 'select',
			defaultValue: INITIAL_CHOICE,
			options: STATUS_CHOICES.map(choix => ({ label: CHOICE_LABELS[choix], value: choix })),
			// A value that is no choice is refused with a sentence, never ignored (ticket 165).
			validate: validateStatusChoice,
			access: OWNER_READ_RESERVED,
			admin: {
				position: 'sidebar',
				description:
					'Automatique : le serveur pose le statut, brouillon pour un profil entièrement vide, publié sinon. Un autre choix est gardé, quoi que la maquilleuse enregistre.',
			},
		},
		{
			name: 'reason',
			label: 'Motif',
			type: 'textarea',
			access: OWNER_READ_RESERVED,
			admin: {
				position: 'sidebar',
				description:
					'Obligatoire pour masquer, suspendre ou rétablir (10 à 500 caractères, un motif nouveau à chaque action). Pourquoi le profil est masqué : la maquilleuse le lit. N’y mets aucun nom ni coordonnée.',
			},
		},
		{
			name: 'moderationAction',
			label: 'Masqué ou suspendu',
			type: 'select',
			options: HOLD_ACTIONS.map(action => ({ label: action === 'hide' ? 'Masqué' : 'Suspendu', value: action })),
			access: OWNER_READ_RESERVED,
			admin: {
				position: 'sidebar',
				description:
					'Le mot que la maquilleuse lit. Les deux retirent le profil du public ; rien d’autre n’en découle.',
			},
		},
		{
			name: 'verified',
			label: 'Vérifiée',
			type: 'checkbox',
			defaultValue: false,
			access: OWNER_READ_RESERVED,
			admin: { position: 'sidebar' },
		},
		{
			name: 'verifiedAt',
			label: 'Vérifiée le',
			type: 'date',
			access: OWNER_READ_RESERVED,
			admin: { position: 'sidebar' },
		},
		{
			name: 'siret',
			label: 'SIRET',
			type: 'text',
			validate: validateSiret,
			access: OWNER_READ_RESERVED,
			admin: { position: 'sidebar', description: '14 chiffres, sans espace.' },
		},
		{
			name: 'internalNote',
			label: 'Note interne',
			type: 'textarea',
			access: INTERNAL,
			admin: { position: 'sidebar', description: 'Lue par les admins seulement, jamais par la maquilleuse.' },
		},
		{
			name: 'score',
			label: 'Score',
			type: 'number',
			access: INTERNAL,
			admin: {
				position: 'sidebar',
				description: 'Repris de l’ancien site. Ce n’est pas la complétude. Lu par les admins seulement.',
			},
		},
		{
			// Written by an admin only, read by everyone: the badge of the cards of the search.
			name: 'superArtist',
			label: 'Super maquilleuse',
			type: 'checkbox',
			defaultValue: false,
			access: { create: fieldAdminOnly, update: fieldAdminOnly },
			admin: { position: 'sidebar', description: 'Le badge des cartes de la recherche. Public.' },
		},
		// Computed by the server at every save (ticket 044).
		...STATE_FIELDS,
	],
}
