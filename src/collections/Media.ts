import {
	APIError,
	type CollectionBeforeChangeHook,
	type CollectionBeforeOperationHook,
	type CollectionConfig,
	type Field,
	MissingFile,
	NotFound,
	type Plugin,
	type UploadConfig,
	type Where,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import {
	adminOuProprietaireDuMedia,
	adminRedactionOuMaquilleuse,
	champAdminSeulement,
	champDuMediaAdminOuProprietaire,
	estMaquilleuse,
	jamais,
	lectureDesMedias,
} from '../lib/acces'
import { adresseDuMedia } from '../lib/medias'
import { judge, NAMED_FILE_CONTEXT, unpredictableName } from '../lib/photo-upload'

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

const fichierNommeParLeServeur = (req: { context?: Record<string, unknown> }): boolean =>
	req.context?.[NAMED_FILE_CONTEXT] === true || req.context?.skipCloudStorage === true

/**
 * A file sent to the site is a JPEG, a PNG or a WebP of 10 MiB at most, read in its content
 * (ticket 133, `src/lib/photo-upload.ts`), whoever sends it. Anything else is refused (400) before
 * Payload reads it, so that nothing reaches the storage. The photo is then stored under a name the
 * server draws (`<uuid>.<extension of its real type>`): the original name appears nowhere.
 *
 * The import sends no file (it adopts photos where they are) and is not concerned.
 */
export const photoValideEtRenommee: CollectionBeforeOperationHook = ({ args, operation, req }) => {
	const fichier = req.file
	if ((operation !== 'create' && operation !== 'update') || !fichier) return args
	if (fichierNommeParLeServeur(req)) {
		// Trusted server code names its file: the type is still read in the content.
		const verdict = judge(fichier.data, Math.max(fichier.size ?? 0, fichier.data.length))
		if (!verdict.accepte) throw new APIError(verdict.message, 400)
		return args
	}
	const octets = fichier.data
	const verdict = judge(octets, Math.max(fichier.size ?? 0, octets.length))
	if (!verdict.accepte) throw new APIError(verdict.message, 400)
	fichier.name = unpredictableName(verdict.type)
	fichier.mimetype = verdict.type
	return args
}

/** A handler of Payload's own route for the file of a media. */
type GestionnaireDeFichier = NonNullable<UploadConfig['handlers']>[number]

/**
 * Payload's own route for the file of a media, `/api/media/file/<name>`, answers by a redirection
 * to the public address of the photo (`adresseDuMedia`, from `base`): no photo is ever on the disk
 * of the server, and the address the site gives is the direct one anyway.
 *
 * Payload checks the reading first (`lectureDesMedias`, without an identifier): the public and
 * `editor` are refused, a makeup artist reaches her own media only, and Payload hands it here.
 * For `admin` it looks for nothing: the media is found by its name, and its prefix when the query
 * gives one. A name no media has is not found.
 */
export const versLAdressePublique =
	(base: string): GestionnaireDeFichier =>
	async (req, { doc, params: { filename, prefix } }) => {
		const conditions: Where[] = [{ filename: { equals: filename } }]
		if (prefix !== undefined) conditions.push({ prefix: { equals: prefix } })
		const media = (doc ?? (await req.payload.db.findOne({ collection: 'media', req, where: { and: conditions } }))) as {
			filename?: string | null
			prefix?: string | null
		} | null
		if (!media?.filename) throw new NotFound(req.t)
		return Response.redirect(adresseDuMedia(base, media.prefix, media.filename), 302)
	}

/**
 * A media always names its object: a creation that ends without a file name is refused, as
 * Payload refuses an upload without a file (`MissingFile`, 400).
 *
 * Payload's own check (`filesRequiredOnCreate`) is off, for one case only: the import adopts a
 * photo of the old site where it already is, without copying it (ticket 058). It creates the
 * document through the Local API with the name and the prefix read in the address of the file,
 * and no file. A request never gets there: Payload and `coordonneesParLeServeur` drop the name it
 * sends, so without a file it has none, and it is refused here.
 */
export const unFichierALaCreation: CollectionBeforeChangeHook = ({ data, operation, req }) => {
	if (operation === 'create' && (typeof data.filename !== 'string' || data.filename === ''))
		throw new MissingFile(req.t)
	return data
}

/**
 * Nothing is ever written on the disk of the server: with a storage, the object goes there;
 * without one, nowhere. A creation without a file is left to `unFichierALaCreation`.
 */
export const UPLOAD_DES_MEDIAS: UploadConfig = {
	disableLocalStorage: true,
	filesRequiredOnCreate: false,
	// No `mimeTypes` here: Payload would also refuse the GIF or AVIF media the import adopts for the
	// galleries of articles (their `mimeType` is validated against it). The file check is
	// `photoValideEtRenommee`.
	// Derived sizes, stored next to the original (same folder, same unpredictable base name).
	// Payload makes only the sizes the photo is large enough for; the bin moves them with it.
	imageSizes: [
		{ name: 'thumbnail', width: 245 },
		{ name: 'small', width: 500 },
		{ name: 'medium', width: 750 },
		{ name: 'large', width: 1000 },
	],
}

/**
 * The photos of the site (plan 01 §6.1; docs/migration/SCHEMA.md, §8). Each one is an object of
 * the storage (`@payloadcms/storage-s3`, set up in src/payload.config.ts), under its own prefix.
 *
 * - The public never lists the media; it reads one media when it belongs to a published profile
 *   (U56, I04) or to the gallery of a published article (ticket 046). A makeup artist lists and
 *   reads her own; `admin` reads everything.
 * - A makeup artist sends photos; the server makes her the owner (`owner`), whatever her request
 *   says. She changes and deletes her own media only; `admin` reaches every one.
 * - The newsroom sends the photos of the articles: they belong to nobody, and `editor` lists,
 *   reads, changes and deletes them, never the photo of a makeup artist (ticket 046).
 * - The owner, the identifier and the formats of the old site are not public.
 * - Payload's route for the file sends to the public address (`versLAdressePublique`, added by
 *   src/payload.config.ts, which knows the base of the photos).
 *
 * The types, the size, the unpredictable name and the derived sizes of a photo sent in the v3 are
 * those of ticket 133 (`photoValideEtRenommee`, `UPLOAD_DES_MEDIAS`). A media deleted, or whose file is replaced, sends its objects to the bin
 * of the storage, never erased, and media are deleted or changed one at a time, never by a
 * `where`: the hooks of the bin are added by src/collections/trash.ts (ticket 045), through
 * src/payload.config.ts.
 */
export const Media: CollectionConfig<'media'> = {
	slug: 'media',
	labels: { singular: 'Média', plural: 'Médias' },
	admin: { useAsTitle: 'filename', defaultColumns: ['filename', 'owner', 'alt'] },
	access: {
		read: lectureDesMedias,
		create: adminRedactionOuMaquilleuse,
		update: adminOuProprietaireDuMedia,
		delete: adminOuProprietaireDuMedia,
	},
	upload: UPLOAD_DES_MEDIAS,
	hooks: {
		beforeOperation: [coordonneesParLeServeur, photoValideEtRenommee],
		beforeChange: [unFichierALaCreation, proprietaireALEnvoi],
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
