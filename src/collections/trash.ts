import {
	APIError,
	type CollectionAfterChangeHook,
	type CollectionAfterDeleteHook,
	type CollectionBeforeDeleteHook,
	type CollectionBeforeOperationHook,
	type CollectionConfig,
	type PayloadRequest,
	type Plugin,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { estUnImport } from '../lib/contexte-import'
import {
	clesDesObjets,
	deplacerVersLaCorbeille,
	type ObjetsDUnMedia,
	PanneDuStockage,
	type StockageDesObjets,
} from '../lib/corbeille'
import { identifiantDe, photosNommees } from '../lib/profil/photos'

/**
 * A photo that no longer serves goes to the bin, never to a direct deletion (ticket 045; plan 01
 * §1.8; docs/migration/SCHEMA.md, §8). The rule of the bin itself, the move and the putting back,
 * is in src/lib/corbeille.ts; this file decides when a photo no longer serves.
 *
 * - **A media deleted** (by its owner, by an admin, by the newsroom, or by the clean-up below): its
 *   objects, the original and each derived size, move to the bin.
 * - **The file of a media replaced**: the objects of the former file move to the bin, once the new
 *   one is written.
 * - **The clean-up of a profile** (`menage`): when a save takes a photo out of a profile, its main
 *   photo replaced or a photo taken out of its gallery, or when a profile is deleted, each photo
 *   that nothing references any more (no profile, no article, no version of an article) is deleted,
 *   and its objects move to the bin. A photo still referenced stays where it is. A deleted profile
 *   takes with it every photo of its account that nothing references.
 * - **Under the context of the import** (`estUnImport`), nothing of this happens: no media is
 *   deleted, no object moves.
 * - **Without an object storage** (S3_ENDPOINT not set), no object can move: the clean-up of a
 *   profile deletes no media, so that no record is lost while its object stays where it is.
 *
 * The moves come last, inside the transaction of the request: if the storage fails, what has
 * already moved is put back, and the request fails (503) with every document as it was. Nothing of
 * the request is kept.
 *
 * That holds for an operation on one document only. Payload runs an operation on several documents
 * at once (by a `where`, as the list view of the admin panel deletes) document by document, keeps
 * the error of one of them in its answer, and commits the writes of all the others, and of that
 * one. So `media` and `profils` refuse it (`unALaFois`), by every API, outside the import; the
 * admin panel no longer offers it.
 *
 * The storage plugin deletes the objects itself, after a deletion or a replacement: its own
 * deletions are taken away (`sansSuppressionDuGreffon`). `avecLaCorbeille` wraps the plugin, and
 * src/payload.config.ts uses nothing else.
 */

/** The answer to a request whose photos the storage could not move: nothing was changed. */
export const MESSAGE_PANNE_DU_STOCKAGE =
	'Le stockage des photos ne répond pas : rien n’a été modifié. Réessaie dans quelques minutes.'

/** The answer to a deletion or a change of several media, or of several profiles, at once. */
export const MESSAGE_UN_A_LA_FOIS =
	'Les photos et les profils se suppriment et se modifient un par un, depuis leur fiche : rien n’a été modifié.'

/** The objects of one request that wait for the bin while a caller holds it (`corbeilleRetenue`). */
interface Attente {
	cles: string[]
	/** How many callers hold the bin: the objects move when the last one lets go. */
	retenue: number
	stockage: StockageDesObjets | undefined
}

/** Keyed by the request itself: every nested operation of the Local API gets the same object. */
const ATTENTES = new WeakMap<PayloadRequest, Attente>()

/** The name of an error, and the status the storage gave: never its message, which may name a key. */
function resumeDeLErreur(erreur: unknown): string {
	const { name, $metadata } = (erreur ?? {}) as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
	const statut = typeof $metadata?.httpStatusCode === 'number' ? ` (${$metadata.httpStatusCode})` : ''
	return `${typeof name === 'string' ? name : 'Error'}${statut}`
}

/**
 * Moves these objects to the bin now. Without a storage (S3_ENDPOINT not set), there is no object
 * to move: a log line says so. When the storage fails, the error the request gets is a 503 in
 * French; the log says how many objects were put back, never which.
 */
async function deplacer(req: PayloadRequest, stockage: StockageDesObjets | undefined, cles: string[], sujet: string) {
	if (cles.length === 0) return
	const { logger } = req.payload
	if (!stockage) {
		logger.warn(`[corbeille] ${sujet}: no object storage, ${cles.length} object(s) left where they are`)
		return
	}
	try {
		const { deplacees, absentes } = await deplacerVersLaCorbeille(stockage, cles)
		logger.info(
			`[corbeille] ${sujet}: ${deplacees.length} object(s) moved to the bin${absentes.length > 0 ? `, ${absentes.length} already missing` : ''}`
		)
	} catch (erreur) {
		const panne = erreur instanceof PanneDuStockage ? erreur : undefined
		logger.error(
			`[corbeille] ${sujet}: the storage failed (${resumeDeLErreur(panne?.cause ?? erreur)}); ${panne?.remises.length ?? 0} object(s) put back, ${panne?.nonRemises.length ?? 0} left in the bin`
		)
		throw new APIError(MESSAGE_PANNE_DU_STOCKAGE, 503)
	}
}

/** Sends these objects to the bin: now, or when the caller that holds the bin lets go. */
async function versLaCorbeille(
	req: PayloadRequest,
	stockage: StockageDesObjets | undefined,
	cles: string[],
	sujet: string
): Promise<void> {
	const attente = ATTENTES.get(req)
	if (attente && attente.retenue > 0) {
		attente.cles.push(...cles)
		attente.stockage ??= stockage
		return
	}
	await deplacer(req, stockage, cles, sujet)
}

/**
 * Runs `travail`, holding back every move to the bin it asks for, then moves them all at once, as
 * the last step: when `travail` fails, nothing has moved; when the storage fails, nothing stays
 * moved. A deletion that takes several documents with it (a profile and its photos, an account and
 * its profile) runs in here, so that its objects move after the last document is written.
 *
 * The holds of one request run one inside the other, never side by side: a failed `travail` drops
 * every move asked since it began. Payload would run them side by side for the documents of one
 * operation on several at once, which `unALaFois` refuses on `media` and `profils`.
 */
export async function corbeilleRetenue<T>(req: PayloadRequest, sujet: string, travail: () => Promise<T>): Promise<T> {
	const attente = ATTENTES.get(req) ?? { cles: [], retenue: 0, stockage: undefined }
	ATTENTES.set(req, attente)
	const debut = attente.cles.length
	attente.retenue += 1
	let resultat: T
	try {
		resultat = await travail()
	} catch (erreur) {
		attente.cles.length = debut
		throw erreur
	} finally {
		attente.retenue -= 1
	}
	if (attente.retenue === 0) await deplacer(req, attente.stockage, attente.cles.splice(0), sujet)
	return resultat
}

/** The photos of a profile, main photo first, by identifier: the profile as Payload hands it, populated or not. */
const photosDuProfil = (profil: { mainPicture?: unknown; gallery?: unknown } | undefined): (number | string)[] => [
	...photosNommees(profil?.mainPicture),
	...photosNommees(profil?.gallery),
]

/**
 * Which of these media something still references: a profile, by its main photo or its gallery; an
 * article, by its gallery, in its current state or in any of its versions (a published version, a
 * draft, a version an admin may restore). Read in the transaction of the request, without access
 * control.
 */
async function encoreReferencees(req: PayloadRequest, ids: (number | string)[]): Promise<Set<string>> {
	const lecture = { depth: 0, overrideAccess: true, pagination: false, req } as const
	const [profils, articles, versions] = await Promise.all([
		req.payload.find({
			...lecture,
			collection: 'profiles',
			select: { mainPicture: true, gallery: true },
			where: { or: [{ mainPicture: { in: ids } }, { gallery: { in: ids } }] },
		}),
		req.payload.find({
			...lecture,
			collection: 'articles',
			select: { gallery: true },
			where: { gallery: { in: ids } },
		}),
		req.payload.findVersions({ ...lecture, collection: 'articles', where: { 'version.gallery': { in: ids } } }),
	])
	return new Set(
		[
			...profils.docs.flatMap(photosDuProfil),
			...articles.docs.flatMap(({ gallery }) => photosNommees(gallery)),
			...versions.docs.flatMap(({ version }) => photosNommees(version?.gallery)),
		].map(String)
	)
}

/**
 * The clean-up of a profile: each of these media that nothing references any more is deleted, and
 * its objects go to the bin, all at once after the last deletion. A media that no longer exists is
 * left alone. Without a storage, no media is deleted: its object could not move, and the record is
 * all that would still say where it is.
 */
async function menage(
	req: PayloadRequest,
	stockage: StockageDesObjets | undefined,
	candidates: (number | string)[],
	sujet: string
): Promise<void> {
	const ids = [...new Map(candidates.map(id => [String(id), id])).values()]
	if (ids.length === 0) return
	if (!stockage) {
		req.payload.logger.warn(
			`[corbeille] ${sujet}: no object storage, the clean-up is skipped and ${ids.length} media kept`
		)
		return
	}
	const referencees = await encoreReferencees(req, ids)
	const inutiles = ids.filter(id => !referencees.has(String(id)))
	if (inutiles.length === 0) return
	const { docs } = await req.payload.find({
		collection: 'media',
		depth: 0,
		overrideAccess: true,
		pagination: false,
		req,
		select: { filename: true },
		where: { id: { in: inutiles } },
	})
	await corbeilleRetenue(req, sujet, async () => {
		// One by one: a deletion that fails throws, where a deletion of several would only list it.
		for (const { id } of docs)
			await req.payload.delete({ collection: 'media', id, depth: 0, overrideAccess: true, req })
	})
}

/** `afterChange` of `profils`: the photos a save takes out of the profile go through the clean-up. */
export const menageApresEnregistrement =
	(stockage: StockageDesObjets | undefined): CollectionAfterChangeHook =>
	async ({ context, doc, operation, previousDoc, req }) => {
		if (operation !== 'update' || estUnImport(context)) return doc
		const gardees = new Set(photosDuProfil(doc).map(String))
		const retirees = photosDuProfil(previousDoc).filter(id => !gardees.has(String(id)))
		await menage(req, stockage, retirees, `profile ${doc.id}`)
		return doc
	}

/** `afterDelete` of `profils`: its photos, and every photo of its account, go through the clean-up. */
export const menageApresSuppression =
	(stockage: StockageDesObjets | undefined): CollectionAfterDeleteHook =>
	async ({ context, doc, id, req }) => {
		if (estUnImport(context)) return doc
		const compte = identifiantDe((doc as { pro?: unknown }).pro)
		const duCompte =
			compte === undefined || !stockage
				? []
				: (
						await req.payload.find({
							collection: 'media',
							depth: 0,
							overrideAccess: true,
							pagination: false,
							req,
							select: { owner: true },
							where: { owner: { equals: compte } },
						})
					).docs.map(media => media.id)
		await menage(req, stockage, [...photosDuProfil(doc), ...duCompte], `profile ${id}`)
		return doc
	}

/**
 * `beforeDelete` of `pros`: every photo of the account that nothing references goes through the
 * clean-up, before the database clears its owner. An account with a profile has them taken by the
 * deletion of the profile; this is for an account without one (ticket 167: no orphan photo).
 */
export const menageAvantSuppressionDuCompte =
	(stockage: StockageDesObjets | undefined): CollectionBeforeDeleteHook =>
	async ({ context, id, req }) => {
		if (estUnImport(context) || !stockage) return
		const { docs } = await req.payload.find({
			collection: 'media',
			depth: 0,
			overrideAccess: true,
			pagination: false,
			req,
			select: {},
			where: { owner: { equals: id } },
		})
		await menage(
			req,
			stockage,
			docs.map(media => media.id),
			`account ${id}`
		)
	}

/**
 * `beforeOperation` of `media` and `profils`: a deletion or a change goes one document at a time,
 * by its identifier. An operation on several at once (by a `where`) is refused before anything is
 * read or written, whoever asks and by every API, the Local API without access control included:
 * Payload would commit it even when the storage fails for one of its documents. The import, which
 * moves nothing, writes as it likes.
 */
export const unALaFois: CollectionBeforeOperationHook = ({ args, context, operation }) => {
	if (estUnImport(context) || (operation !== 'delete' && operation !== 'update')) return args
	if ((args as { id?: unknown }).id !== undefined) return args
	throw new APIError(MESSAGE_UN_A_LA_FOIS, 403, null, true)
}

/** `afterDelete` of `media`: its objects go to the bin. */
export const aLaSuppression =
	(stockage: StockageDesObjets | undefined): CollectionAfterDeleteHook =>
	async ({ context, doc, id, req }) => {
		if (estUnImport(context)) return doc
		await versLaCorbeille(req, stockage, clesDesObjets(doc as ObjetsDUnMedia), `media ${id}`)
		return doc
	}

/**
 * `afterChange` of `media`: when its file is replaced, the objects of the former file go to the
 * bin. It comes after the hook of the storage plugin, once the new file is written. An internal
 * write of the plugin (`skipCloudStorage`) moves nothing: it does not change the file.
 */
export const auRemplacement =
	(stockage: StockageDesObjets | undefined): CollectionAfterChangeHook =>
	async ({ context, doc, operation, previousDoc, req }) => {
		if (operation !== 'update' || estUnImport(context) || context.skipCloudStorage) return doc
		const gardees = new Set(clesDesObjets(doc as ObjetsDUnMedia))
		const anciennes = clesDesObjets(previousDoc as ObjetsDUnMedia).filter(cle => !gardees.has(cle))
		await versLaCorbeille(req, stockage, anciennes, `media ${doc.id}`)
		return doc
	}

type Crochets = NonNullable<CollectionConfig['hooks']>

/** Hides the former document from a hook of the storage plugin: it then uploads, and deletes nothing. */
const sansDocumentPrecedent =
	(crochet: CollectionAfterChangeHook): CollectionAfterChangeHook =>
	args =>
		crochet({ ...args, previousDoc: undefined as unknown as typeof args.previousDoc })

/**
 * Takes the deletions of the storage plugin away from a collection: its `afterDelete` hooks, which
 * delete the objects of a deleted document, are dropped; its `afterChange` hooks, which upload a new
 * file and then delete the former one, no longer see the former document. `avant` is the collection
 * before the plugin: a hook it already had is left as it is.
 */
export function sansSuppressionDuGreffon(collection: CollectionConfig, avant: Crochets | undefined): CollectionConfig {
	const ajoutes = (nom: 'afterChange' | 'afterDelete'): Set<unknown> =>
		new Set((collection.hooks?.[nom] ?? []).filter(crochet => !(avant?.[nom] ?? []).some(ancien => ancien === crochet)))
	const [deChangement, deSuppression] = [ajoutes('afterChange'), ajoutes('afterDelete')]
	if (deChangement.size === 0 && deSuppression.size === 0) return collection
	return {
		...collection,
		hooks: {
			...collection.hooks,
			afterChange: (collection.hooks?.afterChange ?? []).map(crochet =>
				deChangement.has(crochet) ? sansDocumentPrecedent(crochet) : crochet
			),
			afterDelete: (collection.hooks?.afterDelete ?? []).filter(crochet => !deSuppression.has(crochet)),
		},
	}
}

/**
 * Gives a collection the bin: one document at a time first, before its own `beforeOperation`
 * hooks; these hooks after its own `afterChange` and `afterDelete`, so that the bin comes last.
 * The list view of the admin panel no longer offers to delete or change several documents at once
 * (`disableBulkDelete`, `disableBulkEdit`): Payload then refuses it by REST too, before `unALaFois`.
 */
const avecLesCrochets = (
	collection: CollectionConfig,
	crochets: Pick<Crochets, 'afterChange' | 'afterDelete'>
): CollectionConfig => ({
	...collection,
	disableBulkDelete: true,
	disableBulkEdit: true,
	hooks: {
		...collection.hooks,
		beforeOperation: [unALaFois, ...(collection.hooks?.beforeOperation ?? [])],
		afterChange: [...(collection.hooks?.afterChange ?? []), ...(crochets.afterChange ?? [])],
		afterDelete: [...(collection.hooks?.afterDelete ?? []), ...(crochets.afterDelete ?? [])],
	},
})

/**
 * The storage plugin (`greffon`, `@payloadcms/storage-s3`), with the bin in place of its
 * deletions: its own deletions are taken away from every collection it touches, then `media` and
 * `profils` get the bin (`avecLesCrochets`). `stockage` is the storage the bin moves the objects
 * in, or nothing when the application has none.
 */
export const avecLaCorbeille =
	(greffon: Plugin, stockage: StockageDesObjets | undefined): Plugin =>
	async config => {
		const avant = new Map((config.collections ?? []).map(collection => [collection.slug, collection.hooks]))
		const configuree = await greffon(config)
		return {
			...configuree,
			collections: (configuree.collections ?? []).map(collection => {
				const sans = sansSuppressionDuGreffon(collection, avant.get(collection.slug))
				if (sans.slug === 'media')
					return avecLesCrochets(sans, {
						afterChange: [auRemplacement(stockage)],
						afterDelete: [aLaSuppression(stockage)],
					})
				if (sans.slug === 'profiles')
					return avecLesCrochets(sans, {
						afterChange: [menageApresEnregistrement(stockage)],
						afterDelete: [menageApresSuppression(stockage)],
					})
				if (sans.slug === 'pros')
					return {
						...sans,
						hooks: {
							...sans.hooks,
							beforeDelete: [...(sans.hooks?.beforeDelete ?? []), menageAvantSuppressionDuCompte(stockage)],
						},
					}
				return sans
			}),
		}
	}
