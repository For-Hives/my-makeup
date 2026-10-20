/**
 * The bin of the object storage (plan 01 §1.8; ticket 045; docs/migration/SCHEMA.md, §8).
 *
 * The application never erases an object. A photo that no longer serves moves, with each of its
 * derived sizes, under `deleted/`, at the same key behind it: `media/a1b2.webp` becomes
 * `deleted/media/a1b2.webp`. A rule of the storage erases what is there 30 days later (set in R2
 * by hand, ticket 205); until then, `remettreEnPlace` puts an object back where it was.
 *
 * A move is a copy into the bin, a check that the copy has the size of the original, and only then
 * the removal of the original (`retirer`): the only removal in the whole application. An object
 * is always in one of the two places, and its bytes are never lost.
 *
 * Should the storage fail in the middle of a move, what has already moved is put back, each object
 * tried once, and the error goes up (`PanneDuStockage`): the caller then leaves its documents as
 * they were, so that no document names an object that has gone.
 *
 * No Payload and no S3 client here: the storage is an interface (`StockageDesObjets`), which
 * src/lib/storage.ts gives for R2 and the simulator of the bench, and a test for its fake.
 */

// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { cleDuMedia } from './media'

/** The folder of the bin, at the root of the storage. */
export const PREFIXE_DE_LA_CORBEILLE = 'deleted'

/** Where the object of this key waits in the bin. */
export const cleEnCorbeille = (cle: string): string => `${PREFIXE_DE_LA_CORBEILLE}/${cle}`

/** True for the key of an object that is already in the bin. */
export const estEnCorbeille = (cle: string): boolean => cle.startsWith(`${PREFIXE_DE_LA_CORBEILLE}/`)

/** What the bin needs from a storage, and nothing more. */
export interface StockageDesObjets {
	/** The size in bytes of the object of this key; nothing when the storage holds no such object. Throws when the storage fails. */
	taille(cle: string): Promise<number | undefined>
	/** Copies the object of `source` to `destination`, in place of the object that had that key. */
	copier(source: string, destination: string): Promise<void>
	/** Removes the object of this key. Called by `deplacerVersLaCorbeille` only, once the copy in the bin is checked. */
	retirer(cle: string): Promise<void>
}

/** What a media says about where its objects are: its prefix, its file name, and the name of each derived size. */
export interface ObjetsDUnMedia {
	prefix?: string | null
	/** The folder of a photo sent straight from a browser, under its prefix (`@payloadcms/storage-s3`): unused today. */
	_objectKey?: string | null
	filename?: string | null
	sizes?: Record<string, { filename?: string | null } | null | undefined> | null
}

/**
 * The keys of the objects of a media: the original, then each derived size, all in its folder, as
 * its public address names them (`cleDuMedia`, src/lib/media.ts). No key twice, none for an empty
 * name. The thumbnails of the old site (`strapiFormats`) are not among them: they stay where they
 * are, and the control of the media before any purge counts them (tickets 197 and 205).
 */
export function clesDesObjets(media: ObjetsDUnMedia): string[] {
	const dossier = [media.prefix, media._objectKey]
		.filter(partie => typeof partie === 'string' && partie !== '')
		.join('/')
	const noms = [media.filename, ...Object.values(media.sizes ?? {}).map(taille => taille?.filename)]
	const cles = noms
		.filter((nom): nom is string => typeof nom === 'string' && nom !== '')
		.map(nom => cleDuMedia(dossier, nom))
	return [...new Set(cles)]
}

/** What a move did. */
export interface Bilan {
	/** Moved to the bin. */
	deplacees: string[]
	/** No object under this key: nothing to move (an object missing since the old site, for one). */
	absentes: string[]
	/** Already in the bin: left there. */
	dejaEnCorbeille: string[]
}

/** What putting objects back did. Each object is tried once, never again. */
export interface BilanDeRemise {
	/** Back where it was, or already there. */
	remises: string[]
	/** Still in the bin: the storage failed, or the bin holds no copy of it. */
	nonRemises: string[]
}

/**
 * The storage failed during a move: the objects already moved were put back, each tried once.
 * Its message names no key: a key of the old site may hold the name of the file someone sent.
 */
export class PanneDuStockage extends Error {
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
 * (`remettreEnPlace`), and `PanneDuStockage` is thrown.
 */
export async function deplacerVersLaCorbeille(stockage: StockageDesObjets, cles: readonly string[]): Promise<Bilan> {
	const bilan: Bilan = { deplacees: [], absentes: [], dejaEnCorbeille: [] }
	// Every key whose copy in the bin is checked: the original may be gone, even when the storage
	// failed on its removal (a removal done, whose answer was lost).
	const copiees: string[] = []
	try {
		for (const cle of new Set(cles)) {
			if (estEnCorbeille(cle)) {
				bilan.dejaEnCorbeille.push(cle)
				continue
			}
			const taille = await stockage.taille(cle)
			if (taille === undefined) {
				bilan.absentes.push(cle)
				continue
			}
			const destination = cleEnCorbeille(cle)
			await stockage.copier(cle, destination)
			const copie = await stockage.taille(destination)
			if (copie !== taille)
				throw new Error(
					`The copy in the bin has ${copie ?? 'no'} byte(s), the original ${taille}: the original is kept.`
				)
			copiees.push(cle)
			await stockage.retirer(cle)
			bilan.deplacees.push(cle)
		}
	} catch (erreur) {
		const { remises, nonRemises } = await remettreEnPlace(stockage, copiees.reverse())
		throw new PanneDuStockage(erreur, remises, nonRemises)
	}
	return bilan
}

/**
 * Puts these objects back where they were, from their copy in the bin: a copy back, checked by its
 * size. An object already in its place is left alone. The copy in the bin stays, and the rule of
 * the storage erases it in its time: nothing is removed here.
 *
 * Each object is tried once, never again; this function never throws. What could not be put back
 * is listed in `nonRemises`.
 */
export async function remettreEnPlace(stockage: StockageDesObjets, cles: readonly string[]): Promise<BilanDeRemise> {
	const bilan: BilanDeRemise = { remises: [], nonRemises: [] }
	for (const cle of new Set(cles)) {
		try {
			if ((await stockage.taille(cle)) !== undefined) {
				bilan.remises.push(cle)
				continue
			}
			const enCorbeille = cleEnCorbeille(cle)
			const taille = await stockage.taille(enCorbeille)
			if (taille === undefined) {
				bilan.nonRemises.push(cle)
				continue
			}
			await stockage.copier(enCorbeille, cle)
			if ((await stockage.taille(cle)) === taille) bilan.remises.push(cle)
			else bilan.nonRemises.push(cle)
		} catch {
			bilan.nonRemises.push(cle)
		}
	}
	return bilan
}
