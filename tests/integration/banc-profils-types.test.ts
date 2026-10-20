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

const CLES = DEMO_PROFILES.map(({ cle }) => cle)

/** How many photos the set sends: one media each. */
const PHOTOS_ENVOYEES = DEMO_PROFILES.reduce(
	(total, { photos }) => total + (photos.principale ? 1 : 0) + photos.galerie.length,
	0
)

/** The longest a load of the set may take: about 4 seconds on an empty bench (14/10/2026). */
const CHARGEMENT_MS = 15_000

const remettreAZero = () => Promise.all([emptyBase(), emptyStorage()])

const empreinte = (octets: Uint8Array) => createHash('sha256').update(octets).digest('hex')

/** The profile of a type, as the database holds it, read with every right. */
async function profilDu(bilan: ProfilesSummary, type: DemoProfile): Promise<Profile> {
	const pose = bilan.profils.find(({ cle }) => cle === type.cle)
	if (!pose) throw new Error(`le profil type « ${type.cle} » manque au bilan`)
	const payload = await testPayload()
	return payload.findByID({ collection: 'profiles', id: pose.profil, depth: 0 })
}

/** Every media of the bench, read with every right. */
async function lesMedias(): Promise<Media[]> {
	const payload = await testPayload()
	return (await payload.find({ collection: 'media', depth: 0, pagination: false, sort: 'id' })).docs
}

const idDe = (valeur: number | { id: number } | null | undefined) => (typeof valeur === 'object' ? valeur?.id : valeur)

/** What the server writes itself at each save: its dates are not the content of the set. */
const HORS_CONTENU = new Set(['id', 'createdAt', 'updatedAt', 'activeSince', 'publishableSince', 'fullyEmptySince'])

/** A document without its identifiers and its dates, at every depth: the rows of its lists included. */
function sansIdentite(valeur: unknown): unknown {
	if (Array.isArray(valeur)) return valeur.map(sansIdentite)
	if (typeof valeur !== 'object' || valeur === null) return valeur
	return Object.fromEntries(
		Object.entries(valeur)
			.filter(([cle]) => !HORS_CONTENU.has(cle))
			.map(([cle, contenu]) => [cle, sansIdentite(contenu)])
	)
}

/**
 * The whole content of the set in the database and in the storage, without what changes from one
 * load to the next by nature (identifiers, dates of the server): each account, its profile, and
 * each photo with the bytes of its object.
 */
async function contenuDuJeu(bilan: ProfilesSummary) {
	const payload = await testPayload()
	const medias = new Map((await lesMedias()).map(media => [media.id, media]))
	const photo = async (id: number | null | undefined) => {
		const media = id === null || id === undefined ? undefined : medias.get(id)
		if (!media?.filename) return null
		const objet = await readObject(mediaKey(media.prefix, media.filename))
		return { ...(sansIdentite(media) as object), owner: undefined, objet: objet ? empreinte(objet.octets) : null }
	}
	return Promise.all(
		DEMO_PROFILES.map(async type => {
			const profil = await profilDu(bilan, type)
			const compte: Pro = await payload.findByID({ collection: 'pros', id: Number(idDe(profil.pro)), depth: 0 })
			return {
				compte: { email: compte.email, nom: compte.name, verified: compte._verified },
				profil: { ...(sansIdentite(profil) as object), pro: undefined, mainPicture: undefined, gallery: undefined },
				mainPicture: await photo(idDe(profil.mainPicture)),
				gallery: await Promise.all((profil.gallery ?? []).map(id => photo(idDe(id)))),
			}
		})
	)
}

beforeAll(async () => {
	// Payload starts before the first load.
	await testPayload()
})

describe('Le jeu du banc : les 12 profils types', () => {
	let bilan: ProfilesSummary

	beforeAll(async () => {
		await remettreAZero()
		bilan = await placeDemoProfiles(await testPayload())
	}, CHARGEMENT_MS)

	afterAll(remettreAZero)

	test('12 profils, chacun relié à sa maquilleuse fictive, confirmée, sous le slug attendu', async () => {
		const payload = await testPayload()

		expect(bilan.cible).toBe('banc')
		expect(bilan.crees).toEqual(CLES)
		expect(bilan.presents).toEqual([])
		expect((await payload.count({ collection: 'profiles' })).totalDocs).toBe(12)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(12)
		for (const type of DEMO_PROFILES) {
			const profil = await profilDu(bilan, type)
			const compte = await payload.findByID({ collection: 'pros', id: Number(idDe(profil.pro)), depth: 0 })
			expect({ cle: type.cle, email: compte.email, nom: compte.name, confirme: compte._verified }).toEqual({
				cle: type.cle,
				...type.compte,
				confirme: true,
			})
			expect({ cle: type.cle, slug: profil.slug }).toEqual({ cle: type.cle, slug: type.attendu.slug })
			expect(bilan.profils.find(({ cle }) => cle === type.cle)).toEqual({
				cle: type.cle,
				compte: compte.id,
				profil: profil.id,
				slug: type.attendu.slug,
			})
		}
	})

	test('états calculés conformes aux fixtures : la référence publiable, le profil vide ni actif ni publiable', async () => {
		for (const type of DEMO_PROFILES) {
			const profil = await profilDu(bilan, type)
			const { slug: _slug, ...attendu } = type.attendu
			const stocke = {
				completeness: profil.completeness,
				active: profil.active,
				publishable: profil.publishable,
				fullyEmpty: profil.fullyEmpty,
				status: profil.status,
			}

			expect({ cle: type.cle, etat: stocke }).toEqual({ cle: type.cle, etat: attendu })
			// What the server stored is what the single rule reads in what it stored.
			const { completeness, active, publishable, fullyEmpty } = profileState(profil)
			expect({
				completeness: stocke.completeness,
				active: stocke.active,
				publishable: stocke.publishable,
				fullyEmpty: stocke.fullyEmpty,
			}).toEqual({ completeness, active, publishable, fullyEmpty })
		}

		const reference = await profilDu(bilan, DEMO_PROFILES[0] as DemoProfile)
		expect({ publishable: reference.publishable, status: reference.status }).toEqual({
			publishable: true,
			status: 'published',
		})
		const vide = await profilDu(bilan, DEMO_PROFILES[5] as DemoProfile)
		expect({ active: vide.active, publishable: vide.publishable, status: vide.status }).toEqual({
			active: false,
			publishable: false,
			status: 'draft',
		})
	})

	test('ce que chaque type porte est enregistré tel quel : contact de la référence, disponibilité, ancien nom, masque', async () => {
		const parCle = new Map(
			await Promise.all(DEMO_PROFILES.map(async type => [type.cle, await profilDu(bilan, type)] as const))
		)
		const lire = (cle: string) => {
			const profil = parCle.get(cle)
			if (!profil) throw new Error(`pas de profil « ${cle} »`)
			return profil
		}

		// The reference publishes its phone and its email, with the trace of the consent of the set.
		expect(lire('reference')).toMatchObject({
			publicContact: true,
			contactDetails: { phone: '06 39 98 10 01', email: 'contact@ines-morel.example.test' },
			consentedAt: '2026-09-01T08:00:00.000Z',
			consentSource: 'artist',
		})
		expect(lire('reference').serviceOffers?.map(({ priceFrom }) => priceFrom)).toEqual([180, 60, 45])
		expect(lire('reference').gallery).toHaveLength(6)
		expect(lire('indisponible').available).toBe(false)
		expect(lire('disponibilite-inconnue').available).toBeNull()
		expect(lire('ville-voisine').city).toMatchObject({ name: 'Annemasse', inseeCode: '74012', department: '74' })
		expect(lire('ville-eloignee').city).toMatchObject({ name: 'Nantes', inseeCode: '44109', department: '44' })
		expect(lire('sans-contact-public')).toMatchObject({ publicContact: false, consentedAt: null })
		expect(lire('ancien-nom-accentue')).toMatchObject({ slug: 'zoe-lefevre', legacyUsername: 'zoé lefèvre' })
		expect(lire('verifiee')).toMatchObject({ verified: true, superArtist: true })
		expect(lire('masquee')).toMatchObject({ chosenStatus: 'hidden', status: 'hidden', publishable: true })
		expect(lire('vide')).toMatchObject({ chosenStatus: 'automatic', firstName: null, gallery: [] })
		// Every text of the longest profile went through the bounds of the server, and kept its length.
		const longue = lire('textes-maximaux')
		const fixture = DEMO_PROFILES[11]?.profil
		expect([longue.firstName, longue.description, longue.contactDetails?.email]).toEqual([
			fixture?.firstName,
			fixture?.description,
			fixture?.contactDetails?.email,
		])
		expect(longue.gallery).toHaveLength(10)
	})

	test('photos fictives de moins de 30 Ko, chacune servie par son profil ; 0 objet orphelin', async () => {
		const medias = await lesMedias()
		const objets = await listObjects()
		const profils = await Promise.all(DEMO_PROFILES.map(type => profilDu(bilan, type)))
		const servies = profils.flatMap(profil =>
			[profil.mainPicture, ...(profil.gallery ?? [])]
				.filter(photo => photo !== null && photo !== undefined)
				.map(photo => ({ media: idDe(photo), pro: idDe(profil.pro) }))
		)

		expect(medias).toHaveLength(PHOTOS_ENVOYEES)
		// Every object has its media, every media its object: the same keys, the same sizes.
		expect(
			medias
				.flatMap(media => [
					{ cle: mediaKey(media.prefix, media.filename ?? ''), taille: media.filesize },
					// The derived sizes (ticket 133), next to the original.
					...Object.values(media.sizes ?? {}).flatMap(taille =>
						taille?.filename ? [{ cle: mediaKey(media.prefix, taille.filename), taille: taille.filesize }] : []
					),
				])
				// The order of the storage: byte by byte.
				.sort((a, b) => (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0))
		).toEqual(objets)
		// Every media is shown once, by the profile of the account that owns it.
		expect(servies.map(({ media }) => media).sort((a, b) => Number(a) - Number(b))).toEqual(medias.map(({ id }) => id))
		for (const media of medias)
			expect(servies.find(servie => servie.media === media.id)?.pro).toBe(idDe(media.owner) as number)
		// The photos of the set weigh less than 30 KB; Payload re-encodes a WebP it stores (it reads
		// the type as possibly animated), so the stored object may weigh a little more, never twice as much.
		for (const { cle, taille } of objets) {
			expect([cle, taille < 2 * PHOTO_MAX_WEIGHT]).toEqual([cle, true])
			expect(cle).toStartWith(`${UPLOAD_PREFIX}/jeu-`)
		}
		// Each object is the photo of the set, byte for byte, under the name the set gives it.
		for (const type of DEMO_PROFILES) {
			const profil = profils[DEMO_PROFILES.indexOf(type)]
			const attendues = [
				...(type.photos.principale ? [{ photo: type.photos.principale, nom: fileName(type.cle, 'principale') }] : []),
				...type.photos.galerie.map((photo, rang) => ({ photo, nom: fileName(type.cle, rang + 1) })),
			]
			const montrees = [profil?.mainPicture, ...(profil?.gallery ?? [])].filter(
				photo => photo !== null && photo !== undefined
			)
			expect(montrees).toHaveLength(attendues.length)
			for (const [rang, { photo, nom }] of attendues.entries()) {
				const media = medias.find(({ id }) => id === idDe(montrees[rang]))
				expect({ nom: media?.filename, type: media?.mimeType }).toEqual({ nom, type: 'image/webp' })
				const objet = await readObject(mediaKey(media?.prefix, nom))
				const source = await readDemoPhoto(photo)
				expect(source.length).toBeLessThan(PHOTO_MAX_WEIGHT)
				// The same picture: Payload re-encodes a WebP, so the bytes are not the same, the dimensions are.
				const [stocke, deLOrigine] = [
					await sharp(objet?.octets ?? new Uint8Array()).metadata(),
					await sharp(source).metadata(),
				]
				expect([stocke.format, stocke.width, stocke.height]).toEqual([
					deLOrigine.format,
					deLOrigine.width,
					deLOrigine.height,
				])
			}
		}
		// Each photo says whose it is, in French.
		const altDe = (nom: string) => medias.find(({ filename }) => filename === nom)?.alt
		expect(altDe(fileName('reference', 'principale'))).toBe('Portrait d’Inès Morel')
		expect(altDe(fileName('reference', 2))).toBe('Réalisation d’Inès Morel, photo 2')
		expect(altDe(fileName('ville-voisine', 'principale'))).toBe('Portrait de Léa Garnier')
	})
})

describe('Rejouer le jeu', () => {
	afterEach(remettreAZero)

	test(
		'un chargement sur base remplie ne crée rien ; deux chargements sur base vide donnent le même contenu',
		async () => {
			await remettreAZero()
			const payload = await testPayload()
			const premier = await placeDemoProfiles(payload)
			const contenu = await contenuDuJeu(premier)
			const lignes = await countLines()
			const objets = await listObjects()

			const second = await placeDemoProfiles(payload)

			expect(second.crees).toEqual([])
			expect(second.presents).toEqual(CLES)
			expect(second.profils).toEqual(premier.profils)
			expect(await countLines()).toEqual(lignes)
			expect(await listObjects()).toEqual(objets)

			await remettreAZero()
			const apresRemiseAZero = await placeDemoProfiles(payload)

			expect(apresRemiseAZero.crees).toEqual(CLES)
			// On an empty bench: the same identifiers, the same slugs…
			expect(apresRemiseAZero.profils).toEqual(premier.profils)
			// …and the same content, photos and objects included.
			expect(await contenuDuJeu(apresRemiseAZero)).toEqual(contenu)
		},
		3 * CHARGEMENT_MS
	)

	test(
		'un chargement interrompu ne laisse aucun document ; le suivant reprend tout, sans objet orphelin',
		async () => {
			await remettreAZero()
			const payload = await testPayload()
			const panne = new Error('photo illisible')
			// The reference shows the six photos: it fails at the last one, after five of its photos are sent.
			const lirePhoto = (photo: DemoPhoto) => (photo === 'photo-6.webp' ? Promise.reject(panne) : readDemoPhoto(photo))

			await expect(placeDemoProfiles(payload, { lirePhoto })).rejects.toBe(panne)

			// Its account, its profile and its media went with the transaction…
			expect(await countDocuments()).toMatchObject({ pros: 0, profiles: 0, media: 0 })
			// …but the objects already sent are still in the storage.
			const envoyes = await listObjects()
			// Each photo with its derived size (ticket 133).
			const nomsEnvoyes = ([1, 2, 3, 4, 5, 'principale'] as const).map(place => fileName('reference', place))
			expect(envoyes.map(({ cle }) => cle)).toEqual(
				nomsEnvoyes
					.flatMap(nom => [nom, nom.replace(/\.webp$/, '-245x245.webp')])
					.map(nom => `${UPLOAD_PREFIX}/${nom}`)
					.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			)

			const bilan = await placeDemoProfiles(payload)

			// The next load writes the same keys again: every object has its media, and nothing more.
			expect(bilan.crees).toEqual(CLES)
			const medias = await lesMedias()
			expect(medias).toHaveLength(PHOTOS_ENVOYEES)
			expect((await listObjects()).map(({ cle }) => cle)).toEqual(
				medias
					.flatMap(media => [
						mediaKey(media.prefix, media.filename ?? ''),
						...Object.values(media.sizes ?? {}).flatMap(taille =>
							taille?.filename ? [mediaKey(media.prefix, taille.filename)] : []
						),
					])
					.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			)
		},
		3 * CHARGEMENT_MS
	)
})
