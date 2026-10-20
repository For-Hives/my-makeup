import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { fileName, type ProfilesSummary, placeDemoProfiles, readDemoPhoto } from '@/demo-data/loading'
import { DEMO_PROFILES, type DemoPhoto, type DemoProfile, PHOTO_MAX_WEIGHT } from '@/demo-data/profiles'
import { mediaKey, UPLOAD_PREFIX } from '@/lib/media'
import { profileState } from '@/lib/profile/state'
import type { Media, Pro, Profile } from '@/payload-types'
import { countDocuments, countLines, emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage, listObjects, readObject } from '../support/s3'

/**
 * The twelve profile types of the fictional set, loaded on the bench (ticket 051): each one tied
 * to its made-up makeup artist, its state as the server computes it, its photos in the storage,
 * and the same content at every load. The set without the bench: tests/unit/demo-data.test.ts.
 */

const KEYS = DEMO_PROFILES.map(({ cle: key }) => key)

/** How many photos the set sends: one media each. */
const UPLOADED_PHOTOS = DEMO_PROFILES.reduce(
	(total, { photos }) => total + (photos.principale ? 1 : 0) + photos.galerie.length,
	0
)

/** The longest a load of the set may take: about 4 seconds on an empty bench (14/10/2026). */
const LOADING_MS = 15_000

const resetToZero = () => Promise.all([emptyBase(), emptyStorage()])

const fingerprint = (octets: Uint8Array) => createHash('sha256').update(octets).digest('hex')

/** The profile of a type, as the database holds it, read with every right. */
async function profileOf(bilan: ProfilesSummary, type: DemoProfile): Promise<Profile> {
	const pose = bilan.profils.find(({ cle: key }) => key === type.cle)
	if (!pose) throw new Error(`le profil type « ${type.cle} » manque au bilan`)
	const payload = await testPayload()
	return payload.findByID({ collection: 'profiles', id: pose.profil, depth: 0 })
}

/** Every media of the bench, read with every right. */
async function allMedia(): Promise<Media[]> {
	const payload = await testPayload()
	return (await payload.find({ collection: 'media', depth: 0, pagination: false, sort: 'id' })).docs
}

const idOf = (valeur: number | { id: number } | null | undefined) => (typeof valeur === 'object' ? valeur?.id : valeur)

/** What the server writes itself at each save: its dates are not the content of the set. */
const OUTSIDE_CONTENT = new Set(['id', 'createdAt', 'updatedAt', 'activeSince', 'publishableSince', 'fullyEmptySince'])

/** A document without its identifiers and its dates, at every depth: the rows of its lists included. */
function withoutIdentity(valeur: unknown): unknown {
	if (Array.isArray(valeur)) return valeur.map(withoutIdentity)
	if (typeof valeur !== 'object' || valeur === null) return valeur
	return Object.fromEntries(
		Object.entries(valeur)
			.filter(([key]) => !OUTSIDE_CONTENT.has(key))
			.map(([key, content]) => [key, withoutIdentity(content)])
	)
}

/**
 * The whole content of the set in the database and in the storage, without what changes from one
 * load to the next by nature (identifiers, dates of the server): each account, its profile, and
 * each photo with the bytes of its object.
 */
async function datasetContent(bilan: ProfilesSummary) {
	const payload = await testPayload()
	const mediaList = new Map((await allMedia()).map(media => [media.id, media]))
	const photo = async (id: number | null | undefined) => {
		const media = id === null || id === undefined ? undefined : mediaList.get(id)
		if (!media?.filename) return null
		const object = await readObject(mediaKey(media.prefix, media.filename))
		return {
			...(withoutIdentity(media) as object),
			owner: undefined,
			objet: object ? fingerprint(object.octets) : null,
		}
	}
	return Promise.all(
		DEMO_PROFILES.map(async type => {
			const profile = await profileOf(bilan, type)
			const account: Pro = await payload.findByID({ collection: 'pros', id: Number(idOf(profile.pro)), depth: 0 })
			return {
				compte: { email: account.email, nom: account.name, verified: account._verified },
				profil: { ...(withoutIdentity(profile) as object), pro: undefined, mainPicture: undefined, gallery: undefined },
				mainPicture: await photo(idOf(profile.mainPicture)),
				gallery: await Promise.all((profile.gallery ?? []).map(id => photo(idOf(id)))),
			}
		})
	)
}

beforeAll(async () => {
	// Payload starts before the first load.
	await testPayload()
})

describe('Le jeu du banc : les 12 profils types', () => {
	let summary: ProfilesSummary

	beforeAll(async () => {
		await resetToZero()
		summary = await placeDemoProfiles(await testPayload())
	}, LOADING_MS)

	afterAll(resetToZero)

	test('12 profils, chacun relié à sa maquilleuse fictive, confirmée, sous le slug attendu', async () => {
		const payload = await testPayload()

		expect(summary.cible).toBe('banc')
		expect(summary.crees).toEqual(KEYS)
		expect(summary.presents).toEqual([])
		expect((await payload.count({ collection: 'profiles' })).totalDocs).toBe(12)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(12)
		for (const type of DEMO_PROFILES) {
			const profile = await profileOf(summary, type)
			const account = await payload.findByID({ collection: 'pros', id: Number(idOf(profile.pro)), depth: 0 })
			expect({ cle: type.cle, email: account.email, nom: account.name, confirme: account._verified }).toEqual({
				cle: type.cle,
				...type.compte,
				confirme: true,
			})
			expect({ cle: type.cle, slug: profile.slug }).toEqual({ cle: type.cle, slug: type.attendu.slug })
			expect(summary.profils.find(({ cle: key }) => key === type.cle)).toEqual({
				cle: type.cle,
				compte: account.id,
				profil: profile.id,
				slug: type.attendu.slug,
			})
		}
	})

	test('états calculés conformes aux fixtures : la référence publiable, le profil vide ni actif ni publiable', async () => {
		for (const type of DEMO_PROFILES) {
			const profile = await profileOf(summary, type)
			const { slug: _slug, ...expected } = type.attendu
			const stored = {
				completeness: profile.completeness,
				active: profile.active,
				publishable: profile.publishable,
				fullyEmpty: profile.fullyEmpty,
				status: profile.status,
			}

			expect({ cle: type.cle, etat: stored }).toEqual({ cle: type.cle, etat: expected })
			// What the server stored is what the single rule reads in what it stored.
			const { completeness, active, publishable, fullyEmpty } = profileState(profile)
			expect({
				completeness: stored.completeness,
				active: stored.active,
				publishable: stored.publishable,
				fullyEmpty: stored.fullyEmpty,
			}).toEqual({ completeness, active, publishable, fullyEmpty })
		}

		const reference = await profileOf(summary, DEMO_PROFILES[0] as DemoProfile)
		expect({ publishable: reference.publishable, status: reference.status }).toEqual({
			publishable: true,
			status: 'published',
		})
		const empty = await profileOf(summary, DEMO_PROFILES[5] as DemoProfile)
		expect({ active: empty.active, publishable: empty.publishable, status: empty.status }).toEqual({
			active: false,
			publishable: false,
			status: 'draft',
		})
	})

	test('ce que chaque type porte est enregistré tel quel : contact de la référence, disponibilité, ancien nom, masque', async () => {
		const byKey = new Map(
			await Promise.all(DEMO_PROFILES.map(async type => [type.cle, await profileOf(summary, type)] as const))
		)
		const read = (cle: string) => {
			const profile = byKey.get(cle)
			if (!profile) throw new Error(`pas de profil « ${cle} »`)
			return profile
		}

		// The reference publishes its phone and its email, with the trace of the consent of the set.
		expect(read('reference')).toMatchObject({
			publicContact: true,
			contactDetails: { phone: '06 39 98 10 01', email: 'contact@ines-morel.example.test' },
			consentedAt: '2026-09-01T08:00:00.000Z',
			consentSource: 'artist',
		})
		expect(read('reference').serviceOffers?.map(({ priceFrom }) => priceFrom)).toEqual([180, 60, 45])
		expect(read('reference').gallery).toHaveLength(6)
		expect(read('indisponible').available).toBe(false)
		expect(read('disponibilite-inconnue').available).toBeNull()
		expect(read('ville-voisine').city).toMatchObject({ name: 'Annemasse', inseeCode: '74012', department: '74' })
		expect(read('ville-eloignee').city).toMatchObject({ name: 'Nantes', inseeCode: '44109', department: '44' })
		expect(read('sans-contact-public')).toMatchObject({ publicContact: false, consentedAt: null })
		expect(read('ancien-nom-accentue')).toMatchObject({ slug: 'zoe-lefevre', legacyUsername: 'zoé lefèvre' })
		expect(read('verifiee')).toMatchObject({ verified: true, superArtist: true })
		expect(read('masquee')).toMatchObject({ chosenStatus: 'hidden', status: 'hidden', publishable: true })
		expect(read('vide')).toMatchObject({ chosenStatus: 'automatic', firstName: null, gallery: [] })
		// Every text of the longest profile went through the bounds of the server, and kept its length.
		const long = read('textes-maximaux')
		const fixture = DEMO_PROFILES[11]?.profil
		expect([long.firstName, long.description, long.contactDetails?.email]).toEqual([
			fixture?.firstName,
			fixture?.description,
			fixture?.contactDetails?.email,
		])
		expect(long.gallery).toHaveLength(10)
	})

	test('photos fictives de moins de 30 Ko, chacune servie par son profil ; 0 objet orphelin', async () => {
		const mediaList = await allMedia()
		const objects = await listObjects()
		const profiles = await Promise.all(DEMO_PROFILES.map(type => profileOf(summary, type)))
		const served = profiles.flatMap(profil =>
			[profil.mainPicture, ...(profil.gallery ?? [])]
				.filter(photo => photo !== null && photo !== undefined)
				.map(photo => ({ media: idOf(photo), pro: idOf(profil.pro) }))
		)

		expect(mediaList).toHaveLength(UPLOADED_PHOTOS)
		// Every object has its media, every media its object: the same keys, the same sizes.
		expect(
			mediaList
				.flatMap(media => [
					{ cle: mediaKey(media.prefix, media.filename ?? ''), taille: media.filesize },
					// The derived sizes (ticket 133), next to the original.
					...Object.values(media.sizes ?? {}).flatMap(taille =>
						taille?.filename ? [{ cle: mediaKey(media.prefix, taille.filename), taille: taille.filesize }] : []
					),
				])
				// The order of the storage: byte by byte.
				.sort((a, b) => (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0))
		).toEqual(objects)
		// Every media is shown once, by the profile of the account that owns it.
		expect(served.map(({ media }) => media).sort((a, b) => Number(a) - Number(b))).toEqual(
			mediaList.map(({ id }) => id)
		)
		for (const media of mediaList)
			expect(served.find(servie => servie.media === media.id)?.pro).toBe(idOf(media.owner) as number)
		// The photos of the set weigh less than 30 KB; Payload re-encodes a WebP it stores (it reads
		// the type as possibly animated), so the stored object may weigh a little more, never twice as much.
		for (const { cle: key, taille: size } of objects) {
			expect([key, size < 2 * PHOTO_MAX_WEIGHT]).toEqual([key, true])
			expect(key).toStartWith(`${UPLOAD_PREFIX}/jeu-`)
		}
		// Each object is the photo of the set, byte for byte, under the name the set gives it.
		for (const type of DEMO_PROFILES) {
			const profile = profiles[DEMO_PROFILES.indexOf(type)]
			const expectedMany = [
				...(type.photos.principale ? [{ photo: type.photos.principale, nom: fileName(type.cle, 'principale') }] : []),
				...type.photos.galerie.map((photo, rang) => ({ photo, nom: fileName(type.cle, rang + 1) })),
			]
			const shown = [profile?.mainPicture, ...(profile?.gallery ?? [])].filter(
				photo => photo !== null && photo !== undefined
			)
			expect(shown).toHaveLength(expectedMany.length)
			for (const [rank, { photo, nom: name }] of expectedMany.entries()) {
				const media = mediaList.find(({ id }) => id === idOf(shown[rank]))
				expect({ nom: media?.filename, type: media?.mimeType }).toEqual({ nom: name, type: 'image/webp' })
				const object = await readObject(mediaKey(media?.prefix, name))
				const source = await readDemoPhoto(photo)
				expect(source.length).toBeLessThan(PHOTO_MAX_WEIGHT)
				// The same picture: Payload re-encodes a WebP, so the bytes are not the same, the dimensions are.
				const [stored, ofOrigin] = [
					await sharp(object?.octets ?? new Uint8Array()).metadata(),
					await sharp(source).metadata(),
				]
				expect([stored.format, stored.width, stored.height]).toEqual([ofOrigin.format, ofOrigin.width, ofOrigin.height])
			}
		}
		// Each photo says whose it is, in French.
		const altOf = (nom: string) => mediaList.find(({ filename }) => filename === nom)?.alt
		expect(altOf(fileName('reference', 'principale'))).toBe('Portrait d’Inès Morel')
		expect(altOf(fileName('reference', 2))).toBe('Réalisation d’Inès Morel, photo 2')
		expect(altOf(fileName('ville-voisine', 'principale'))).toBe('Portrait de Léa Garnier')
	})
})

describe('Rejouer le jeu', () => {
	afterEach(resetToZero)

	test(
		'un chargement sur base remplie ne crée rien ; deux chargements sur base vide donnent le même contenu',
		async () => {
			await resetToZero()
			const payload = await testPayload()
			const first = await placeDemoProfiles(payload)
			const content = await datasetContent(first)
			const lines = await countLines()
			const objects = await listObjects()

			const second = await placeDemoProfiles(payload)

			expect(second.crees).toEqual([])
			expect(second.presents).toEqual(KEYS)
			expect(second.profils).toEqual(first.profils)
			expect(await countLines()).toEqual(lines)
			expect(await listObjects()).toEqual(objects)

			await resetToZero()
			const afterReset = await placeDemoProfiles(payload)

			expect(afterReset.crees).toEqual(KEYS)
			// On an empty bench: the same identifiers, the same slugs…
			expect(afterReset.profils).toEqual(first.profils)
			// …and the same content, photos and objects included.
			expect(await datasetContent(afterReset)).toEqual(content)
		},
		3 * LOADING_MS
	)

	test(
		'un chargement interrompu ne laisse aucun document ; le suivant reprend tout, sans objet orphelin',
		async () => {
			await resetToZero()
			const payload = await testPayload()
			const outage = new Error('photo illisible')
			// The reference shows the six photos: it fails at the last one, after five of its photos are sent.
			const readPhoto = (photo: DemoPhoto) => (photo === 'photo-6.webp' ? Promise.reject(outage) : readDemoPhoto(photo))

			await expect(placeDemoProfiles(payload, { lirePhoto: readPhoto })).rejects.toBe(outage)

			// Its account, its profile and its media went with the transaction…
			expect(await countDocuments()).toMatchObject({ pros: 0, profiles: 0, media: 0 })
			// …but the objects already sent are still in the storage.
			const sent = await listObjects()
			// Each photo with its derived size (ticket 133).
			const sentNames = ([1, 2, 3, 4, 5, 'principale'] as const).map(place => fileName('reference', place))
			expect(sent.map(({ cle: key }) => key)).toEqual(
				sentNames
					.flatMap(nom => [nom, nom.replace(/\.webp$/, '-245x245.webp')])
					.map(nom => `${UPLOAD_PREFIX}/${nom}`)
					.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			)

			const summary = await placeDemoProfiles(payload)

			// The next load writes the same keys again: every object has its media, and nothing more.
			expect(summary.crees).toEqual(KEYS)
			const mediaList = await allMedia()
			expect(mediaList).toHaveLength(UPLOADED_PHOTOS)
			expect((await listObjects()).map(({ cle: key }) => key)).toEqual(
				mediaList
					.flatMap(media => [
						mediaKey(media.prefix, media.filename ?? ''),
						...Object.values(media.sizes ?? {}).flatMap(taille =>
							taille?.filename ? [mediaKey(media.prefix, taille.filename)] : []
						),
					])
					.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			)
		},
		3 * LOADING_MS
	)
})
