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
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	adminOuProprietaire,
	adminSeulement,
	cacheeSaufAdmin,
	champAdminSeulement,
	champDuProfilAdminOuProprietaire,
	jamais,
	profilPublieOuProprietaire,
} from '../lib/acces'
import { GALERIE_MAX } from '../lib/medias'
import {
	consentementApres,
	groupeVideSiNul,
	LIBELLES_DES_SOURCES,
	SOURCES_DU_CONSENTEMENT,
	validerEmailDeContact,
	validerLienDeReseau,
	validerTelephone,
} from '../lib/profil/coordonnees'
import { photosDeLaProprietaire, validerGalerie, validerPhotoPrincipale } from '../lib/profil/photos'
import { validerSiret } from '../lib/profil/siret'
import {
	CHOIX_DU_STATUT,
	CHOIX_INITIAL,
	LIBELLES_DES_CHOIX,
	LIBELLES_DES_STATUTS,
	STATUT_INITIAL,
	STATUTS_DU_PROFIL,
} from '../lib/profil/statut'
import { premierSlugLibre, slugDeRepli, slugifier } from '../lib/slug'
import { CHAMPS_LISTES, identitesDesLignesAvantEcriture } from './profile-lists'
import { CHAMPS_DE_L_ETAT, etatAvantEcriture } from './profiles/etat'
import { champsDeLaZone } from './profiles/zone'
import { rafraichissement } from './revalidation'

/** The refresh of the page of a profile, the search and the sitemap (ticket 047). */
const RAFRAICHISSEMENT = rafraichissement('profiles')

/**
 * What a creation of an account hands to Payload (`context`) when the account must stay without a
 * profile: the import, for the accounts that have none on the old site (ticket 025), and a test.
 */
export const CONTEXTE_SANS_PROFIL = { profilAutomatique: false } as const

/**
 * The slug a profile holds between its creation and the moment its identifier is known. It starts
 * with a character `slugifier` never writes, so it can never be taken for a real slug, and it never
 * leaves the transaction of the creation.
 */
const PREFIXE_PROVISOIRE = '_provisoire-'

/** Which of these slugs a profile already has, read in the transaction of the request. */
const slugsPris =
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
async function reserverLaBase(req: PayloadRequest, base: string): Promise<void> {
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
 * the identifier is known (`slugDeRepliApresCreation`).
 *
 * The slug is computed once, at the creation: changing a name never changes it (I19), and no API
 * writes it. A slug given by the server itself (the import, with the slug of the old site) is kept.
 */
export const slugALaCreation: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
	if (operation !== 'create' || data.slug) return data
	const pro = Number(typeof data.pro === 'object' && data.pro !== null ? data.pro.id : data.pro)
	const compte = Number.isInteger(pro)
		? await req.payload.findByID({
				collection: 'pros',
				depth: 0,
				disableErrors: true,
				id: pro,
				overrideAccess: true,
				req,
			})
		: null
	const base = slugifier(compte?.name)
	if (!base) return { ...data, slug: `${PREFIXE_PROVISOIRE}${randomUUID()}` }
	await reserverLaBase(req, base)
	return { ...data, slug: await premierSlugLibre(base, slugsPris(req)) }
}

/** The fallback slug, `maquilleuse-<id>`, written as soon as the profile has its identifier. */
export const slugDeRepliApresCreation: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
	if (operation !== 'create' || !String(doc.slug).startsWith(PREFIXE_PROVISOIRE)) return doc
	const slug = await premierSlugLibre(slugDeRepli(doc.id), slugsPris(req))
	await req.payload.update({ collection: 'profiles', data: { slug }, depth: 0, id: doc.id, overrideAccess: true, req })
	return { ...doc, slug }
}

/**
 * The trace of the consent to show the contact details (ticket 042): when `contactPublic` is
 * switched on, the server writes the date and the source itself; switched off, both are emptied.
 * The rule is `consentementApres` (src/lib/profil/coordonnees.ts).
 */
export const consentementTrace: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
	const compte = req.user?.collection === 'pros' || req.user?.collection === 'admins' ? req.user.collection : undefined
	return {
		...data,
		...consentementApres({ avant: originalDoc?.contactPublic, donnees: data, compte, maintenant: new Date() }),
	}
}

/** The networks of a profile, as on the old site: a link each, public. */
const RESEAUX = [
	['youtube', 'YouTube'],
	['facebook', 'Facebook'],
	['instagram', 'Instagram'],
	['siteWeb', 'Site web'],
	['linkedin', 'LinkedIn'],
] as const

/**
 * Creating an account creates its empty profile, in the same transaction: if the profile cannot
 * be created, neither is the account. `CONTEXTE_SANS_PROFIL` leaves the account without one.
 */
export const profilALaCreationDuCompte: CollectionAfterChangeHook = async ({ context, doc, operation, req }) => {
	if (operation !== 'create' || context.profilAutomatique === false) return doc
	// The slug is not given: the collection computes it (`slugALaCreation`).
	const profil = { pro: doc.id } as RequiredDataFromCollectionSlug<'profiles'>
	await req.payload.create({ collection: 'profiles', data: profil, depth: 0, overrideAccess: true, req })
	return doc
}

/** The choice of status must be one of the choices; empty is the default. */
const MESSAGE_DU_CHOIX = 'Ce statut n’existe pas : choisis automatique, brouillon, publié ou masqué.'

const estUnChoixDuStatut = (value: unknown): boolean =>
	value === undefined || value === null || (CHOIX_DU_STATUT as readonly unknown[]).includes(value)

const validerLeChoixDuStatut: Validate = value => (estUnChoixDuStatut(value) ? true : MESSAGE_DU_CHOIX)

/** The statuses a filter may name: the column is an enumeration of the database, which fails with a 500 on any other. */
const VALEURS_PAR_CHAMP: Record<string, readonly string[]> = {
	statut: STATUTS_DU_PROFIL,
	statutChoisi: CHOIX_DU_STATUT,
}
const OPERATEURS_DE_VALEUR = ['equals', 'not_equals', 'in', 'not_in', 'like', 'contains'] as const

/** Every value a `where` compares a status field with, whatever the nesting of `and` and `or`. */
export function valeursInconnues(where: unknown, trouvees: string[] = []): string[] {
	if (Array.isArray(where)) {
		for (const element of where) valeursInconnues(element, trouvees)
		return trouvees
	}
	if (typeof where !== 'object' || where === null) return trouvees
	for (const [cle, valeur] of Object.entries(where)) {
		if (cle === 'and' || cle === 'or') valeursInconnues(valeur, trouvees)
		else if (cle in VALEURS_PAR_CHAMP && typeof valeur === 'object' && valeur !== null) {
			const permises = VALEURS_PAR_CHAMP[cle] ?? []
			for (const operateur of OPERATEURS_DE_VALEUR) {
				const compare: unknown = (valeur as Record<string, unknown>)[operateur]
				for (const v of Array.isArray(compare) ? compare : compare === undefined ? [] : [compare])
					if (typeof v !== 'string' || !permises.includes(v)) trouvees.push(`${cle} : ${String(v)}`)
			}
		}
	}
	return trouvees
}

/**
 * A filter on a status nobody holds is refused with a sentence (ticket 165), not answered by a 500
 * of the database: the admin panel builds such a filter from its address.
 */
export const refuserUnFiltreSurUnStatutInconnu: CollectionBeforeOperationHook = ({ args, operation }) => {
	if (operation !== 'read' && operation !== 'count') return args
	if (valeursInconnues((args as { where?: unknown }).where).length > 0)
		throw new APIError('Ce filtre nomme un statut qui n’existe pas : brouillon, publié ou masqué.', 400)
	return args
}

/**
 * An admin who sends a status that is no choice is told so (ticket 165). The check of the field
 * comes too late to see it: the hooks of `beforeChange` (the state of ticket 044) have already put
 * a valid choice back. What a makeup artist sends is ignored, as before.
 */
export const refuserUnChoixInconnu: CollectionBeforeValidateHook = ({ data, req }) => {
	if (req.user?.collection === 'admins' && !estUnChoixDuStatut(data?.statutChoisi))
		throw new ValidationError({
			collection: 'profiles',
			errors: [{ message: MESSAGE_DU_CHOIX, path: 'statutChoisi' }],
			req,
		})
	return data
}

/** What only the role `admin` writes, and only `admin` and the owner read (ticket 021). */
const RESERVE_LU_PAR_LA_PROPRIETAIRE = {
	read: champDuProfilAdminOuProprietaire,
	create: champAdminSeulement,
	update: champAdminSeulement,
}

/** What only the role `admin` reads and writes, never the makeup artist herself (ticket 021). */
const INTERNE = { read: champAdminSeulement, create: champAdminSeulement, update: champAdminSeulement }

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
 * - Its photos (`photoPrincipale`, `galerie`: 10 at most, in order) are media of its own account:
 *   a makeup artist never attaches the photo of another one (ticket 043). A photo a save takes out
 *   of the profile, or the photos of a deleted profile, go to the bin of the storage once nothing
 *   references them, and profiles are deleted or changed one at a time, never by a `where`
 *   (src/collections/trash.ts, added through src/payload.config.ts, ticket 045).
 * - The networks are public. The contact details (`coordonnees`) are read by the owner and an
 *   admin only, never by the public through the API, even when she chose to show them
 *   (`contactPublic`): a public page reads them through src/services/public/. The server traces
 *   that choice: the date and the source of the consent (ticket 042).
 * - `pro` (the account that owns it) is written by an admin only; `slug` by the server only, at
 *   the creation; `strapiId` and `legacyUsername` by the import only; the choice of the status,
 *   the reason, the verification, the SIRET, the internal note, the score and the badge by an
 *   admin only (I03, U55): what a makeup artist sends on them is ignored. The status itself is
 *   computed by the server (ticket 044).
 * - Its lists keep their order and the identifier of each row (src/collections/profile-lists.ts).
 * - Its zone is a commune with its INSEE code, a radius of 0 to 200 km and « à domicile », never a
 *   postal address (src/collections/profiles/zone.ts, ticket 041).
 * - At every save, the server computes and stores its completeness, whether it is active,
 *   publishable or entirely empty, and since when (src/collections/profiles/etat.ts, ticket 044).
 *   Its status follows: an entirely empty profile is a draft, any other is published, unless an
 *   admin chose another status (`statutChoisi`); a hidden profile stays hidden whatever the save.
 * - A save or a deletion of a profile that is or was published refreshes its page, the search and
 *   the sitemap; the import refreshes nothing (src/collections/revalidation.ts, ticket 047).
 */
export const Profiles: CollectionConfig<'profiles'> = {
	slug: 'profiles',
	defaultSort: '-updatedAt',
	labels: { singular: 'Profil', plural: 'Profils' },
	// The list of the admin (ticket 165): where a profile stands at a glance, the last touched first. The
	// last activity of a profile is its last save (`updatedAt`): `derniereActivite` lives on the account
	// in the plan, not here (docs/migration/SCHEMA.md, §9). The filters of the panel read the stored
	// flags (`publiable`, `entierementVide`, `statut`), so they cost no computation.
	admin: {
		useAsTitle: 'slug',
		defaultColumns: ['slug', 'commune.nom', 'completude', 'publiable', 'statut', 'updatedAt'],
		listSearchableFields: ['slug', 'prenom', 'nom', 'nomArtiste', 'commune.nom'],
		hidden: cacheeSaufAdmin,
	},
	access: {
		read: profilPublieOuProprietaire,
		create: adminSeulement,
		update: adminOuProprietaire,
		delete: adminSeulement,
	},
	hooks: {
		beforeOperation: [refuserUnFiltreSurUnStatutInconnu],
		beforeValidate: [refuserUnChoixInconnu],
		// The state comes last: it reads the save as the other hooks leave it (ticket 044). The refresh
		// reads the stored row, which no hook changes before the write.
		beforeChange: [
			RAFRAICHISSEMENT.avantEcriture,
			identitesDesLignesAvantEcriture,
			slugALaCreation,
			consentementTrace,
			etatAvantEcriture,
		],
		// The refresh comes after the fallback slug: a profile created public gets its final address.
		afterChange: [slugDeRepliApresCreation, RAFRAICHISSEMENT.apresEcriture],
		beforeDelete: [RAFRAICHISSEMENT.avantSuppression],
		afterDelete: [RAFRAICHISSEMENT.apresSuppression],
	},
	fields: [
		{
			name: 'pro',
			label: 'Compte',
			type: 'relationship',
			relationTo: 'pros',
			required: true,
			unique: true,
			access: { read: champDuProfilAdminOuProprietaire, create: champAdminSeulement, update: champAdminSeulement },
		},
		{
			name: 'slug',
			label: 'Adresse du profil',
			type: 'text',
			required: true,
			unique: true,
			access: { create: jamais, update: jamais },
			admin: { readOnly: true, description: 'Calculée à la création du profil, elle ne change plus : /profil/<slug>.' },
		},
		{ name: 'prenom', label: 'Prénom', type: 'text', maxLength: 70 },
		{ name: 'nom', label: 'Nom', type: 'text', maxLength: 70 },
		{ name: 'nomArtiste', label: 'Nom d’artiste', type: 'text', maxLength: 70 },
		{ name: 'specialite', label: 'Spécialité', type: 'text', maxLength: 70 },
		// Its commune, its radius and « à domicile », public with the profile (ticket 041).
		...champsDeLaZone,
		{ name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 },
		{ name: 'disponible', label: 'Disponible', type: 'checkbox', defaultValue: true },
		// Its photos, media of its own account (ticket 043).
		{
			name: 'photoPrincipale',
			label: 'Photo principale',
			type: 'upload',
			relationTo: 'media',
			filterOptions: photosDeLaProprietaire,
			validate: validerPhotoPrincipale,
		},
		{
			name: 'galerie',
			label: 'Galerie',
			type: 'upload',
			relationTo: 'media',
			hasMany: true,
			maxRows: GALERIE_MAX,
			filterOptions: photosDeLaProprietaire,
			validate: validerGalerie,
			admin: { description: 'Dans l’ordre d’affichage, 10 photos au plus.' },
		},
		// The networks are public; the contact details are not (ticket 042).
		{
			name: 'reseaux',
			label: 'Réseaux',
			type: 'group',
			// `null` empties the group (Payload stops with a 500 on it otherwise, ticket 224).
			hooks: {
				beforeValidate: [
					({ value }) =>
						groupeVideSiNul(
							value,
							RESEAUX.map(([name]) => name)
						),
				],
			},
			fields: RESEAUX.map(([name, label]) => ({ name, label, type: 'text' as const, validate: validerLienDeReseau })),
		},
		{
			// Never read by the public through the API, whatever `contactPublic` says: a public page
			// shows them through src/services/public/, and only when `contactPublic` is true.
			name: 'coordonnees',
			label: 'Coordonnées',
			type: 'group',
			access: { read: champDuProfilAdminOuProprietaire },
			hooks: { beforeValidate: [({ value }) => groupeVideSiNul(value, ['telephone', 'email'])] },
			admin: {
				description: 'Fermées au public. La page du profil ne les montre que si « Coordonnées publiques » est cochée.',
			},
			fields: [
				{ name: 'telephone', label: 'Téléphone', type: 'text', validate: validerTelephone },
				{ name: 'email', label: 'Email de contact', type: 'email', validate: validerEmailDeContact },
			],
		},
		{
			name: 'contactPublic',
			label: 'Coordonnées publiques',
			type: 'checkbox',
			defaultValue: false,
			access: { read: champDuProfilAdminOuProprietaire },
			admin: { description: 'Choisi par la maquilleuse : ses coordonnées s’affichent sur la page de son profil.' },
		},
		{
			name: 'consentiLe',
			label: 'Consentement donné le',
			type: 'date',
			access: { read: champDuProfilAdminOuProprietaire, create: jamais, update: jamais },
			admin: {
				readOnly: true,
				date: { pickerAppearance: 'dayAndTime' },
				description: 'Posée par le serveur quand les coordonnées deviennent publiques.',
			},
		},
		{
			name: 'sourceConsentement',
			label: 'Source du consentement',
			type: 'select',
			options: SOURCES_DU_CONSENTEMENT.map(source => ({ label: LIBELLES_DES_SOURCES[source], value: source })),
			access: { read: champDuProfilAdminOuProprietaire, create: jamais, update: jamais },
			admin: { readOnly: true, description: 'Posée par le serveur, avec la date.' },
		},
		// Offers with their options, skills, languages, courses, experiences (ticket 040).
		...CHAMPS_LISTES,
		{
			name: 'legacyUsername',
			label: 'Nom d’utilisateur sur l’ancien site',
			type: 'text',
			access: { read: champDuProfilAdminOuProprietaire, create: jamais, update: jamais },
			admin: { readOnly: true, description: 'Sert à rediriger l’ancienne adresse du profil vers la nouvelle.' },
		},
		{
			name: 'strapiId',
			label: 'Identifiant sur l’ancien site',
			type: 'number',
			unique: true,
			access: { read: champDuProfilAdminOuProprietaire, create: jamais, update: jamais },
			admin: { readOnly: true },
		},
		// Computed by the server at every save, from the choice of an admin and the rule (ticket 044).
		{
			name: 'statut',
			label: 'Statut',
			type: 'select',
			// Not `required`, so that a creation needs no status in its data: it gets the default, which
			// the server replaces. An empty status is not `publie`.
			defaultValue: STATUT_INITIAL,
			// Every public read filters on it.
			index: true,
			options: STATUTS_DU_PROFIL.map(statut => ({ label: LIBELLES_DES_STATUTS[statut], value: statut })),
			// No API writes it: what a request sends, an admin's included, is ignored (src/lib/profil/etat.ts).
			access: { read: champDuProfilAdminOuProprietaire, create: jamais, update: jamais },
			admin: {
				readOnly: true,
				position: 'sidebar',
				description:
					'Posé par le serveur à chaque enregistrement, selon le statut choisi en dessous. Seuls les profils publiés sont lus par le public.',
			},
		},
		// Reserved to the role `admin` (tickets 021 and 044).
		{
			name: 'statutChoisi',
			label: 'Statut choisi par l’admin',
			type: 'select',
			defaultValue: CHOIX_INITIAL,
			options: CHOIX_DU_STATUT.map(choix => ({ label: LIBELLES_DES_CHOIX[choix], value: choix })),
			// A value that is no choice is refused with a sentence, never ignored (ticket 165).
			validate: validerLeChoixDuStatut,
			access: RESERVE_LU_PAR_LA_PROPRIETAIRE,
			admin: {
				position: 'sidebar',
				description:
					'Automatique : le serveur pose le statut, brouillon pour un profil entièrement vide, publié sinon. Un autre choix est gardé, quoi que la maquilleuse enregistre.',
			},
		},
		{
			name: 'motif',
			label: 'Motif',
			type: 'textarea',
			access: RESERVE_LU_PAR_LA_PROPRIETAIRE,
			admin: { position: 'sidebar', description: 'Pourquoi le profil est masqué. La maquilleuse le lit.' },
		},
		{
			name: 'verifie',
			label: 'Vérifiée',
			type: 'checkbox',
			defaultValue: false,
			access: RESERVE_LU_PAR_LA_PROPRIETAIRE,
			admin: { position: 'sidebar' },
		},
		{
			name: 'verifieLe',
			label: 'Vérifiée le',
			type: 'date',
			access: RESERVE_LU_PAR_LA_PROPRIETAIRE,
			admin: { position: 'sidebar' },
		},
		{
			name: 'siret',
			label: 'SIRET',
			type: 'text',
			validate: validerSiret,
			access: RESERVE_LU_PAR_LA_PROPRIETAIRE,
			admin: { position: 'sidebar', description: '14 chiffres, sans espace.' },
		},
		{
			name: 'noteInterne',
			label: 'Note interne',
			type: 'textarea',
			access: INTERNE,
			admin: { position: 'sidebar', description: 'Lue par les admins seulement, jamais par la maquilleuse.' },
		},
		{
			name: 'score',
			label: 'Score',
			type: 'number',
			access: INTERNE,
			admin: {
				position: 'sidebar',
				description: 'Repris de l’ancien site. Ce n’est pas la complétude. Lu par les admins seulement.',
			},
		},
		{
			// Written by an admin only, read by everyone: the badge of the cards of the search.
			name: 'superMaquilleuse',
			label: 'Super maquilleuse',
			type: 'checkbox',
			defaultValue: false,
			access: { create: champAdminSeulement, update: champAdminSeulement },
			admin: { position: 'sidebar', description: 'Le badge des cartes de la recherche. Public.' },
		},
		// Computed by the server at every save (ticket 044).
		...CHAMPS_DE_L_ETAT,
	],
}
