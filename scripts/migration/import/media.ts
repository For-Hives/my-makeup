/**
 * The files of the old site, `files` → `media` (docs/migration/SCHEMA.md §4.3 and §8; ticket 058):
 * each file a profile or an article the import takes designates becomes a media, adopted where it
 * is. Its object is never copied, moved nor renamed, and nothing is written in the storage: the
 * document names the object by the prefix and the name read in the address of the file, so that
 * the public address the v3 gives is the address of the old site, character for character.
 *
 * - **Adopted**: the images (JPEG, PNG, WebP, GIF, AVIF) designated by an entry the import takes:
 *   the main picture or the gallery of a profile, the gallery of an article. A file no such entry
 *   designates (linked to an entry the source no longer holds, to an entry set aside, or to
 *   nothing) is not adopted: no orphan (plan 02, I39).
 * - **A file that is not an image** is reported and not adopted (register,
 *   `fichiers-non-images-non-repris`).
 * - **The storage is read by requests for headers only** (`HEAD`), before any write: whether the
 *   object exists, and its size in bytes, which replaces the rounded size of Strapi (SCHEMA.md §8,
 *   `size`). An object the storage does not hold is adopted all the same and listed among the
 *   « 404 connus »: its profile keeps its photo, as on the old site. Any other answer, or none,
 *   stops the import before any write.
 * - **Refused, listed by identifier** (rule 5, ticket 066): a file whose address is not the base of
 *   the photos followed by a key the v3 gives back character for character, and a file designated
 *   by the entries of several accounts (a photo belongs to one account only, ticket 043).
 * - **The owner** is the account of the profile that designates the file; a file of an article
 *   has none. `uploaded_by` is a check only: a file it says another account sent is reported. So
 *   is a file whose object is not named `hash` followed by `ext`.
 *
 * Nothing here prints an address or a name of file: the key of an object may carry the name of a
 * person. A file is named by its identifier in the old base.
 *
 * No `bun` import here: the import can run under Node too.
 */

import { isImage } from '../../../src/lib/articles'
import { mediaUrl } from '../../../src/lib/media'
import type { Adapter, Expected, Gap, Refusal } from './engine'
import { REFERENCES } from './gaps'
import { iso, type Query } from './source'
import { ImportRefuse } from './target'

/** The type Strapi gives a profile, then an article, in the links of its files. */
export const PROFILE_TYPE = 'api::makeup-artiste.makeup-artiste'
export const TYPE_ARTICLE = 'api::article.article'

/** The fields of an entry that designate a file, by type of entry (SCHEMA.md §5.2 and §5.3). */
export const PHOTOS_FIELDS: Readonly<Record<string, readonly string[]>> = {
	[PROFILE_TYPE]: ['main_picture', 'image_gallery'],
	[TYPE_ARTICLE]: ['galery'],
}

/** A row of `files`, as the import reads it. `formats` is the JSON of Strapi, as text. */
export interface FileRow {
	id: number
	alternative_text: string | null
	width: number | null
	height: number | null
	formats: string | null
	hash: string | null
	ext: string | null
	mime: string | null
	url: string | null
	uploaded_by: number | null
	created_at: string
	updated_at: string
}

/** A row of `files_related_morphs`: the file `fichier` is designated by the entry `entree` of `type`, in its field `champ`. */
export interface FileLink {
	fichier: number
	entree: number
	type: string
	champ: string
}

export interface ReadFiles {
	fichiers: FileRow[]
	/** In the order of each field of each entry (`order`, then the link). */
	liens: FileLink[]
}

// The JSON of the formats is read as text: both clients of the import then give the same value.
const FILES_QUERY = `SELECT id, alternative_text, width, height, formats::text AS formats, hash, ext, mime, url,
	uploaded_by, ${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at FROM files ORDER BY id`

const LINKS_QUERY = `SELECT file_id AS fichier, related_id AS entree, related_type AS type, field AS champ
	FROM files_related_morphs ORDER BY related_type, related_id, field, "order", id`

export async function readFiles(requete: Query): Promise<ReadFiles> {
	const files = await requete<FileRow>(FILES_QUERY)
	const links = await requete<FileLink>(LINKS_QUERY)
	return {
		fichiers: files,
		liens: links.map(({ fichier: file, entree, type, champ }) => ({
			fichier: Number(file),
			entree: Number(entree),
			type,
			champ,
		})),
	}
}

/** Whether a link designates a file through a field the import reads. */
export const photoLink = ({ type, champ }: Pick<FileLink, 'type' | 'champ'>): boolean =>
	PHOTOS_FIELDS[type]?.includes(champ) ?? false

/** Where an object is, as a `media` names it: its folder (empty at the root of the storage) and its name. */
export interface Location {
	prefix: string
	filename: string
}

/**
 * The prefix and the name of the object an address names, read after the base of the photos: the
 * folders, then the name. Null when the address does not start with the base, or when the address
 * the v3 composes again from them (`mediaUrl`) is not the same, character for character: a
 * query, an empty folder, a character the v3 would write another way.
 */
export function locationInAddress(adresse: string | null, base: string): Location | null {
	if (adresse === null || !adresse.startsWith(`${base}/`)) return null
	let segments: string[]
	try {
		segments = adresse
			.slice(base.length + 1)
			.split('/')
			.map(segment => decodeURIComponent(segment))
	} catch {
		return null
	}
	const filename = segments.at(-1) ?? ''
	if (filename === '' || segments.some(segment => segment === '')) return null
	const prefix = segments.slice(0, -1).join('/')
	return mediaUrl(base, prefix, filename) === adresse ? { prefix, filename } : null
}

/** Why a designated file is not adopted. */
export type NonAdoptionReason = 'pas-une-image' | 'sans-stockage' | 'compte-refuse'

/** Why a designated file is refused: it waits for a decision (ticket 066). */
export type RefusalReason = 'adresse-hors-de-la-base' | 'plusieurs-proprietaires'

/** What the entries the import takes are: the profiles with their account, the articles. */
export interface TakenEntries {
	/** Profile of the source taken → its account in the old base. */
	profils: ReadonlyMap<number, number>
	articles: ReadonlySet<number>
	/** Every profile and every article the source holds, taken or not. */
	profilsDeLaSource: ReadonlySet<number>
	articlesDeLaSource: ReadonlySet<number>
}

/** A file to adopt: its row, where its object is, and the account it belongs to in the old base (none for an article). */
export interface Adoptable {
	fichier: FileRow
	emplacement: Location
	compte: number | null
}

/** What the import makes of the files of the source, before it reads the storage. */
export interface FilesClassification {
	source: number
	adoptables: Adoptable[]
	/** Designated, not adopted by rule: listed. */
	nonAdoptes: { fichier: number; motif: NonAdoptionReason }[]
	/** Designated, refused: listed, they wait for a decision. */
	refuses: Refusal[]
	/** Files an entry the import takes designates. */
	designes: number
	/** Files designated only by an entry the source holds and the import does not take (a profile set aside). */
	deEntreesNonPrises: number
	/** Files linked only to an entry the source no longer holds, or by a field the import does not read. */
	deEntreesDisparues: number
	/** Files no link names. */
	sansLien: number
	/** Adopted files whose object is not named `hash` followed by `ext`. */
	nomsDifferents: number[]
	/** Adopted files `uploaded_by` says another account sent. */
	envoyesParUnAutreCompte: number[]
}

/**
 * Splits the files of the source: adopted, not adopted, refused, or designated by no entry the
 * import takes. `base` is the public base of the photos, `null` when the run has no storage:
 * then no file is adopted.
 */
export function classifyFiles(lus: ReadFiles, entrees: TakenEntries, base: string | null): FilesClassification {
	const classification: FilesClassification = {
		source: lus.fichiers.length,
		adoptables: [],
		nonAdoptes: [],
		refuses: [],
		designes: 0,
		deEntreesNonPrises: 0,
		deEntreesDisparues: 0,
		sansLien: 0,
		nomsDifferents: [],
		envoyesParUnAutreCompte: [],
	}
	const linksOf = new Map<number, FileLink[]>()
	for (const link of lus.liens) linksOf.set(link.fichier, [...(linksOf.get(link.fichier) ?? []), link])
	const taken = (lien: FileLink): boolean =>
		photoLink(lien) &&
		(lien.type === PROFILE_TYPE ? entrees.profils.has(lien.entree) : entrees.articles.has(lien.entree))
	const present = (lien: FileLink): boolean =>
		photoLink(lien) &&
		(lien.type === PROFILE_TYPE ? entrees.profilsDeLaSource : entrees.articlesDeLaSource).has(lien.entree)

	for (const file of [...lus.fichiers].sort((a, b) => a.id - b.id)) {
		const links = linksOf.get(file.id) ?? []
		const pointing = links.filter(taken)
		if (pointing.length === 0) {
			if (links.length === 0) classification.sansLien++
			else if (links.some(present)) classification.deEntreesNonPrises++
			else classification.deEntreesDisparues++
			continue
		}
		classification.designes++
		if (!isImage(file.mime)) {
			classification.nonAdoptes.push({ fichier: file.id, motif: 'pas-une-image' })
			continue
		}
		if (base === null) {
			classification.nonAdoptes.push({ fichier: file.id, motif: 'sans-stockage' })
			continue
		}
		// The account of each entry that designates it: an article has none.
		const accounts = new Set(
			pointing.map(({ type, entree }) => (type === PROFILE_TYPE ? (entrees.profils.get(entree) ?? null) : null))
		)
		if (accounts.size > 1) {
			classification.refuses.push({ strapiId: file.id, motif: 'plusieurs-proprietaires', champs: ['owner'] })
			continue
		}
		const location = locationInAddress(file.url, base)
		if (!location) {
			classification.refuses.push({
				strapiId: file.id,
				motif: 'adresse-hors-de-la-base',
				champs: ['prefix', 'filename'],
			})
			continue
		}
		const account = [...accounts][0] ?? null
		if (location.filename !== `${file.hash ?? ''}${file.ext ?? ''}`) classification.nomsDifferents.push(file.id)
		if (file.uploaded_by !== null && file.uploaded_by !== account) classification.envoyesParUnAutreCompte.push(file.id)
		classification.adoptables.push({ fichier: file, emplacement: location, compte: account })
	}
	return classification
}

/** What a request for the headers of an object says: whether it exists, and its size in bytes when given. */
export interface Presence {
	present: boolean
	taille: number | null
}

/** Reads the headers of the object at this public address. Throws `ImportRefuse` on anything but 200 or 404. */
export type Probe = (adresse: string) => Promise<Presence>

/** How long a request for headers may take. */
const PROBE_TIMEOUT = 10_000

/**
 * The request for headers (`HEAD`) at the public address of an object, by `fetch`, never followed
 * to another address. 200: present, with its `Content-Length`; 404: absent. Anything else, a time
 * limit or no answer stops the import before any write: the storage cannot say what it holds.
 */
export const httpProbe: Probe = async adresse => {
	let response: Response
	try {
		response = await fetch(adresse, {
			method: 'HEAD',
			redirect: 'manual',
			signal: AbortSignal.timeout(PROBE_TIMEOUT),
		})
	} catch {
		throw new ImportRefuse(
			'Le stockage des photos ne répond pas à une requête d’en-tête, ou pas dans les 10 secondes : rien n’est écrit.'
		)
	}
	if (response.status === 404) return { present: false, taille: null }
	if (response.status !== 200)
		throw new ImportRefuse(
			`Le stockage des photos répond ${response.status} à une requête d’en-tête, ni 200 ni 404 : rien n’est écrit.`
		)
	const length = response.headers.get('content-length')
	return { present: true, taille: length !== null && /^\d{1,15}$/.test(length) ? Number(length) : null }
}

/** How many requests for headers leave at once. */
const FRONT_PROBES = 6

/** The presence of the object of each file to adopt, by its identifier, read before any write. */
export async function probeObjects(
	adoptables: readonly Adoptable[],
	base: string,
	sonde: Probe
): Promise<Map<number, Presence>> {
	const presences = new Map<number, Presence>()
	for (let start = 0; start < adoptables.length; start += FRONT_PROBES) {
		const batch = adoptables.slice(start, start + FRONT_PROBES)
		const read = await Promise.all(
			batch.map(({ emplacement: location }) => sonde(mediaUrl(base, location.prefix, location.filename)))
		)
		batch.forEach(({ fichier: file }, rang) => {
			const presence = read[rang]
			if (presence) presences.set(file.id, presence)
		})
	}
	return presences
}

/** The JSON of the formats of Strapi, kept as it is, or null when it does not read. */
function formatsOf(texte: string | null): unknown {
	if (texte === null) return null
	try {
		return JSON.parse(texte)
	} catch {
		return null
	}
}

export const MEDIA_ADAPTER: Adapter = {
	collection: 'media',
	champs: {
		alt: 'texte',
		filename: 'texte',
		prefix: 'texte',
		mimeType: 'texte',
		filesize: 'nombre',
		width: 'nombre',
		height: 'nombre',
		strapiFormats: 'json',
		owner: 'relation',
		createdAt: 'date',
		updatedAt: 'date',
	},
	// The storage plugin leaves the prefix and the storage alone: nothing is sent, nothing is moved.
	options: () => ({ contexte: { skipCloudStorage: true } }),
}

/**
 * The media the target must hold. `comptes` gives, for each account the import takes, its
 * identifier in Payload, or `null` while it is still to be created (a dry run). `presences` gives
 * what the storage said of each object.
 */
export function expectedMedia(
	adoptables: readonly Adoptable[],
	presences: ReadonlyMap<number, Presence>,
	comptes: ReadonlyMap<number, number | null>
): Expected[] {
	return adoptables.map(({ fichier: file, emplacement: location, compte: account }) => {
		const presence = presences.get(file.id)
		const gaps: Gap[] = [{ champ: 'filesize', reference: REFERENCES.tailleEnOctets }]
		return {
			strapiId: file.id,
			valeurs: {
				strapiId: file.id,
				alt: file.alternative_text,
				filename: location.filename,
				prefix: location.prefix,
				mimeType: file.mime,
				filesize: presence?.taille ?? null,
				width: file.width,
				height: file.height,
				strapiFormats: formatsOf(file.formats),
				owner: account === null ? null : (comptes.get(account) ?? null),
				createdAt: file.created_at,
				updatedAt: file.updated_at,
			},
			ecarts: gaps,
		}
	})
}

/** The files of the source in the report: numbers and identifiers, never an address. */
export interface FilesSummary {
	designes: number
	deEntreesNonPrises: number
	deEntreesDisparues: number
	sansLien: number
	/** No storage was given to the run: no file is adopted. */
	sansStockage: boolean
	nonAdoptes: { fichier: number; motif: NonAdoptionReason }[]
	/** Adopted, their object missing in the storage: the « 404 connus ». */
	introuvables: number[]
	nomsDifferents: number[]
	envoyesParUnAutreCompte: number[]
}

export function filesSummary(
	classement: FilesClassification,
	presences: ReadonlyMap<number, Presence>,
	sansStockage: boolean
): FilesSummary {
	return {
		designes: classement.designes,
		deEntreesNonPrises: classement.deEntreesNonPrises,
		deEntreesDisparues: classement.deEntreesDisparues,
		sansLien: classement.sansLien,
		sansStockage,
		nonAdoptes: classement.nonAdoptes,
		introuvables: classement.adoptables
			.filter(({ fichier: file }) => presences.get(file.id)?.present === false)
			.map(({ fichier: file }) => file.id),
		nomsDifferents: classement.nomsDifferents,
		envoyesParUnAutreCompte: classement.envoyesParUnAutreCompte,
	}
}

/** A photo of an entry whose file is not adopted: reported, never invented. */
export interface PhotoNotCarriedOver {
	/** The profile, or the article, by its identifier in the old base. */
	entree: number
	fichier: number
}

/**
 * The photos of an entry, as the target holds them: the media of each file it designates, in order,
 * when the file is adopted. A file not adopted (not an image, refused, no storage) is reported, never
 * invented: `nonReprises` lists it. `medias` gives the identifier in Payload of each adopted file,
 * `null` while it is still to be created (a dry run).
 */
export function entryPhotos(
	fichiers: readonly number[],
	medias: ReadonlyMap<number, number | null>
): { ids: number[]; adoptees: number; nonReprises: number[] } {
	const ids: number[] = []
	const notCarriedOver: number[] = []
	let adoptees = 0
	for (const file of fichiers) {
		if (!medias.has(file)) {
			notCarriedOver.push(file)
			continue
		}
		adoptees++
		const id = medias.get(file)
		if (id !== null && id !== undefined) ids.push(id)
	}
	return { ids, adoptees, nonReprises: notCarriedOver }
}
