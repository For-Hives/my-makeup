/**
 * Loads the profile types of the fictional set (twelve, and five for the zones) (./profils.ts; ticket 051) into the database
 * Payload is connected to, with their photos in the object storage: on the local test bench and
 * nowhere else (./garde.ts).
 *
 *   const bilan = await placeDemoProfiles(payload)
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
 * - No mail leaves: the confirmation email of a new account is not sent.
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { NAMED_FILE_CONTEXT } from '../lib/photo-upload'
import { DemoDataRefused, type DemoTarget, type DemoVariables, demoTarget } from './guard'
import { type DemoPhoto, type DemoProfile, LOADED_DEMO_PROFILES } from './profiles'

/** The type of every photo of the set. */
export const PHOTO_TYPES = 'image/webp'

/** Reads a photo of the set, next to this file. */
export const readDemoPhoto = (photo: DemoPhoto): Promise<Uint8Array> =>
	readFile(new URL(`./photos/${photo}`, import.meta.url))

/** The name of the file of a media of the set: its own in the set, the same at every load. */
export const fileName = (cle: string, place: 'principale' | number): string =>
	`jeu-${cle}-${place === 'principale' ? 'principale' : `galerie-${place}`}.webp`

/** « de Léa », « d’Inès » : the French way to say whose photo it is. */
const frenchOf = (nom: string): string => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(nom) ? `d’${nom}` : `de ${nom}`)

/** A profile type in the database, as this load created it or found it. */
export interface PlacedProfile {
	cle: string
	/** The account of its makeup artist. */
	compte: number
	profil: number
	slug: string
}

export interface ProfilesSummary {
	cible: DemoTarget
	/** Every profile type, in the order of the set, whether this load created it or found it. */
	profils: PlacedProfile[]
	/** The types this load created. */
	crees: string[]
	/** The types whose account was already there: left as they were. */
	presents: string[]
}

export interface LoadingOptions {
	/** The environment the guard reads; `process.env` by default. */
	variables?: DemoVariables
	/** Where a photo is read from; next to this file by default. */
	lirePhoto?: (photo: DemoPhoto) => Promise<Uint8Array>
}

/** The part of Payload the guard reads: the database it is really connected to. */
interface PayloadConnection {
	db: { poolOptions?: { connectionString?: string } }
}

/**
 * Where the set may be loaded with this Payload, or `DemoDataRefused`: the environment first
 * (`demoTarget`), then the database Payload is really connected to, which must be the one the
 * environment names.
 */
export function requireDemoTarget(payload: PayloadConnection, variables: DemoVariables = process.env): DemoTarget {
	const target = demoTarget(variables)
	if (payload.db.poolOptions?.connectionString !== variables.DATABASE_URI)
		throw new DemoDataRefused('Payload n’est pas branché sur la base que DATABASE_URI désigne.')
	return target
}

/** The profile type, when its account is already in the database. */
export async function profilePresent(payload: Payload, type: DemoProfile): Promise<PlacedProfile | null> {
	const { docs: accounts } = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 1,
		pagination: false,
		select: {},
		where: { email: { equals: type.compte.email } },
	})
	const account = accounts[0]
	if (!account) return null
	const { docs: profiles } = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 1,
		pagination: false,
		select: { slug: true },
		where: { pro: { equals: account.id } },
	})
	const profile = profiles[0]
	if (!profile)
		throw new Error(
			`Le compte du profil type « ${type.cle} » existe sans son profil : remets la base à zéro avant de charger le jeu.`
		)
	return { cle: type.cle, compte: account.id, profil: profile.id, slug: profile.slug }
}

/** Creates one profile type, its account and its photos, in one transaction. */
export async function placeProfile(
	payload: Payload,
	type: DemoProfile,
	lire: (photo: DemoPhoto) => Promise<Uint8Array>,
	// Kept for the callers of the tests; the bench always has its storage, so the loader passes false.
	sansPhotos: boolean
): Promise<PlacedProfile> {
	const req = await createLocalReq({}, payload)
	await initTransaction(req)
	try {
		const account = await payload.create({
			collection: 'pros',
			data: {
				email: type.compte.email,
				name: type.compte.nom,
				password: randomBytes(24).toString('base64url'),
				_verified: true,
			},
			depth: 0,
			disableVerificationEmail: true,
			req,
		})
		const { docs } = await payload.find({
			collection: 'profiles',
			depth: 0,
			limit: 1,
			pagination: false,
			req,
			where: { pro: { equals: account.id } },
		})
		const created = docs[0]
		if (!created) throw new Error(`Le serveur n’a pas créé le profil du compte du profil type « ${type.cle} ».`)

		const uploadPhoto = async (photo: DemoPhoto, place: 'principale' | number, alt: string): Promise<number> => {
			const bytes = Buffer.from(await lire(photo))
			const media = await payload.create({
				collection: 'media',
				data: { alt, owner: account.id },
				depth: 0,
				// The set names its files: the bench finds a photo by its fixed name.
				context: { [NAMED_FILE_CONTEXT]: true },
				file: { data: bytes, mimetype: PHOTO_TYPES, name: fileName(type.cle, place), size: bytes.length },
				req,
			})
			return media.id
		}
		const { principale: main, galerie: gallery } = sansPhotos ? { principale: null, galerie: [] } : type.photos
		const mainPicture = main ? await uploadPhoto(main, 'principale', `Portrait ${frenchOf(type.compte.nom)}`) : null
		const galleryPhotos: number[] = []
		for (const [index, photo] of gallery.entries())
			galleryPhotos.push(
				await uploadPhoto(photo, index + 1, `Réalisation ${frenchOf(type.compte.nom)}, photo ${index + 1}`)
			)

		// A type with nothing to write stays as the server created it: the empty profile of a sign-up.
		const toWrite = Object.keys(type.profil).length > 0 || mainPicture !== null || galleryPhotos.length > 0
		const profile = toWrite
			? await payload.update({
					collection: 'profiles',
					id: created.id,
					// A copy: the set itself stays as it is written, whatever Payload does with its data.
					data: { ...structuredClone(type.profil), mainPicture: mainPicture, gallery: galleryPhotos },
					depth: 0,
					req,
				})
			: created
		await commitTransaction(req)
		return { cle: type.cle, compte: account.id, profil: profile.id, slug: profile.slug }
	} catch (error) {
		await killTransaction(req)
		throw error
	}
}

/**
 * Loads the profile types of the set that are not in the database yet, one after the other, and
 * says what it did. Outside the bench, it stops before it reads or writes
 * anything (`DemoDataRefused`).
 */
export async function placeDemoProfiles(
	payload: Payload,
	{ variables = process.env, lirePhoto = readDemoPhoto }: LoadingOptions = {}
): Promise<ProfilesSummary> {
	const target = requireDemoTarget(payload, variables)
	// Each photo is read once, however many profiles show it.
	const readCache = new Map<DemoPhoto, Promise<Uint8Array>>()
	const read = (photo: DemoPhoto) => {
		const already = readCache.get(photo)
		if (already) return already
		const reading = lirePhoto(photo)
		readCache.set(photo, reading)
		return reading
	}

	const summary: ProfilesSummary = { cible: target, profils: [], crees: [], presents: [] }
	for (const type of LOADED_DEMO_PROFILES) {
		const present = await profilePresent(payload, type)
		if (present) {
			summary.profils.push(present)
			summary.presents.push(type.cle)
			continue
		}
		summary.profils.push(await placeProfile(payload, type, read, false))
		summary.crees.push(type.cle)
	}
	return summary
}
