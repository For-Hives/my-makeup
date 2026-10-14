/**
 * Loads the twelve profile types of the fictional set (./profils.ts; ticket 051) into the database
 * Payload is connected to, with their photos in the object storage: on the test bench, or on the
 * pre-production, and nowhere else (./garde.ts).
 *
 *   const bilan = await poserLesProfilsDuJeu(payload)
 *
 * - For each type, in order: the account of its makeup artist, confirmed, with a password drawn at
 *   random and forgotten at once; the empty profile the server creates with it; one media per
 *   photo, owned by her account; then the profile, saved with its data and its photos. The server
 *   computes the slug, the state and the status, as for any profile.
 * - On an empty database, the same identifiers, the same slugs, the same objects every time: the
 *   types are created one after the other, and each photo keeps the same name, so the same key.
 * - A type whose account is already there, found by its address, is left as it is: a load on a
 *   filled database creates nothing.
 * - Each type is written in one transaction: if it fails, none of its documents stays. An object
 *   already sent to the storage stays until the next load of that type, which writes the same key
 *   again.
 * - Without object storage (the pre-production before it has one), no photo is sent and the
 *   profiles are loaded without them.
 * - No mail leaves: the confirmation email of a new account is not sent.
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { CONTEXTE_FICHIER_NOMME } from '../lib/envoi-photo'
import { type CibleDuJeu, cibleDuJeu, JeuFictifRefuse, type VariablesDuJeu } from './garde'
import { type PhotoDuJeu, PROFILS_DU_JEU, type ProfilDuJeu } from './profils'

/** The type of every photo of the set. */
export const TYPE_DES_PHOTOS = 'image/webp'

/** Reads a photo of the set, next to this file. */
export const lirePhotoDuJeu = (photo: PhotoDuJeu): Promise<Uint8Array> =>
	readFile(new URL(`./photos/${photo}`, import.meta.url))

/** The name of the file of a media of the set: its own in the set, the same at every load. */
export const nomDuFichier = (cle: string, place: 'principale' | number): string =>
	`jeu-${cle}-${place === 'principale' ? 'principale' : `galerie-${place}`}.webp`

/** « de Léa », « d’Inès » : the French way to say whose photo it is. */
const de = (nom: string): string => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(nom) ? `d’${nom}` : `de ${nom}`)

/** A profile type in the database, as this load created it or found it. */
export interface ProfilPose {
	cle: string
	/** The account of its makeup artist. */
	compte: number
	profil: number
	slug: string
}

export interface BilanDesProfils {
	cible: CibleDuJeu
	/** True when the pre-production has no object storage: the profiles were loaded without their photos. */
	sansPhotos: boolean
	/** Every profile type, in the order of the set, whether this load created it or found it. */
	profils: ProfilPose[]
	/** The types this load created. */
	crees: string[]
	/** The types whose account was already there: left as they were. */
	presents: string[]
}

export interface OptionsDuChargement {
	/** The environment the guard reads; `process.env` by default. */
	variables?: VariablesDuJeu
	/** Where a photo is read from; next to this file by default. */
	lirePhoto?: (photo: PhotoDuJeu) => Promise<Uint8Array>
}

/** The part of Payload the guard reads: the database it is really connected to. */
interface ConnexionDePayload {
	db: { poolOptions?: { connectionString?: string } }
}

/**
 * Where the set may be loaded with this Payload, or `JeuFictifRefuse`: the environment first
 * (`cibleDuJeu`), then the database Payload is really connected to, which must be the one the
 * environment names.
 */
export function exigerLaCibleDuJeu(payload: ConnexionDePayload, variables: VariablesDuJeu = process.env): CibleDuJeu {
	const cible = cibleDuJeu(variables)
	if (payload.db.poolOptions?.connectionString !== variables.DATABASE_URI)
		throw new JeuFictifRefuse('Payload n’est pas branché sur la base que DATABASE_URI désigne.')
	return cible
}

/** The profile type, when its account is already in the database. */
export async function profilPresent(payload: Payload, type: ProfilDuJeu): Promise<ProfilPose | null> {
	const { docs: comptes } = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 1,
		pagination: false,
		select: {},
		where: { email: { equals: type.compte.email } },
	})
	const compte = comptes[0]
	if (!compte) return null
	const { docs: profils } = await payload.find({
		collection: 'profils',
		depth: 0,
		limit: 1,
		pagination: false,
		select: { slug: true },
		where: { pro: { equals: compte.id } },
	})
	const profil = profils[0]
	if (!profil)
		throw new Error(
			`Le compte du profil type « ${type.cle} » existe sans son profil : remets la base à zéro avant de charger le jeu.`
		)
	return { cle: type.cle, compte: compte.id, profil: profil.id, slug: profil.slug }
}

/** Creates one profile type, its account and its photos, in one transaction. */
export async function poserLeProfil(
	payload: Payload,
	type: ProfilDuJeu,
	lire: (photo: PhotoDuJeu) => Promise<Uint8Array>,
	sansPhotos: boolean
): Promise<ProfilPose> {
	const req = await createLocalReq({}, payload)
	await initTransaction(req)
	try {
		const compte = await payload.create({
			collection: 'pros',
			data: {
				email: type.compte.email,
				nom: type.compte.nom,
				password: randomBytes(24).toString('base64url'),
				_verified: true,
			},
			depth: 0,
			disableVerificationEmail: true,
			req,
		})
		const { docs } = await payload.find({
			collection: 'profils',
			depth: 0,
			limit: 1,
			pagination: false,
			req,
			where: { pro: { equals: compte.id } },
		})
		const cree = docs[0]
		if (!cree) throw new Error(`Le serveur n’a pas créé le profil du compte du profil type « ${type.cle} ».`)

		const deposer = async (photo: PhotoDuJeu, place: 'principale' | number, alt: string): Promise<number> => {
			const octets = Buffer.from(await lire(photo))
			const media = await payload.create({
				collection: 'media',
				data: { alt, owner: compte.id },
				depth: 0,
				// The set names its files: the bench finds a photo by its fixed name.
				context: { [CONTEXTE_FICHIER_NOMME]: true },
				file: { data: octets, mimetype: TYPE_DES_PHOTOS, name: nomDuFichier(type.cle, place), size: octets.length },
				req,
			})
			return media.id
		}
		const { principale, galerie } = sansPhotos ? { principale: null, galerie: [] } : type.photos
		const photoPrincipale = principale
			? await deposer(principale, 'principale', `Portrait ${de(type.compte.nom)}`)
			: null
		const photosDeLaGalerie: number[] = []
		for (const [rang, photo] of galerie.entries())
			photosDeLaGalerie.push(await deposer(photo, rang + 1, `Réalisation ${de(type.compte.nom)}, photo ${rang + 1}`))

		// A type with nothing to write stays as the server created it: the empty profile of a sign-up.
		const aEcrire = Object.keys(type.profil).length > 0 || photoPrincipale !== null || photosDeLaGalerie.length > 0
		const profil = aEcrire
			? await payload.update({
					collection: 'profils',
					id: cree.id,
					// A copy: the set itself stays as it is written, whatever Payload does with its data.
					data: { ...structuredClone(type.profil), photoPrincipale, galerie: photosDeLaGalerie },
					depth: 0,
					req,
				})
			: cree
		await commitTransaction(req)
		return { cle: type.cle, compte: compte.id, profil: profil.id, slug: profil.slug }
	} catch (erreur) {
		await killTransaction(req)
		throw erreur
	}
}

/**
 * Loads the profile types of the set that are not in the database yet, one after the other, and
 * says what it did. Outside the bench and the pre-production, it stops before it reads or writes
 * anything (`JeuFictifRefuse`).
 */
export async function poserLesProfilsDuJeu(
	payload: Payload,
	{ variables = process.env, lirePhoto = lirePhotoDuJeu }: OptionsDuChargement = {}
): Promise<BilanDesProfils> {
	const cible = exigerLaCibleDuJeu(payload, variables)
	// Each photo is read once, however many profiles show it.
	const lues = new Map<PhotoDuJeu, Promise<Uint8Array>>()
	const lire = (photo: PhotoDuJeu) => {
		const deja = lues.get(photo)
		if (deja) return deja
		const lecture = lirePhoto(photo)
		lues.set(photo, lecture)
		return lecture
	}

	// Only the pre-production may lack a storage (the guard asks the bench for one): its profiles
	// then have no photo, and the states `attendu` promises for the bench do not hold there.
	const sansPhotos = cible === 'preprod' && !variables.S3_ENDPOINT
	const bilan: BilanDesProfils = { cible, sansPhotos, profils: [], crees: [], presents: [] }
	for (const type of PROFILS_DU_JEU) {
		const present = await profilPresent(payload, type)
		if (present) {
			bilan.profils.push(present)
			bilan.presents.push(type.cle)
			continue
		}
		bilan.profils.push(await poserLeProfil(payload, type, lire, sansPhotos))
		bilan.crees.push(type.cle)
	}
	return bilan
}
