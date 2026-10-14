import { randomUUID } from 'node:crypto'
import type {
	CollectionAfterChangeHook,
	CollectionBeforeChangeHook,
	CollectionConfig,
	PayloadRequest,
	RequiredDataFromCollectionSlug,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	adminOuProprietaire,
	adminSeulement,
	champAdminSeulement,
	champDuProfilAdminOuProprietaire,
	jamais,
	profilPublieOuProprietaire,
} from '../lib/acces'
import { GALERIE_MAX } from '../lib/medias'
import {
	consentementApres,
	LIBELLES_DES_SOURCES,
	SOURCES_DU_CONSENTEMENT,
	validerEmailDeContact,
	validerLienDeReseau,
	validerTelephone,
} from '../lib/profil/coordonnees'
import { photosDeLaProprietaire, validerPhotosDuProfil } from '../lib/profil/photos'
import { validerSiret } from '../lib/profil/siret'
import { LIBELLES_DES_STATUTS, STATUT_INITIAL, STATUTS_DU_PROFIL } from '../lib/profil/statut'
import { premierSlugLibre, slugDeRepli, slugifier } from '../lib/slug'

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
			collection: 'profils',
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
	const base = slugifier(compte?.nom)
	return { ...data, slug: base ? await premierSlugLibre(base, slugsPris(req)) : `${PREFIXE_PROVISOIRE}${randomUUID()}` }
}

/** The fallback slug, `maquilleuse-<id>`, written as soon as the profile has its identifier. */
export const slugDeRepliApresCreation: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
	if (operation !== 'create' || !String(doc.slug).startsWith(PREFIXE_PROVISOIRE)) return doc
	const slug = await premierSlugLibre(slugDeRepli(doc.id), slugsPris(req))
	await req.payload.update({ collection: 'profils', data: { slug }, depth: 0, id: doc.id, overrideAccess: true, req })
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
	const profil = { pro: doc.id } as RequiredDataFromCollectionSlug<'profils'>
	await req.payload.create({ collection: 'profils', data: profil, depth: 0, overrideAccess: true, req })
	return doc
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
 *   or `redaction`, reads the published profiles only, and a makeup artist reads them too
 *   (ticket 021, U53, I01).
 * - What the public reads of a profile is its identity: never the account it belongs to, what the
 *   import wrote, nor what an admin decided about it, except the « Super maquilleuse » badge.
 * - Nobody creates a profile through an API but an admin: the server creates it with the account.
 * - Its photos (`photoPrincipale`, `galerie`: 10 at most, in order) are media of its own account:
 *   a makeup artist never attaches the photo of another one (ticket 043).
 * - The networks are public. The contact details (`coordonnees`) are read by the owner and an
 *   admin only, never by the public through the API, even when she chose to show them
 *   (`contactPublic`): a public page reads them through src/services/public/. The server traces
 *   that choice: the date and the source of the consent (ticket 042).
 * - `pro` (the account that owns it) is written by an admin only; `slug` by the server only, at
 *   the creation; `strapiId` and `legacyUsername` by the import only; the status, the reason, the
 *   verification, the SIRET, the internal note, the score and the badge by an admin only (I03,
 *   U55): what a makeup artist sends on them is ignored.
 */
export const Profils: CollectionConfig<'profils'> = {
	slug: 'profils',
	labels: { singular: 'Profil', plural: 'Profils' },
	admin: { useAsTitle: 'slug', defaultColumns: ['slug', 'prenom', 'nom', 'statut', 'pro'] },
	access: {
		read: profilPublieOuProprietaire,
		create: adminSeulement,
		update: adminOuProprietaire,
		delete: adminSeulement,
	},
	hooks: {
		beforeChange: [slugALaCreation, consentementTrace],
		afterChange: [slugDeRepliApresCreation],
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
		{ name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 },
		{ name: 'disponible', label: 'Disponible', type: 'checkbox', defaultValue: true },
		// Its photos, media of its own account (ticket 043).
		{
			name: 'photoPrincipale',
			label: 'Photo principale',
			type: 'upload',
			relationTo: 'media',
			filterOptions: photosDeLaProprietaire,
			validate: validerPhotosDuProfil,
		},
		{
			name: 'galerie',
			label: 'Galerie',
			type: 'upload',
			relationTo: 'media',
			hasMany: true,
			maxRows: GALERIE_MAX,
			filterOptions: photosDeLaProprietaire,
			validate: validerPhotosDuProfil,
			admin: { description: 'Dans l’ordre d’affichage, 10 photos au plus.' },
		},
		// The networks are public; the contact details are not (ticket 042).
		{
			name: 'reseaux',
			label: 'Réseaux',
			type: 'group',
			fields: RESEAUX.map(([name, label]) => ({ name, label, type: 'text' as const, validate: validerLienDeReseau })),
		},
		{
			// Never read by the public through the API, whatever `contactPublic` says: a public page
			// shows them through src/services/public/, and only when `contactPublic` is true.
			name: 'coordonnees',
			label: 'Coordonnées',
			type: 'group',
			access: { read: champDuProfilAdminOuProprietaire },
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
		// Reserved to the role `admin` (ticket 021).
		{
			name: 'statut',
			label: 'Statut',
			type: 'select',
			// Not `required`, so that a creation that gives none (the server, the import, a test)
			// needs no status in its data: it gets the default. An empty status is not `publie`.
			defaultValue: STATUT_INITIAL,
			// Every public read filters on it.
			index: true,
			options: STATUTS_DU_PROFIL.map(statut => ({ label: LIBELLES_DES_STATUTS[statut], value: statut })),
			access: RESERVE_LU_PAR_LA_PROPRIETAIRE,
			admin: { position: 'sidebar', description: 'Seuls les profils publiés sont lus par le public.' },
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
	],
}
