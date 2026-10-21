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
	adminEditorOrArtist,
	adminOrMediaOwner,
	fieldAdminOnly,
	isArtist,
	mediaFieldAdminOrOwner,
	mediaRead,
	neverAllowed,
} from '../lib/access'
import { mediaUrl } from '../lib/media'
import { judge, NAMED_FILE_CONTEXT, unpredictableName } from '../lib/photo-upload'

/**
 * Where the object of a media is and what it is: written by the server only, from the file it
 * receives (Payload and the storage plugin), or by the import, never by a request. A request that
 * sends them has them dropped, so that a document always names its own object.
 */
export const FILE_METADATA_FIELDS = [
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

/** Drops what a request sends about the object itself, before Payload reads the file (`FILE_METADATA_FIELDS`). */
export const fileMetadataSetByServer: CollectionBeforeOperationHook = ({ args, operation, req }) => {
	if ((operation !== 'create' && operation !== 'update') || !req.user) return args
	const data = args.data as Record<string, unknown> | undefined
	if (!data) return args
	for (const field of FILE_METADATA_FIELDS) delete data[field]
	return args
}

/** The makeup artist who sends a photo owns it, whatever owner her request names (ticket 043). */
export const ownerOnUpload: CollectionBeforeChangeHook = ({ data, operation, req: { user } }) =>
	operation === 'create' && user && isArtist(user) ? { ...data, owner: user.id } : data

/** The message of a photo sent while the application has no object storage. */
export const NO_STORAGE_MESSAGE =
	'Le stockage des photos n’est pas configuré sur ce serveur : la photo n’a pas été enregistrée.'

/**
 * Without an object storage (S3_ENDPOINT not set), no photo is received: the application never
 * writes one on its own disk. src/payload.config.ts adds this hook only then.
 */
export const noUploadWithoutStorage: CollectionBeforeOperationHook = ({ args, operation, req }) => {
	if ((operation === 'create' || operation === 'update') && req.file) throw new APIError(NO_STORAGE_MESSAGE, 503)
	return args
}

const fileNamedByServer = (req: { context?: Record<string, unknown> }): boolean =>
	req.context?.[NAMED_FILE_CONTEXT] === true || req.context?.skipCloudStorage === true

/**
 * A file sent to the site is a JPEG, a PNG or a WebP of 10 MiB at most, read in its content
 * (ticket 133, `src/lib/photo-upload.ts`), whoever sends it. Anything else is refused (400) before
 * Payload reads it, so that nothing reaches the storage. The photo is then stored under a name the
 * server draws (`<uuid>.<extension of its real type>`): the original name appears nowhere.
 *
 * The import sends no file (it adopts photos where they are) and is not concerned.
 */
export const photoValidatedAndRenamed: CollectionBeforeOperationHook = ({ args, operation, req }) => {
	const file = req.file
	if ((operation !== 'create' && operation !== 'update') || !file) return args
	if (fileNamedByServer(req)) {
		// Trusted server code names its file: the type is still read in the content.
		const verdict = judge(file.data, Math.max(file.size ?? 0, file.data.length))
		if (!verdict.accepte) throw new APIError(verdict.message, 400)
		return args
	}
	const bytes = file.data
	const verdict = judge(bytes, Math.max(file.size ?? 0, bytes.length))
	if (!verdict.accepte) throw new APIError(verdict.message, 400)
	file.name = unpredictableName(verdict.type)
	file.mimetype = verdict.type
	return args
}

/** A handler of Payload's own route for the file of a media. */
type FileHandler = NonNullable<UploadConfig['handlers']>[number]

/**
 * Payload's own route for the file of a media, `/api/media/file/<name>`, answers by a redirection
 * to the public address of the photo (`mediaUrl`, from `base`): no photo is ever on the disk
 * of the server, and the address the site gives is the direct one anyway.
 *
 * Payload checks the reading first (`mediaRead`, without an identifier): the public and
 * `editor` are refused, a makeup artist reaches her own media only, and Payload hands it here.
 * For `admin` it looks for nothing: the media is found by its name, and its prefix when the query
 * gives one. A name no media has is not found.
 */
export const toPublicUrl =
	(base: string): FileHandler =>
	async (req, { doc, params: { filename, prefix } }) => {
		const conditions: Where[] = [{ filename: { equals: filename } }]
		if (prefix !== undefined) conditions.push({ prefix: { equals: prefix } })
		const media = (doc ?? (await req.payload.db.findOne({ collection: 'media', req, where: { and: conditions } }))) as {
			filename?: string | null
			prefix?: string | null
		} | null
		if (!media?.filename) throw new NotFound(req.t)
		return Response.redirect(mediaUrl(base, media.prefix, media.filename), 302)
	}

/**
 * A media always names its object: a creation that ends without a file name is refused, as
 * Payload refuses an upload without a file (`MissingFile`, 400).
 *
 * Payload's own check (`filesRequiredOnCreate`) is off, for one case only: the import adopts a
 * photo of the old site where it already is, without copying it (ticket 058). It creates the
 * document through the Local API with the name and the prefix read in the address of the file,
 * and no file. A request never gets there: Payload and `fileMetadataSetByServer` drop the name it
 * sends, so without a file it has none, and it is refused here.
 */
export const fileOnCreate: CollectionBeforeChangeHook = ({ data, operation, req }) => {
	if (operation === 'create' && (typeof data.filename !== 'string' || data.filename === ''))
		throw new MissingFile(req.t)
	return data
}

/**
 * Nothing is ever written on the disk of the server: with a storage, the object goes there;
 * without one, nowhere. A creation without a file is left to `fileOnCreate`.
 */
export const MEDIA_UPLOAD: UploadConfig = {
	disableLocalStorage: true,
	filesRequiredOnCreate: false,
	// No `mimeTypes` here: Payload would also refuse the GIF or AVIF media the import adopts for the
	// galleries of articles (their `mimeType` is validated against it). The file check is
	// `photoValidatedAndRenamed`.
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
 * - Payload's route for the file sends to the public address (`toPublicUrl`, added by
 *   src/payload.config.ts, which knows the base of the photos).
 *
 * The types, the size, the unpredictable name and the derived sizes of a photo sent in the v3 are
 * those of ticket 133 (`photoValidatedAndRenamed`, `MEDIA_UPLOAD`). A media deleted, or whose file is replaced, sends its objects to the bin
 * of the storage, never erased, and media are deleted or changed one at a time, never by a
 * `where`: the hooks of the bin are added by src/collections/trash.ts (ticket 045), through
 * src/payload.config.ts.
 */
export const Media: CollectionConfig<'media'> = {
	slug: 'media',
	labels: { singular: 'Média', plural: 'Médias' },
	admin: { useAsTitle: 'filename', defaultColumns: ['filename', 'owner', 'alt'] },
	access: {
		read: mediaRead,
		create: adminEditorOrArtist,
		update: adminOrMediaOwner,
		delete: adminOrMediaOwner,
	},
	upload: MEDIA_UPLOAD,
	hooks: {
		beforeOperation: [fileMetadataSetByServer, photoValidatedAndRenamed],
		beforeChange: [fileOnCreate, ownerOnUpload],
	},
	fields: [
		{ name: 'alt', label: 'Texte alternatif', type: 'text' },
		{
			name: 'owner',
			label: 'Propriétaire',
			type: 'relationship',
			relationTo: 'pros',
			index: true,
			access: { read: mediaFieldAdminOrOwner, create: fieldAdminOnly, update: fieldAdminOnly },
			admin: {
				description: 'La maquilleuse qui a envoyé la photo, posée par le serveur. Vide pour une photo d’article.',
			},
		},
		{
			name: 'strapiId',
			label: 'Identifiant sur l’ancien site',
			type: 'number',
			unique: true,
			access: { read: fieldAdminOnly, create: neverAllowed, update: neverAllowed },
			admin: { readOnly: true },
		},
		{
			name: 'objectMissing',
			label: 'Objet absent du stockage',
			type: 'checkbox',
			defaultValue: false,
			// Read with the media (the pages leave a marked photo out without asking the storage), written by the import only.
			access: { create: neverAllowed, update: neverAllowed },
			admin: {
				readOnly: true,
				description:
					'Posé par l’import : la photo de l’ancien site a été reprise, mais son fichier n’existait plus dans le stockage. Elle n’est pas affichée.',
			},
		},
		{
			name: 'strapiFormats',
			label: 'Formats de l’ancien site',
			type: 'json',
			access: { read: fieldAdminOnly, create: neverAllowed, update: neverAllowed },
			admin: { readOnly: true, description: 'Archive : les vignettes de l’ancien site, restées où elles sont.' },
		},
	],
}

/**
 * The storage plugin adds `prefix` and `_objectKey` to the media after the collection is written,
 * without any access rule, and says itself that a request may write them. This plugin, placed after
 * it, closes both to every API: only the server writes them (`fileMetadataSetByServer` already
 * drops them from a request; this is the second lock). A new photo gets the default prefix.
 */
export const closedStorageFields: Plugin = config => ({
	...config,
	collections: config.collections?.map(collection =>
		collection.slug !== Media.slug
			? collection
			: {
					...collection,
					fields: collection.fields.map((field): Field => {
						if (!('name' in field) || (field.name !== '_objectKey' && field.name !== 'prefix')) return field
						const access = 'access' in field ? field.access : undefined
						return { ...field, access: { ...access, create: neverAllowed, update: neverAllowed } } as Field
					}),
				}
	),
})
