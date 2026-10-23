/**
 * The public reading of the profiles: the only way a public page reads a profile (CLAUDE.md,
 * « Un seul point de lecture publique »). The first slice of it (ticket 026): a profile by its
 * slug, with its name, its speciality and its description. Ticket 071 extends it: the list of the
 * profiles that are listed, whether a profile is indexable, and the contact details its owner
 * published. The pages of the talents and of the articles add their own reading in their own
 * tickets, in this folder.
 *
 * - The fields are chosen one by one (`PUBLIC_PROFILE_FIELDS`, `CARD_FIELDS`): never the
 *   account, never what the import or an admin wrote.
 * - The lists keep the access rules of the collection (`overrideAccess: false`), as an anonymous
 *   visitor. The page of a profile lifts them (`readProfileUrlTarget`): a draft answers in noindex
 *   (ticket 104). The three rules (listed, indexable, visible) are src/lib/profile/visibility.ts;
 *   none is written again here.
 * - The contact details are the one thing read without the access rules, by the identifier of a
 *   profile the access rules already gave, and only when its owner published them
 *   (`contactPublic`). A hidden profile gives nothing.
 * - Every read of a list gives its `limit`: the REST bound of ticket 071 does not reach the local
 *   API, so the code bounds itself (tests/unit/public-read.test.ts checks it).
 *
 * The caller gives the Payload instance: the page gets it from the configuration, a test from the
 * bench. No `next` import: the module is read by the tests too.
 */

import type { Payload } from 'payload'
import { type Pid, profilePid } from '@/lib/analytics/pid'
import {
	displayedCity,
	formatZone,
	radiusKm,
	type ZoneInput,
	zoneCountries,
	zoneFlags,
	zoneSentence,
} from '@/lib/format-zone'
import { isPriceAmount, minimumPrice } from '@/lib/price'
import { displayName, text } from '@/lib/profile/display-name'
import { profilePid as pidDeLaPage } from '@/lib/profile/pid'
import {
	type ContactLink,
	contacts,
	courses,
	displayedArtistName,
	experiences,
	names,
	type PublicCourse,
	type PublicExperience,
	type PublicServiceOffer,
	rows,
	serviceOffers,
} from '@/lib/profile/public-view'
import { PUBLISHED_STATUS } from '@/lib/profile/status'
import { urlTarget, valuesToSearch } from '@/lib/profile/url'
import { isIndexable, LISTED_FILTER } from '@/lib/profile/visibility'
import { validPoint } from '@/lib/search/geo-distance'
import type { ProfileGeometry, ProfilePlace } from '@/lib/search/place'
import { type NormalizedTexts, normalizeTexts } from '@/lib/search/relevance'
import { isSlug } from '@/lib/slug'
import type { Profile } from '@/payload-types'

/** The fields of a profile a public page reads, and nothing else. */
export const PUBLIC_PROFILE_FIELDS = {
	slug: true,
	firstName: true,
	lastName: true,
	artistName: true,
	specialty: true,
	description: true,
} as const

/**
 * What a card of a list reads: the identity, the badge, the zone, the main photo and her offers (ticket
 * 303). Of the offers only the name and the amount are read: never a description, a typed price or an
 * option, and `cardOf` keeps the two names and the lowest amount.
 */
export const CARD_FIELDS = {
	slug: true,
	firstName: true,
	lastName: true,
	artistName: true,
	specialty: true,
	city: true,
	radiusKm: true,
	zoneKind: true,
	countries: true,
	town: true,
	superArtist: true,
	mainPicture: true,
	serviceOffers: { name: true, priceFrom: true },
} as const

/**
 * What a card reads of a photo: its public address and its size. The address is made from the file name
 * and the prefix of the object (`generateFileURL`, src/payload.config.ts), so those two are read to make
 * it, and a card keeps neither.
 */
export const PHOTO_FIELDS = {
	url: true,
	width: true,
	height: true,
	filename: true,
	prefix: true,
	objectMissing: true,
} as const

/**
 * What the page of a profile reads (tickets 101 to 103): the fields above, her zone, her
 * availability and her photos. The commune is chosen down to its name: its code and its centre
 * stay in the database. The contact details are not here: they are read apart, and only when she
 * published them (`readPublishedContactDetails`).
 */
export const PROFILE_PAGE_FIELDS = {
	...PUBLIC_PROFILE_FIELDS,
	// Only to make the `pid` of the audience measure (src/lib/profile/pid.ts); the page shows none of it.
	strapiId: true,
	city: { name: true },
	radiusKm: true,
	zoneKind: true,
	countries: true,
	town: true,
	available: true,
	mainPicture: true,
	gallery: true,
	networks: true,
	serviceOffers: true,
	skills: true,
	languages: true,
	courses: true,
	experiences: true,
} as const

/** The most profiles one read of a list gives, and the size of a page when none is asked. */
export const LIST_MAX_LIMIT = 100
export const DEFAULT_LIMIT = 20

/** The contact details a makeup artist chose to publish. */
export interface PublicContactDetails {
	telephone: string | null
	email: string | null
}

/** A profile as a public page shows it. */
export interface PublicProfile {
	slug: string
	/** The id the audience measure counts the profile under (src/lib/profile/pid.ts), or `null` when unknown. */
	pid: Pid | null
	/** The name of the h1 (src/lib/profile/display-name.ts). */
	nom: string
	/**
	 * Her first name, for the texts that speak of her (« Contacter Inès »); `null` when she gave none. The
	 * pages fall back on `nom` then.
	 */
	firstName: string | null
	/** The artist name under the h1, only when it adds something to the name (`displayedArtistName`). */
	nomArtiste: string | null
	specialite: string | null
	/**
	 * « Annecy », « Annecy et 30 km autour », « Bruxelles (Belgique) et 30 km autour », « France et
	 * Italie », or `null` (src/lib/format-zone.ts). Never a flag: the flags are `flags`.
	 */
	zone: string | null
	/** False only when she said so: an availability never set counts as available, as on the old site. */
	disponible: boolean
	/** Her main photo, or `null`: the page then shows the picture of the site. */
	photo: CardPhoto | null
	/** The photos of her portfolio, in the order she gave, a photo that is gone left out. */
	galerie: CardPhoto[]
	/** Her commune, or her place abroad (« Bruxelles (Belgique) », « France et Italie »), or `null`. */
	lieu: string | null
	/** The flags of her countries, in order, for the display component only; empty for a commune. Never in a text. */
	flags: string[]
	/** Where she works inside a sentence: « à Annecy », « en Belgique », « aux Pays-Bas »; `null` without a zone. */
	placePhrase: string | null
	/** Where she works, for the structured data; `null` without a zone. */
	area: PublicArea | null
	/** True when she gave a radius around her commune, or works in several countries. */
	seDeplace: boolean
	/** Her radius in km around her commune or her town abroad, or `null` (src/lib/format-zone.ts, `radiusKm`). */
	radiusKm: number | null
	/** The sections below hold only rows that say something, in the order she gave them. */
	prestations: PublicServiceOffer[]
	competences: string[]
	langues: string[]
	formations: PublicCourse[]
	experiences: PublicExperience[]
	/** Her networks, and her telephone and email only when she published them. */
	liens: ContactLink[]
	description: string | null
	/** Publishable: the page may be indexed. Otherwise it is shown in noindex. */
	indexable: boolean
	/** Her telephone and email, only when she published them, else `null`. */
	coordonnees: PublicContactDetails | null
	/** The offers with a name, with their amount in euros (what the structured data prices; no option). */
	offres: PricedOffer[]
	/** The lowest amount of her offers (src/lib/price.ts, `minimumPrice`, U37), or `null`. */
	prixMinimal: number | null
}

/** Where a profile works, as the structured data says it (src/lib/seo/profile.ts). */
export type PublicArea =
	| { kind: 'city'; name: string }
	| { kind: 'town'; name: string; country: string }
	| { kind: 'countries'; names: string[] }

/** An offer as the structured data says it: its name, its text, and its amount in euros when it has a usable one. */
export interface PricedOffer {
	nom: string
	description: string
	montant: number | null
}

/** The main photo of a card: where it is and how big, never the file's owner or its other fields. */
export interface CardPhoto {
	url: string
	width: number | null
	height: number | null
}

/** A card of the list: the keys are frozen by the unit test (U22), never a contact detail. */
export interface ProfileCard {
	slug: string
	/** The id the measure counts the profile under (src/lib/analytics/pid.ts): public, no personal data. */
	pid: Pid
	nom: string
	specialite: string | null
	/** « Annecy », « Annecy et 30 km autour », « Bruxelles (Belgique) et 30 km autour », or `null`. */
	lieu: string | null
	/**
	 * The flags of her countries, only for a zone of countries: the key is absent for a commune, so a card
	 * of a commune is what it was. Decoration for the display component, never part of a text.
	 */
	flags?: string[]
	superMaquilleuse: boolean
	photo: CardPhoto | null
	/**
	 * True when nothing on her profile lets a client reach her (ticket 291). The key is absent for a
	 * profile that can be reached, so a card of the list is what it was; only the directory sets it.
	 */
	unreachable?: true
	/**
	 * The names of her first two offers (ticket 303), shown as chips. The key is absent when she named
	 * none, so a card without offers keeps the keys it had.
	 */
	offerNames?: string[]
	/** The lowest amount of her offers, in euros (`minimumPrice`). Absent when no offer has an amount. */
	startingPrice?: number
}

/** One page of the listed profiles. */
export interface ProfileListPage {
	cartes: ProfileCard[]
	page: number
	totalDocs: number
	hasNextPage: boolean
}

type CardProfile = Pick<
	Profile,
	| 'id'
	| 'slug'
	| 'firstName'
	| 'lastName'
	| 'artistName'
	| 'specialty'
	| 'city'
	| 'radiusKm'
	| 'zoneKind'
	| 'countries'
	| 'town'
	| 'superArtist'
	| 'mainPicture'
	| 'serviceOffers'
>

/** The most chips of offers a card shows. */
export const CARD_OFFER_NAMES = 2

/** The photos of the cards, by the identifier of the media. */
type PhotosById = ReadonlyMap<number | string, CardPhoto>

/** The identifier a relationship to a photo holds, populated or not. */
const photoId = (photo: CardProfile['mainPicture']): number | string | undefined =>
	typeof photo === 'object' && photo !== null ? photo.id : (photo ?? undefined)

/**
 * The main photos of profiles the public reads, by identifier. Payload fills a media in a profile for no
 * one but its owner: the access rule of the media opens one when it is read by its identifier. The
 * photos are read here in one request, by the identifiers the public read of the profiles gave, which is
 * the same rule: a photo of a profile the public reads is public, and nothing else is read.
 */
async function readPhotos(payload: Payload, profils: readonly CardProfile[]): Promise<PhotosById> {
	const identifiers = [...new Set(profils.map(({ mainPicture }) => photoId(mainPicture)))].filter(
		(identifiant): identifiant is number | string => identifiant !== undefined
	)
	const photos = new Map<number | string, CardPhoto>()
	if (identifiers.length === 0) return photos
	const { docs } = await payload.find({
		collection: 'media',
		where: { id: { in: identifiers } },
		select: PHOTO_FIELDS,
		depth: 0,
		limit: LIST_MAX_LIMIT,
		pagination: false,
		overrideAccess: true,
	})
	// A photo adopted without its object (marked by the import, ticket 275) is no photo: the page shows what it shows without one.
	for (const media of docs)
		if (typeof media.url === 'string' && media.url !== '' && media.objectMissing !== true)
			photos.set(media.id, { url: media.url, width: media.width ?? null, height: media.height ?? null })
	return photos
}

/**
 * The measure id of profiles the public reads (`pid`, plan 04 §3.2). The old id lives in a field the
 * public does not read, so it is read here, by the identifiers the public read of the profiles gave,
 * and nothing else is read of those profiles.
 */
async function readPids(payload: Payload, profils: readonly { id: number }[]): Promise<ReadonlyMap<number, Pid>> {
	const pid = new Map<number, Pid>()
	if (profils.length === 0) return pid
	const { docs } = await payload.find({
		collection: 'profiles',
		where: { id: { in: profils.map(({ id }) => id) } },
		select: { strapiId: true },
		depth: 0,
		limit: LIST_MAX_LIMIT,
		pagination: false,
		overrideAccess: true,
	})
	for (const { id, strapiId } of docs) pid.set(id, profilePid({ id, strapiId }))
	return pid
}

/** The zone of a profile in the shape the text functions read (src/lib/format-zone.ts). */
function zoneInput(profil: Pick<Profile, 'city' | 'radiusKm' | 'zoneKind' | 'countries' | 'town'>): ZoneInput {
	return {
		city: profil.city?.name,
		radius: profil.radiusKm,
		zoneKind: profil.zoneKind,
		countries: profil.countries,
		town: profil.town,
	}
}

/** A profile read for a list, as a card: the keys are frozen (U22), no coordinates and no contact. */
function cardOf(profil: CardProfile, photos: PhotosById, pids: ReadonlyMap<number, Pid>): ProfileCard {
	const identifier = photoId(profil.mainPicture)
	const flags = zoneFlags(zoneInput(profil))
	const offerNames = (profil.serviceOffers ?? [])
		.map(offer => text(offer?.name))
		.filter(name => name !== '')
		.slice(0, CARD_OFFER_NAMES)
	const startingPrice = minimumPrice(profil.serviceOffers)
	return {
		slug: profil.slug,
		pid: pids.get(profil.id) ?? profilePid({ id: profil.id }),
		nom: displayName(profil),
		specialite: text(profil.specialty) || null,
		lieu: formatZone(zoneInput(profil)) || null,
		...(flags.length > 0 && { flags }),
		superMaquilleuse: profil.superArtist === true,
		photo: (identifier !== undefined && photos.get(identifier)) || null,
		...(offerNames.length > 0 && { offerNames }),
		...(startingPrice !== null && { startingPrice }),
	}
}

/** The contact details of this profile if its owner published them, else `null`. */
async function readPublishedContactDetails(payload: Payload, id: number): Promise<PublicContactDetails | null> {
	const { docs } = await payload.find({
		collection: 'profiles',
		where: { id: { equals: id } },
		select: { publicContact: true, contactDetails: true },
		depth: 0,
		limit: 1,
		pagination: false,
		// The contact details are closed to the public by the access rules: only this read lifts them,
		// by the identifier of a profile the public already reads, and keeps them if she chose so.
		overrideAccess: true,
	})
	const profile = docs[0]
	if (profile?.publicContact !== true) return null
	const phone = text(profile.contactDetails?.phone) || null
	const email = text(profile.contactDetails?.email) || null
	return phone || email ? { telephone: phone, email } : null
}

/**
 * The photos a profile names (her main photo and her portfolio), by identifier, in one read; a photo that
 * is gone, or has no address, is not in the map. Read by identifier, as `readPhotos` does for the
 * cards: the access rule of the media opens a photo to the public when it is asked by its identifier,
 * and a profile the public reads names only its own photos.
 */
async function readProfilePhotos(
	payload: Payload,
	identifiants: readonly (number | string | undefined)[]
): Promise<PhotosById> {
	const requested = [...new Set(identifiants)].filter(
		(identifiant): identifiant is number | string => identifiant !== undefined
	)
	const photos = new Map<number | string, CardPhoto>()
	if (requested.length === 0) return photos
	const { docs } = await payload.find({
		collection: 'media',
		where: { id: { in: requested } },
		select: PHOTO_FIELDS,
		depth: 0,
		limit: LIST_MAX_LIMIT,
		pagination: false,
		overrideAccess: true,
	})
	// A photo adopted without its object (marked by the import, ticket 275) is no photo: the page shows what it shows without one.
	for (const media of docs)
		if (typeof media.url === 'string' && media.url !== '' && media.objectMissing !== true)
			photos.set(media.id, { url: media.url, width: media.width ?? null, height: media.height ?? null })
	return photos
}

/** What the address of a profile leads to: the profile, a redirection to its slug, or nothing. */
export type ProfileUrlTarget =
	| { type: 'profil'; profil: PublicProfile; publie: boolean }
	| { type: 'redirection'; slug: string }
	| { type: 'inconnue' }

/**
 * What the address `/profil/<segment>` leads to (ticket 104): the profile itself, a redirection to its
 * slug (an old username, or a variant of the slug), or nothing (unknown, or hidden). The rule is
 * src/lib/profile/url.ts.
 *
 * The read lifts the access rules of the collection, which keep the published profiles only, for two
 * reasons: a profile that is visible but not published (a draft) answers its page in noindex, as on the
 * site today, and the old username (`legacyUsername`) is closed to the public. Nothing else is lifted:
 * the fields are chosen one by one, a hidden profile is dropped by the rule (`isVisible`), and the
 * contact details are read apart.
 */
export async function readProfileUrlTarget(payload: Payload, segment: string): Promise<ProfileUrlTarget> {
	const values = valuesToSearch(segment)
	if (!values) return { type: 'inconnue' }
	const { docs } = await payload.find({
		collection: 'profiles',
		where: {
			or: [
				{ slug: { equals: values.segment } },
				{ slug: { equals: values.slugifie } },
				{ legacyUsername: { equals: values.segment } },
			],
		},
		select: {
			...PROFILE_PAGE_FIELDS,
			id: true,
			status: true,
			publishable: true,
			legacyUsername: true,
			createdAt: true,
		},
		sort: ['createdAt', 'id'],
		depth: 0,
		// Two usernames can be the same, a slug is unique: a handful of candidates at most.
		limit: CANDIDATES_LIMIT,
		pagination: false,
		overrideAccess: true,
	})
	const target = urlTarget(segment, docs)
	if (target.type !== 'profil') return target
	return {
		type: 'profil',
		// Only a published profile is refreshed by a save (src/lib/revalidate.ts): the page keeps it in the cache.
		publie: target.profil.status === PUBLISHED_STATUS,
		profil: await publicProfileRead(payload, target.profil),
	}
}

/** A profile read with `PROFILE_PAGE_FIELDS` and its id, as a public page shows it: photos and published contact included. */
async function publicProfileRead(payload: Payload, profil: ProfilePageData & { id: number }): Promise<PublicProfile> {
	const main = photoId(profil.mainPicture)
	// The portfolio, in the order she gave; a photo named twice is shown twice.
	const ranked = (profil.gallery ?? []).map(photo => photoId(photo))
	const photos = await readProfilePhotos(payload, [main, ...ranked])
	return publicProfileOf(profil, {
		photo: (main !== undefined && photos.get(main)) || null,
		galerie: ranked.flatMap(identifiant => (identifiant !== undefined && photos.get(identifiant)) || []),
		coordonnees: await readPublishedContactDetails(payload, profil.id),
	})
}

/** Where her profile stands, as the preview banner says it (src/lib/dashboard/preview.ts). */
export type ProfilePreviewState = Pick<Profile, 'status' | 'available' | 'fullyEmpty' | 'publishable'>

/**
 * Her own page as a visitor sees it (ticket 139): the same `PublicProfile` as `readProfileUrlTarget`,
 * built by the same code, for the profile with this identifier whether it is listed, a draft or even
 * hidden. The identifier is the one the server found by her session (`profileId`), never one
 * a request gave. The contact details are the ones she published, exactly as the public sees them.
 * `null` when the profile does not exist.
 */
export async function readProfilePreview(
	payload: Payload,
	id: number
): Promise<{ profil: PublicProfile; etat: ProfilePreviewState } | null> {
	const { docs } = await payload.find({
		collection: 'profiles',
		where: { id: { equals: id } },
		select: { ...PROFILE_PAGE_FIELDS, id: true, status: true, publishable: true, fullyEmpty: true },
		depth: 0,
		limit: 1,
		pagination: false,
		overrideAccess: true,
	})
	const doc = docs[0]
	if (!doc) return null
	return {
		profil: await publicProfileRead(payload, doc),
		etat: {
			status: doc.status,
			available: doc.available,
			fullyEmpty: doc.fullyEmpty,
			publishable: doc.publishable,
		},
	}
}

/** How many profiles one address can match: the slug, its variant, and the profiles sharing an old username. */
const CANDIDATES_LIMIT = 20

/** The profile at this slug, or `null`: unknown, hidden, or a slug that is not the profile's own. */
export async function readPublicProfile(payload: Payload, slug: string): Promise<PublicProfile | null> {
	if (!isSlug(slug)) return null
	const target = await readProfileUrlTarget(payload, slug)
	return target.type === 'profil' ? target.profil : null
}

/** What a profile read for its page holds: the fields of `PROFILE_PAGE_FIELDS` and the state. */
export type ProfilePageData = Pick<
	Profile,
	| 'slug'
	| 'firstName'
	| 'lastName'
	| 'artistName'
	| 'specialty'
	| 'description'
	| 'city'
	| 'radiusKm'
	| 'zoneKind'
	| 'countries'
	| 'town'
	| 'available'
	| 'mainPicture'
	| 'gallery'
	| 'networks'
	| 'serviceOffers'
	| 'skills'
	| 'languages'
	| 'courses'
	| 'experiences'
	| 'status'
	| 'publishable'
	| 'strapiId'
>

/**
 * The page of a profile from what was read: pure, so that a test gives it the profiles of the set
 * without a database. The photos and the contact details are read apart (they are read by their own
 * rules) and given here.
 */
export function publicProfileOf(
	profil: ProfilePageData & { id?: number },
	lu: { photo: CardPhoto | null; galerie: CardPhoto[]; coordonnees: PublicContactDetails | null }
): PublicProfile {
	const name = displayName(profil)
	const abroad = zoneCountries(zoneInput(profil)).length > 0
	const place = directoryPlace(profil)
	const municipality = displayedCity(profil.city?.name)
	return {
		slug: profil.slug,
		pid: pidDeLaPage(profil),
		nom: name,
		firstName: text(profil.firstName) || null,
		nomArtiste: displayedArtistName(profil, name),
		specialite: text(profil.specialty) || null,
		zone: formatZone(zoneInput(profil)) || null,
		disponible: profil.available !== false,
		photo: lu.photo,
		galerie: lu.galerie,
		lieu: (abroad ? place.ville : municipality) || null,
		flags: zoneFlags(zoneInput(profil)),
		placePhrase: zoneSentence(zoneInput(profil)) || null,
		area: areaOf(profil),
		seDeplace: abroad ? place.seDeplace : municipality !== '' && radiusKm(profil.radiusKm) !== null,
		radiusKm: radiusKm(profil.radiusKm),
		prestations: serviceOffers(profil.serviceOffers),
		competences: names(profil.skills),
		langues: names(profil.languages),
		formations: courses(profil.courses),
		experiences: experiences(profil.experiences),
		liens: contacts({
			reseaux: profil.networks,
			telephone: lu.coordonnees?.telephone,
			email: lu.coordonnees?.email,
		}),
		description: text(profil.description) || null,
		indexable: isIndexable(profil),
		coordonnees: lu.coordonnees,
		offres: pricedOffers(profil.serviceOffers),
		prixMinimal: minimumPrice(profil.serviceOffers),
	}
}

/** Where a profile works for the structured data: a commune, a town abroad, or countries. */
function areaOf(profil: Pick<Profile, 'city' | 'radiusKm' | 'zoneKind' | 'countries' | 'town'>): PublicArea | null {
	const input = zoneInput(profil)
	const countries = zoneCountries(input)
	const [only] = countries
	if (only && countries.length === 1) {
		const town = displayedCity(profil.town)
		return town ? { kind: 'town', name: town, country: only.name } : { kind: 'countries', names: [only.name] }
	}
	if (countries.length > 1) return { kind: 'countries', names: countries.map(({ name }) => name) }
	const municipality = displayedCity(profil.city?.name)
	return municipality ? { kind: 'city', name: municipality } : null
}

/** The offers with a name, each with its amount when it is one the site counts as a price. */
function pricedOffers(stockees: ProfilePageData['serviceOffers']): PricedOffer[] {
	return (stockees ?? []).flatMap(ligne => {
		const name = text(ligne?.name)
		if (name === '') return []
		const amount = ligne?.priceFrom
		return [
			{
				nom: name,
				description: rows(ligne?.description).join(' '),
				montant: isPriceAmount(amount) ? amount : null,
			},
		]
	})
}

/**
 * One page of the listed profiles (neither hidden, nor unavailable, nor entirely empty), 20 by
 * default and 100 at most. A page past the end is empty. The order is the slug, stable from one
 * page to the next; the search of ticket 098 sorts by relevance on top of this read.
 */
export async function listProfiles(
	payload: Payload,
	{ page = 1, limite = DEFAULT_LIMIT }: { page?: number; limite?: number } = {}
): Promise<ProfileListPage> {
	const result = await payload.find({
		collection: 'profiles',
		where: LISTED_FILTER,
		select: CARD_FIELDS,
		sort: 'slug',
		depth: 0,
		limit: Math.min(Math.max(Math.trunc(limite) || DEFAULT_LIMIT, 1), LIST_MAX_LIMIT),
		page: Math.max(Math.trunc(page) || 1, 1),
		pagination: true,
		overrideAccess: false,
	})
	const photos = await readPhotos(payload, result.docs)
	const pids = await readPids(payload, result.docs)
	return {
		cartes: result.docs.map(profil => cardOf(profil, photos, pids)),
		page: result.page ?? 1,
		totalDocs: result.totalDocs,
		hasNextPage: result.hasNextPage,
	}
}

/**
 * Where a profile works, as the search reads it (tickets 098 and 263; PLAN-ZONES.md §3.4):
 * - a commune: its name, the département the server computed, its postal codes, and « travels » when
 *   she gave a radius;
 * - countries: the label of the zone without the radius (« Bruxelles (Belgique) », « France et
 *   Italie »), no département and no postal code; she travels when she names several countries, or one
 *   country with a radius. No flag: the label is text.
 */
export function directoryPlace(
	profil: Pick<Profile, 'city' | 'radiusKm' | 'zoneKind' | 'countries' | 'town'>
): Required<ProfilePlace> {
	const input = zoneInput(profil)
	const countries = zoneCountries(input)
	if (countries.length > 0)
		return {
			ville: formatZone({ ...input, radius: null }) || null,
			departement: null,
			seDeplace: countries.length > 1 || radiusKm(profil.radiusKm) !== null,
			postalCodes: [],
		}
	const municipality = text(profil.city?.name)
	return {
		ville: municipality || null,
		departement: text(profil.city?.department) || null,
		seDeplace: municipality !== '' && radiusKm(profil.radiusKm) !== null,
		postalCodes: municipality ? (profil.city?.postalCodes ?? []) : [],
	}
}

/**
 * The centre of the commune of a profile and her radius, for the ranking by distance (ticket 294). None
 * for a zone abroad, and none for a commune the list gave no coordinates: she is then found by her name.
 */
export function directoryGeometry(
	profil: Pick<Profile, 'city' | 'radiusKm' | 'zoneKind' | 'countries' | 'town'>
): Required<ProfileGeometry> {
	if (zoneCountries(zoneInput(profil)).length > 0) return { center: null, radiusKm: null }
	const { latitude, longitude, name } = profil.city ?? {}
	return {
		center:
			text(name) !== '' && validPoint({ latitude, longitude })
				? { latitude: latitude as number, longitude: longitude as number }
				: null,
		radiusKm: text(name) !== '' ? radiusKm(profil.radiusKm) : null,
	}
}

/** The radius from which a profile is said to travel far, in km (ticket 295). */
export const FAR_REACH_KM = 100

/** A radius of 100 km or more, or several countries: what « Elles se déplacent loin » lists. */
export function reachesFar(profil: Pick<Profile, 'radiusKm' | 'zoneKind' | 'countries' | 'town'>): boolean {
	const radius = radiusKm(profil.radiusKm)
	return zoneCountries(zoneInput(profil)).length > 1 || (radius !== null && radius >= FAR_REACH_KM)
}

/** A listed profile with where she works: what the search by city ranks by. */
export interface DirectoryProfile extends ProfilePlace, ProfileGeometry {
	/** The name a tie of the ranking by distance is broken by (ticket 294). */
	sortName: string
	/** True when she goes far: a radius of 100 km or more, or several countries (ticket 295). */
	farReach: boolean
	carte: ProfileCard
	/** True when her profile shows no way to reach her (ticket 291): the search ranks her after the others. */
	unreachable: boolean
	/** The lowest amount of her offers, in euros: what the price filter and the price sort read (issue 1011). */
	startingPrice?: number | null
	/** The speciality bullets she chose: what the speciality filter reads (issue 1011). */
	specialtyBullets?: readonly string[]
	/** When her profile was last saved, in milliseconds: what the sort by update reads (issue 1011). */
	updatedAt?: number
	/** True when her profile is publishable (`isIndexable`): the pages of a speciality show only those (ticket 305). */
	indexable: boolean
	/**
	 * What she wrote that a search by a word looks into (ticket 099). Beside the card, never in it: a card
	 * is what a page renders, and carries none of this. Read only when asked (`avecLesTextes`).
	 */
	textes?: NormalizedTexts
}

/**
 * Which profiles show no way to be reached (ticket 291), by identifier: no network, no site, and no
 * telephone nor email she chose to show. The contact details are closed to the public, so they are read
 * here, by the identifiers the public read of the profiles gave, and only this fact leaves: never a value.
 */
async function readUnreachable(payload: Payload, profils: readonly { id: number }[]): Promise<ReadonlySet<number>> {
	const unreachable = new Set<number>()
	if (profils.length === 0) return unreachable
	const { docs } = await payload.find({
		collection: 'profiles',
		where: { id: { in: profils.map(({ id }) => id) } },
		select: { networks: true, publicContact: true, contactDetails: true },
		depth: 0,
		limit: LIST_MAX_LIMIT,
		pagination: false,
		overrideAccess: true,
	})
	const reachable = new Set<number>()
	for (const doc of docs) {
		const shown = doc.publicContact === true
		const links = contacts({
			reseaux: doc.networks,
			telephone: shown ? doc.contactDetails?.phone : null,
			email: shown ? doc.contactDetails?.email : null,
		})
		if (links.some(({ href }) => href)) reachable.add(doc.id)
	}
	for (const { id } of profils) if (!reachable.has(id)) unreachable.add(id)
	return unreachable
}

/** The fields a search by a word reads on top of a card: her texts and her whole offers (for their descriptions), and no contact, no link. */
const SEARCH_FIELDS = {
	...CARD_FIELDS,
	description: true,
	skills: true,
	serviceOffers: true,
} as const

type SearchedProfile = CardProfile & Pick<Profile, 'description' | 'skills' | 'serviceOffers'>

/** The texts a search by a word looks into (the commune, the speciality, the description, the skills and the offers), normalised. */
function textsOf(profil: SearchedProfile): NormalizedTexts {
	const names = <T extends { name?: string | null }>(liste: readonly T[] | null | undefined): string[] =>
		(liste ?? []).map(element => text(element.name)).filter(nom => nom !== '')
	const descriptions = <T extends { description?: string | null }>(liste: readonly T[] | null | undefined): string[] =>
		(liste ?? []).map(element => text(element.description)).filter(description => description !== '')
	return normalizeTexts({
		ville: directoryPlace(profil).ville ?? '',
		specialite: text(profil.specialty),
		description: text(profil.description),
		competences: names(profil.skills),
		descriptionsDesCompetences: descriptions(profil.skills),
		descriptionsDesPrestations: descriptions(profil.serviceOffers),
		nom: text(profil.lastName),
		prenom: text(profil.firstName),
	})
}

/** The most pages of the directory one read goes through: 1 000 profiles, ten times the site today. */
const DIRECTORY_MAX_PAGES = 10

/**
 * Every listed profile, most complete first, then most recently changed (ticket 098): what a search by
 * city places in its sections. Read in pages of 100, ten at most; the place of a profile is its
 * commune and the département the server computed from its INSEE code. A card carries no coordinate:
 * the centre of the commune stays here. With `avecLesTextes` (ticket 099) each profile also carries the
 * texts a search by a word looks into, beside its card.
 */
export async function readDirectory(
	payload: Payload,
	{ avecLesTextes = false }: { avecLesTextes?: boolean } = {}
): Promise<DirectoryProfile[]> {
	const directory: DirectoryProfile[] = []
	for (let page = 1; page <= DIRECTORY_MAX_PAGES; page += 1) {
		const result = await payload.find({
			collection: 'profiles',
			where: LISTED_FILTER,
			select: {
				...(avecLesTextes ? SEARCH_FIELDS : CARD_FIELDS),
				publishable: true,
				updatedAt: true,
				specialtyBullets: true,
			},
			sort: ['-completeness', '-updatedAt', 'slug'],
			depth: 0,
			limit: LIST_MAX_LIMIT,
			page,
			pagination: true,
			overrideAccess: false,
		})
		const photos = await readPhotos(payload, result.docs)
		const pids = await readPids(payload, result.docs)
		const unreachable = await readUnreachable(payload, result.docs)
		for (const profile of result.docs) {
			const isUnreachable = unreachable.has(profile.id)
			const card = cardOf(profile, photos, pids)
			directory.push({
				carte: isUnreachable ? { ...card, unreachable: true } : card,
				unreachable: isUnreachable,
				startingPrice: card.startingPrice ?? null,
				specialtyBullets: profile.specialtyBullets ?? [],
				updatedAt: Date.parse(profile.updatedAt) || 0,
				indexable: profile.publishable === true,
				...directoryPlace(profile),
				...directoryGeometry(profile),
				sortName: displayName(profile),
				farReach: reachesFar(profile),
				...(avecLesTextes && { textes: textsOf(profile) }),
			})
		}
		if (!result.hasNextPage) break
	}
	return directory
}
