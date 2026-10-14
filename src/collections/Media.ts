import {
	APIError,
	type CollectionBeforeChangeHook,
	type CollectionBeforeOperationHook,
	type CollectionConfig,
	type Field,
	type Plugin,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	adminOuMaquilleuse,
	adminOuProprietaireDuMedia,
	champAdminSeulement,
	champDuMediaAdminOuProprietaire,
	estMaquilleuse,
	jamais,
	lectureDesMedias,
} from '../lib/acces'

/**
 * Where the object of a media is and what it is: written by the server only, from the file it
 * receives (Payload and the storage plugin), or by the import, never by a request. A request that
 * sends them has them dropped, so that a document always names its own object.
 */
export const COORDONNEES_DU_FICHIER = [
	'filename',
	'prefix',
	'_objectKey',
	'url',
	'thumbnailURL',
	'mimeType',
	'filesize',
	'width',
	'height',
	'focalX',
	'focalY',
	'sizes',
] as const

/** Drops what a request sends about the object itself, before Payload reads the file (`COORDONNEES_DU_FICHIER`). */
export const coordonneesParLeServeur: CollectionBeforeOperationHook = ({ args, operation, req }) => {
	if ((operation !== 'create' && operation !== 'update') || !req.user) return args
	const data = args.data as Record<string, unknown> | undefined
	if (!data) return args
	for (const champ of COORDONNEES_DU_FICHIER) delete data[champ]
	return args
}

/** The makeup artist who sends a photo owns it, whatever owner her request names (ticket 043). */
export const proprietaireALEnvoi: CollectionBeforeChangeHook = ({ data, operation, req: { user } }) =>
	operation === 'create' && user && estMaquilleuse(user) ? { ...data, owner: user.id } : data

/** The message of a photo sent while the application has no object storage. */
export const MESSAGE_SANS_STOCKAGE =
	'Le stockage des photos n’est pas configuré sur ce serveur : la photo n’a pas été enregistrée.'

/**
 * Without an object storage (S3_ENDPOINT not set), no photo is received: the application never
 * writes one on its own disk. src/payload.config.ts adds this hook only then.
 */
export const aucunEnvoiSansStockage: CollectionBeforeOperationHook = ({ args, operation, req }) => {
	if ((operation === 'create' || operation === 'update') && req.file) throw new APIError(MESSAGE_SANS_STOCKAGE, 503)
	return args
}

/**
 * The photos of the site (plan 01 §6.1; docs/migration/SCHEMA.md, §8). Each one is an object of
 * the storage (`@payloadcms/storage-s3`, set up in src/payload.config.ts), under its own prefix.
 *
 * - The public never lists the media; it reads one media when it belongs to a published profile
 *   (U56, I04). A makeup artist lists and reads her own; `admin` reads everything.
 * - A makeup artist sends photos; the server makes her the owner (`owner`), whatever her request
 *   says. She changes and deletes her own media only; `admin` reaches every one.
 * - The owner, the identifier and the formats of the old site are not public.
 *
 * The types, the size, the unpredictable name and the derived sizes of a photo sent in the v3 are
 * the work of ticket 133; the trash for a photo that no longer serves, of ticket 045.
 */
export const Media: CollectionConfig<'media'> = {
	slug: 'media',
	labels: { singular: 'Média', plural: 'Médias' },
	admin: { useAsTitle: 'filename', defaultColumns: ['filename', 'owner', 'alt'] },
	access: {
		read: lectureDesMedias,
		create: adminOuMaquilleuse,
		update: adminOuProprietaireDuMedia,
		delete: adminOuProprietaireDuMedia,
	},
	// Nothing is ever written on the disk of the server: with a storage, the object goes there; without one, nowhere.
	upload: { disableLocalStorage: true },
	hooks: {
		beforeOperation: [coordonneesParLeServeur],
		beforeChange: [proprietaireALEnvoi],
	},
	fields: [
		{ name: 'alt', label: 'Texte alternatif', type: 'text' },
		{
			name: 'owner',
			label: 'Propriétaire',
			type: 'relationship',
			relationTo: 'pros',
			index: true,
			access: { read: champDuMediaAdminOuProprietaire, create: champAdminSeulement, update: champAdminSeulement },
			admin: {
				description: 'La maquilleuse qui a envoyé la photo, posée par le serveur. Vide pour une photo d’article.',
			},
		},
		{
			name: 'strapiId',
			label: 'Identifiant sur l’ancien site',
			type: 'number',
			unique: true,
			access: { read: champAdminSeulement, create: jamais, update: jamais },
			admin: { readOnly: true },
		},
		{
			name: 'strapiFormats',
			label: 'Formats de l’ancien site',
			type: 'json',
			access: { read: champAdminSeulement, create: jamais, update: jamais },
			admin: { readOnly: true, description: 'Archive : les vignettes de l’ancien site, restées où elles sont.' },
		},
	],
}

/**
 * The storage plugin adds `prefix` and `_objectKey` to the media after the collection is written,
 * without any access rule, and says itself that a request may write them. This plugin, placed after
 * it, closes both to every API: only the server writes them (`coordonneesParLeServeur` already
 * drops them from a request; this is the second lock). A new photo gets the default prefix.
 */
export const champsDuStockageFermes: Plugin = config => ({
	...config,
	collections: config.collections?.map(collection =>
		collection.slug !== Media.slug
			? collection
			: {
					...collection,
					fields: collection.fields.map((field): Field => {
						if (!('name' in field) || (field.name !== '_objectKey' && field.name !== 'prefix')) return field
						const access = 'access' in field ? field.access : undefined
						return { ...field, access: { ...access, create: jamais, update: jamais } } as Field
					}),
				}
	),
})
