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

import { estUneImage } from '../../../src/lib/articles'
import { adresseDuMedia } from '../../../src/lib/medias'
import { ImportRefuse } from './cible'
import { REFERENCES } from './ecarts'
import type { Adaptateur, Attendu, Ecart, Refus } from './moteur'
import { iso, type Requete } from './source'

/** The type Strapi gives a profile, then an article, in the links of its files. */
export const TYPE_PROFIL = 'api::makeup-artiste.makeup-artiste'
export const TYPE_ARTICLE = 'api::article.article'

/** The fields of an entry that designate a file, by type of entry (SCHEMA.md §5.2 and §5.3). */
export const CHAMPS_DE_PHOTOS: Readonly<Record<string, readonly string[]>> = {
	[TYPE_PROFIL]: ['main_picture', 'image_gallery'],
	[TYPE_ARTICLE]: ['galery'],
}

/** A row of `files`, as the import reads it. `formats` is the JSON of Strapi, as text. */
export interface LigneFichier {
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
export interface LienDeFichier {
	fichier: number
	entree: number
	type: string
	champ: string
}

export interface FichiersLus {
	fichiers: LigneFichier[]
	/** In the order of each field of each entry (`order`, then the link). */
	liens: LienDeFichier[]
}

// The JSON of the formats is read as text: both clients of the import then give the same value.
const LECTURE_DES_FICHIERS = `SELECT id, alternative_text, width, height, formats::text AS formats, hash, ext, mime, url,
	uploaded_by, ${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at FROM files ORDER BY id`

const LECTURE_DES_LIENS = `SELECT file_id AS fichier, related_id AS entree, related_type AS type, field AS champ
	FROM files_related_morphs ORDER BY related_type, related_id, field, "order", id`

export async function lireLesFichiers(requete: Requete): Promise<FichiersLus> {
	const fichiers = await requete<LigneFichier>(LECTURE_DES_FICHIERS)
	const liens = await requete<LienDeFichier>(LECTURE_DES_LIENS)
	return {
		fichiers,
		liens: liens.map(({ fichier, entree, type, champ }) => ({
			fichier: Number(fichier),
			entree: Number(entree),
			type,
			champ,
		})),
	}
}

/** Whether a link designates a file through a field the import reads. */
export const lienDePhoto = ({ type, champ }: Pick<LienDeFichier, 'type' | 'champ'>): boolean =>
	CHAMPS_DE_PHOTOS[type]?.includes(champ) ?? false

/** Where an object is, as a `media` names it: its folder (empty at the root of the storage) and its name. */
export interface Emplacement {
	prefix: string
	filename: string
}

/**
 * The prefix and the name of the object an address names, read after the base of the photos: the
 * folders, then the name. Null when the address does not start with the base, or when the address
 * the v3 composes again from them (`adresseDuMedia`) is not the same, character for character: a
 * query, an empty folder, a character the v3 would write another way.
 */
export function emplacementDansLAdresse(adresse: string | null, base: string): Emplacement | null {
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
	return adresseDuMedia(base, prefix, filename) === adresse ? { prefix, filename } : null
}

/** Why a designated file is not adopted. */
export type MotifDeNonAdoption = 'pas-une-image' | 'sans-stockage' | 'compte-refuse'

/** Why a designated file is refused: it waits for a decision (ticket 066). */
export type MotifDeRefus = 'adresse-hors-de-la-base' | 'plusieurs-proprietaires'

/** What the entries the import takes are: the profiles with their account, the articles. */
export interface EntreesPrises {
	/** Profile of the source taken → its account in the old base. */
	profils: ReadonlyMap<number, number>
	articles: ReadonlySet<number>
	/** Every profile and every article the source holds, taken or not. */
	profilsDeLaSource: ReadonlySet<number>
	articlesDeLaSource: ReadonlySet<number>
}

/** A file to adopt: its row, where its object is, and the account it belongs to in the old base (none for an article). */
export interface Adoptable {
	fichier: LigneFichier
	emplacement: Emplacement
	compte: number | null
}

/** What the import makes of the files of the source, before it reads the storage. */
export interface ClassementDesFichiers {
	source: number
	adoptables: Adoptable[]
	/** Designated, not adopted by rule: listed. */
	nonAdoptes: { fichier: number; motif: MotifDeNonAdoption }[]
	/** Designated, refused: listed, they wait for a decision. */
	refuses: Refus[]
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
 * import takes. `base` is the public base of the photos, `null` when the run has no storage (the
 * pre-production): then no file is adopted.
 */
export function classerLesFichiers(
	lus: FichiersLus,
	entrees: EntreesPrises,
	base: string | null
): ClassementDesFichiers {
	const classement: ClassementDesFichiers = {
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
	const liensDe = new Map<number, LienDeFichier[]>()
	for (const lien of lus.liens) liensDe.set(lien.fichier, [...(liensDe.get(lien.fichier) ?? []), lien])
	const pris = (lien: LienDeFichier): boolean =>
		lienDePhoto(lien) &&
		(lien.type === TYPE_PROFIL ? entrees.profils.has(lien.entree) : entrees.articles.has(lien.entree))
	const presente = (lien: LienDeFichier): boolean =>
		lienDePhoto(lien) &&
		(lien.type === TYPE_PROFIL ? entrees.profilsDeLaSource : entrees.articlesDeLaSource).has(lien.entree)

	for (const fichier of [...lus.fichiers].sort((a, b) => a.id - b.id)) {
		const liens = liensDe.get(fichier.id) ?? []
		const designants = liens.filter(pris)
		if (designants.length === 0) {
			if (liens.length === 0) classement.sansLien++
			else if (liens.some(presente)) classement.deEntreesNonPrises++
			else classement.deEntreesDisparues++
			continue
		}
		classement.designes++
		if (!estUneImage(fichier.mime)) {
			classement.nonAdoptes.push({ fichier: fichier.id, motif: 'pas-une-image' })
			continue
		}
		if (base === null) {
			classement.nonAdoptes.push({ fichier: fichier.id, motif: 'sans-stockage' })
			continue
		}
		// The account of each entry that designates it: an article has none.
		const comptes = new Set(
			designants.map(({ type, entree }) => (type === TYPE_PROFIL ? (entrees.profils.get(entree) ?? null) : null))
		)
		if (comptes.size > 1) {
			classement.refuses.push({ strapiId: fichier.id, motif: 'plusieurs-proprietaires', champs: ['owner'] })
			continue
		}
		const emplacement = emplacementDansLAdresse(fichier.url, base)
		if (!emplacement) {
			classement.refuses.push({
				strapiId: fichier.id,
				motif: 'adresse-hors-de-la-base',
				champs: ['prefix', 'filename'],
			})
			continue
		}
		const compte = [...comptes][0] ?? null
		if (emplacement.filename !== `${fichier.hash ?? ''}${fichier.ext ?? ''}`) classement.nomsDifferents.push(fichier.id)
		if (fichier.uploaded_by !== null && fichier.uploaded_by !== compte)
			classement.envoyesParUnAutreCompte.push(fichier.id)
		classement.adoptables.push({ fichier, emplacement, compte })
	}
	return classement
}

/** What a request for the headers of an object says: whether it exists, and its size in bytes when given. */
export interface Presence {
	present: boolean
	taille: number | null
}

/** Reads the headers of the object at this public address. Throws `ImportRefuse` on anything but 200 or 404. */
export type Sonde = (adresse: string) => Promise<Presence>

/** How long a request for headers may take. */
const DELAI_DE_LA_SONDE = 10_000

/**
 * The request for headers (`HEAD`) at the public address of an object, by `fetch`, never followed
 * to another address. 200: present, with its `Content-Length`; 404: absent. Anything else, a time
 * limit or no answer stops the import before any write: the storage cannot say what it holds.
 */
export const sondeHttp: Sonde = async adresse => {
	let reponse: Response
	try {
		reponse = await fetch(adresse, {
			method: 'HEAD',
			redirect: 'manual',
			signal: AbortSignal.timeout(DELAI_DE_LA_SONDE),
		})
	} catch {
		throw new ImportRefuse(
			'Le stockage des photos ne répond pas à une requête d’en-tête, ou pas dans les 10 secondes : rien n’est écrit.'
		)
	}
	if (reponse.status === 404) return { present: false, taille: null }
	if (reponse.status !== 200)
		throw new ImportRefuse(
			`Le stockage des photos répond ${reponse.status} à une requête d’en-tête, ni 200 ni 404 : rien n’est écrit.`
		)
	const longueur = reponse.headers.get('content-length')
	return { present: true, taille: longueur !== null && /^\d{1,15}$/.test(longueur) ? Number(longueur) : null }
}

/** How many requests for headers leave at once. */
const SONDES_DE_FRONT = 6

/** The presence of the object of each file to adopt, by its identifier, read before any write. */
export async function sonderLesObjets(
	adoptables: readonly Adoptable[],
	base: string,
	sonde: Sonde
): Promise<Map<number, Presence>> {
	const presences = new Map<number, Presence>()
	for (let debut = 0; debut < adoptables.length; debut += SONDES_DE_FRONT) {
		const lot = adoptables.slice(debut, debut + SONDES_DE_FRONT)
		const lues = await Promise.all(
			lot.map(({ emplacement }) => sonde(adresseDuMedia(base, emplacement.prefix, emplacement.filename)))
		)
		lot.forEach(({ fichier }, rang) => {
			const presence = lues[rang]
			if (presence) presences.set(fichier.id, presence)
		})
	}
	return presences
}

/** The JSON of the formats of Strapi, kept as it is, or null when it does not read. */
function formatsDe(texte: string | null): unknown {
	if (texte === null) return null
	try {
		return JSON.parse(texte)
	} catch {
		return null
	}
}

export const ADAPTATEUR_MEDIAS: Adaptateur = {
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
export function mediasAttendus(
	adoptables: readonly Adoptable[],
	presences: ReadonlyMap<number, Presence>,
	comptes: ReadonlyMap<number, number | null>
): Attendu[] {
	return adoptables.map(({ fichier, emplacement, compte }) => {
		const presence = presences.get(fichier.id)
		const ecarts: Ecart[] = [{ champ: 'filesize', reference: REFERENCES.tailleEnOctets }]
		return {
			strapiId: fichier.id,
			valeurs: {
				strapiId: fichier.id,
				alt: fichier.alternative_text,
				filename: emplacement.filename,
				prefix: emplacement.prefix,
				mimeType: fichier.mime,
				filesize: presence?.taille ?? null,
				width: fichier.width,
				height: fichier.height,
				strapiFormats: formatsDe(fichier.formats),
				owner: compte === null ? null : (comptes.get(compte) ?? null),
				createdAt: fichier.created_at,
				updatedAt: fichier.updated_at,
			},
			ecarts,
		}
	})
}

/** The files of the source in the report: numbers and identifiers, never an address. */
export interface BilanDesFichiers {
	designes: number
	deEntreesNonPrises: number
	deEntreesDisparues: number
	sansLien: number
	/** No storage was given to the run: no file is adopted. */
	sansStockage: boolean
	nonAdoptes: { fichier: number; motif: MotifDeNonAdoption }[]
	/** Adopted, their object missing in the storage: the « 404 connus ». */
	introuvables: number[]
	nomsDifferents: number[]
	envoyesParUnAutreCompte: number[]
}

export function bilanDesFichiers(
	classement: ClassementDesFichiers,
	presences: ReadonlyMap<number, Presence>,
	sansStockage: boolean
): BilanDesFichiers {
	return {
		designes: classement.designes,
		deEntreesNonPrises: classement.deEntreesNonPrises,
		deEntreesDisparues: classement.deEntreesDisparues,
		sansLien: classement.sansLien,
		sansStockage,
		nonAdoptes: classement.nonAdoptes,
		introuvables: classement.adoptables
			.filter(({ fichier }) => presences.get(fichier.id)?.present === false)
			.map(({ fichier }) => fichier.id),
		nomsDifferents: classement.nomsDifferents,
		envoyesParUnAutreCompte: classement.envoyesParUnAutreCompte,
	}
}

/** A photo of an entry whose file is not adopted: reported, never invented. */
export interface PhotoNonReprise {
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
export function photosDeLEntree(
	fichiers: readonly number[],
	medias: ReadonlyMap<number, number | null>
): { ids: number[]; adoptees: number; nonReprises: number[] } {
	const ids: number[] = []
	const nonReprises: number[] = []
	let adoptees = 0
	for (const fichier of fichiers) {
		if (!medias.has(fichier)) {
			nonReprises.push(fichier)
			continue
		}
		adoptees++
		const id = medias.get(fichier)
		if (id !== null && id !== undefined) ids.push(id)
	}
	return { ids, adoptees, nonReprises }
}
