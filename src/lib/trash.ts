/**
 * The bin of the object storage (plan 01 §1.8; ticket 045; docs/migration/SCHEMA.md, §8).
 *
 * The application never erases an object. A photo that no longer serves moves, with each of its
 * derived sizes, under `deleted/`, at the same key behind it: `media/a1b2.webp` becomes
 * `deleted/media/a1b2.webp`. A rule of the storage erases what is there 30 days later (set in R2
 * by hand, ticket 205); until then, `restore` puts an object back where it was.
 *
 * A move is a copy into the bin, a check that the copy has the size of the original, and only then
 * the removal of the original (`retirer`): the only removal in the whole application. An object
 * is always in one of the two places, and its bytes are never lost.
 *
 * Should the storage fail in the middle of a move, what has already moved is put back, each object
 * tried once, and the error goes up (`StorageOutage`): the caller then leaves its documents as
 * they were, so that no document names an object that has gone.
 *
 * No Payload and no S3 client here: the storage is an interface (`ObjectStorage`), which
 * src/lib/storage.ts gives for R2 and the simulator of the bench, and a test for its fake.
 */

// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { mediaKey } from './media'

/** The folder of the bin, at the root of the storage. */
export const TRASH_PREFIX = 'deleted'

/** Where the object of this key waits in the bin. */
export const trashKey = (cle: string): string => `${TRASH_PREFIX}/${cle}`

/** True for the key of an object that is already in the bin. */
export const isInTrash = (cle: string): boolean => cle.startsWith(`${TRASH_PREFIX}/`)

/** What the bin needs from a storage, and nothing more. */
export interface ObjectStorage {
	/** The size in bytes of the object of this key; nothing when the storage holds no such object. Throws when the storage fails. */
	taille(cle: string): Promise<number | undefined>
	/** Copies the object of `source` to `destination`, in place of the object that had that key. */
	copier(source: string, destination: string): Promise<void>
	/** Removes the object of this key. Called by `moveToTrash` only, once the copy in the bin is checked. */
	retirer(cle: string): Promise<void>
}

/** What a media says about where its objects are: its prefix, its file name, and the name of each derived size. */
export interface MediaObjects {
	prefix?: string | null
	/** The folder of a photo sent straight from a browser, under its prefix (`@payloadcms/storage-s3`): unused today. */
	_objectKey?: string | null
	filename?: string | null
	sizes?: Record<string, { filename?: string | null } | null | undefined> | null
}

/**
 * The keys of the objects of a media: the original, then each derived size, all in its folder, as
 * its public address names them (`mediaKey`, src/lib/media.ts). No key twice, none for an empty
 * name. The thumbnails of the old site (`strapiFormats`) are not among them: they stay where they
 * are, and the control of the media before any purge counts them (tickets 197 and 205).
 */
export function objectKeys(media: MediaObjects): string[] {
	const folder = [media.prefix, media._objectKey]
		.filter(partie => typeof partie === 'string' && partie !== '')
		.join('/')
	const names = [media.filename, ...Object.values(media.sizes ?? {}).map(taille => taille?.filename)]
	const keys = names
		.filter((nom): nom is string => typeof nom === 'string' && nom !== '')
		.map(nom => mediaKey(folder, nom))
	return [...new Set(keys)]
}

/** What a move did. */
export interface Summary {
	/** Moved to the bin. */
	deplacees: string[]
	/** No object under this key: nothing to move (an object missing since the old site, for one). */
	absentes: string[]
	/** Already in the bin: left there. */
	dejaEnCorbeille: string[]
}

/** What putting objects back did. Each object is tried once, never again. */
export interface RestoreSummary {
	/** Back where it was, or already there. */
	remises: string[]
	/** Still in the bin: the storage failed, or the bin holds no copy of it. */
	nonRemises: string[]
}

/**
 * The storage failed during a move: the objects already moved were put back, each tried once.
 * Its message names no key: a key of the old site may hold the name of the file someone sent.
 */
export class StorageOutage extends Error {
	override readonly name = 'PanneDuStockage'

	constructor(
		cause: unknown,
		/** Moved before the failure, and back in place since, or never gone. */
		readonly remises: readonly string[],
		/** Moved before the failure and not put back: they wait in the bin. */
		readonly nonRemises: readonly string[]
	) {
		super(
			`The object storage failed during a move to the bin: ${remises.length} object(s) put back, ${nonRemises.length} left in the bin.`,
			{ cause }
		)
	}
}

/**
 * Moves these objects to the bin, one after the other: copy, check of the size of the copy, then
 * removal of the original. An object the storage does not hold is not an error: there is nothing
 * to move. When the storage fails, the objects whose copy was made are put back, once
 * (`restore`), and `StorageOutage` is thrown.
 */
export async function moveToTrash(stockage: ObjectStorage, cles: readonly string[]): Promise<Summary> {
	const summary: Summary = { deplacees: [], absentes: [], dejaEnCorbeille: [] }
	// Every key whose copy in the bin is checked: the original may be gone, even when the storage
	// failed on its removal (a removal done, whose answer was lost).
	const copied: string[] = []
	try {
		for (const key of new Set(cles)) {
			if (isInTrash(key)) {
				summary.dejaEnCorbeille.push(key)
				continue
			}
			const size = await stockage.taille(key)
			if (size === undefined) {
				summary.absentes.push(key)
				continue
			}
			const destination = trashKey(key)
			await stockage.copier(key, destination)
			const copy = await stockage.taille(destination)
			if (copy !== size)
				throw new Error(`The copy in the bin has ${copy ?? 'no'} byte(s), the original ${size}: the original is kept.`)
			copied.push(key)
			await stockage.retirer(key)
			summary.deplacees.push(key)
		}
	} catch (error) {
		const { remises: restored, nonRemises: notRestored } = await restore(stockage, copied.reverse())
		throw new StorageOutage(error, restored, notRestored)
	}
	return summary
}

/**
 * Puts these objects back where they were, from their copy in the bin: a copy back, checked by its
 * size. An object already in its place is left alone. The copy in the bin stays, and the rule of
 * the storage erases it in its time: nothing is removed here.
 *
 * Each object is tried once, never again; this function never throws. What could not be put back
 * is listed in `nonRemises`.
 */
export async function restore(stockage: ObjectStorage, cles: readonly string[]): Promise<RestoreSummary> {
	const summary: RestoreSummary = { remises: [], nonRemises: [] }
	for (const key of new Set(cles)) {
		try {
			if ((await stockage.taille(key)) !== undefined) {
				summary.remises.push(key)
				continue
			}
			const inTrash = trashKey(key)
			const size = await stockage.taille(inTrash)
			if (size === undefined) {
				summary.nonRemises.push(key)
				continue
			}
			await stockage.copier(inTrash, key)
			if ((await stockage.taille(key)) === size) summary.remises.push(key)
			else summary.nonRemises.push(key)
		} catch {
			summary.nonRemises.push(key)
		}
	}
	return summary
}
