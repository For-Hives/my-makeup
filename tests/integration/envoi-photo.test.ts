import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import sharp from 'sharp'
import { PHOTO_SIZE_MAX, UPLOAD_MESSAGES } from '@/lib/photo-upload'
import { MESSAGES_DES_PHOTOS } from '@/lib/profile/photos'
import type { Media } from '@/payload-types'
import { type Espion, espionnerLeStockage, suppressionsSansCorbeille } from '../outils/espion-s3'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { listerLesObjets, viderLeStockage } from '../outils/s3'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * What the server takes from a makeup artist: real photos only (ticket 133; plan 02 §7.3, I23 and
 * I26; U79 to U81). Through the real REST API, against the S3 simulator of the bench.
 */

type Compte = Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>

let espion: Espion

beforeEach(() => {
	espion = espionnerLeStockage()
})

afterEach(async () => {
	const fautes = suppressionsSansCorbeille(espion.journal)
	espion.arreter()
	await Promise.all([viderLaBase(), viderLeStockage()])
	expect(fautes).toEqual([])
})

/** A real image of 1200 × 800 pixels, large enough for every derived size. */
const image = (format: 'webp' | 'jpeg' | 'png') =>
	sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c08080' } })
		[format]()
		.toBuffer()

const envoyer = (compte: Compte | undefined, fichier: File) =>
	appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte?.session.enTetes,
		formulaire: formulaireAvecFichier(fichier),
	})

const fichier = (octets: Uint8Array, nom: string, type: string) => new File([Uint8Array.from(octets)], nom, { type })

const nombreDeMedias = async () => (await (await payloadDeTest()).count({ collection: 'media' })).totalDocs

const ecritures = () => espion.journal.filter(commande => commande.nom === 'PutObject')

describe('I23 : une image valide est rangée sous une clé imprévisible, avec ses tailles', () => {
	test('un WebP valide : objet sous media/<uuid>.webp, tailles dérivées à côté, média rattaché à sa propriétaire (U81)', async () => {
		const compte = await creerCompte('maquilleuse')
		const { statut, corps, texte } = await envoyer(
			compte,
			fichier(await image('webp'), 'Mon Selfie Marie.webp', 'image/webp')
		)
		expect(statut).toBe(201)
		const media = (corps as { doc: Media }).doc
		expect(media.filename).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/)
		expect(media.mimeType).toBe('image/webp')
		expect(String(media.owner)).toBe(String(compte.id))
		// Nothing of the original name, in the address or anywhere in the answer.
		expect(texte.toLowerCase()).not.toContain('selfie')
		expect(media.url).toContain(`/media/${media.filename}`)
		const noms = Object.values(media.sizes ?? {}).map(taille => taille?.filename)
		expect(noms.filter(Boolean).length).toBeGreaterThanOrEqual(3)
		const cles = (await listerLesObjets('media/')).map(({ cle }) => cle).sort()
		expect(cles).toEqual([`media/${media.filename}`, ...noms.filter(nom => nom).map(nom => `media/${nom}`)].sort())
	})

	test('un JPEG et un PNG valides passent ; l’extension suit le contenu, pas le nom envoyé', async () => {
		const compte = await creerCompte('maquilleuse')
		const jpeg = await envoyer(compte, fichier(await image('jpeg'), 'photo.png', 'image/png'))
		const png = await envoyer(compte, fichier(await image('png'), 'photo.jpg', 'image/jpeg'))
		expect([jpeg.statut, png.statut]).toEqual([201, 201])
		expect((jpeg.corps as { doc: Media }).doc.filename).toMatch(/\.jpg$/)
		expect((png.corps as { doc: Media }).doc.filename).toMatch(/\.png$/)
	})
})

describe('I26 : PDF, SVG, HEIC, vidéo et 12 Mo sont refusés, rien n’est écrit (U79, U80)', () => {
	const octets = (...parties: (string | number[])[]) =>
		Buffer.concat(
			parties.map(partie => (typeof partie === 'string' ? Buffer.from(partie, 'latin1') : Buffer.from(partie)))
		)
	const refuses: [string, Buffer, string, string][] = [
		['un PDF', octets('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n'), 'cv.pdf', 'application/pdf'],
		['un PDF qui se dit JPEG', octets('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'), 'photo.jpg', 'image/jpeg'],
		[
			'un SVG',
			octets('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
			'a.svg',
			'image/svg+xml',
		],
		['un SVG qui se dit PNG', octets('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.png', 'image/png'],
		['un HEIC', octets([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'), 'iphone.heic', 'image/heic'],
		[
			'un HEIC qui se dit JPEG',
			octets([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'),
			'iphone.jpg',
			'image/jpeg',
		],
		['une vidéo MP4', octets([0, 0, 0, 24], 'ftypisom', [0, 0, 2, 0], 'isomiso2mp41'), 'film.mp4', 'video/mp4'],
		['un AVIF', octets([0, 0, 0, 24], 'ftypavif', [0, 0, 0, 0], 'avifmif1'), 'a.avif', 'image/avif'],
		['un GIF', octets('GIF89a', [1, 0, 1, 0, 0, 0, 0]), 'a.gif', 'image/gif'],
		['des octets quelconques nommés .jpg', octets('pas une image du tout'), 'x.jpg', 'image/jpeg'],
	]

	test.each(refuses)('%s : refusé en 400, aucun objet écrit, aucun média créé', async (_nom, contenu, nom, type) => {
		const compte = await creerCompte('maquilleuse')
		const { statut, texte } = await envoyer(compte, fichier(contenu, nom, type))
		expect(statut).toBe(400)
		expect(texte).toContain(UPLOAD_MESSAGES.type)
		expect(ecritures()).toEqual([])
		expect(await listerLesObjets()).toEqual([])
		expect(await nombreDeMedias()).toBe(0)
	})

	test('une vraie image de 12 Mo : refusée en 400 avec le message de taille, rien d’écrit', async () => {
		const compte = await creerCompte('maquilleuse')
		const jpeg = await image('jpeg')
		const gros = Buffer.concat([jpeg, Buffer.alloc(12 * 1024 * 1024 - jpeg.length)])
		expect(gros.length).toBeGreaterThan(PHOTO_SIZE_MAX)
		const { statut, texte } = await envoyer(compte, fichier(gros, 'gros.jpg', 'image/jpeg'))
		expect(statut).toBe(400)
		expect(texte).toContain(UPLOAD_MESSAGES.taille)
		expect(ecritures()).toEqual([])
		expect(await listerLesObjets()).toEqual([])
		expect(await nombreDeMedias()).toBe(0)
	})

	test('le remplacement du fichier d’un média par un PDF est refusé de même, l’objet reste', async () => {
		const compte = await creerCompte('maquilleuse')
		const { corps } = await envoyer(compte, fichier(await image('webp'), 'a.webp', 'image/webp'))
		const media = (corps as { doc: Media }).doc
		const avant = await listerLesObjets()
		const reponse = await appelerRest('PATCH', `/api/media/${media.id}?depth=0`, {
			enTetes: compte.session.enTetes,
			formulaire: formulaireAvecFichier(fichier(Buffer.from('%PDF-1.7\n'), 'b.pdf', 'application/pdf')),
		})
		expect(reponse.statut).toBe(400)
		expect(await listerLesObjets()).toEqual(avant)
	})
})

describe('Anonyme refusé', () => {
	test('sans session : refusé, rien d’écrit', async () => {
		const { statut } = await envoyer(undefined, fichier(await image('webp'), 'a.webp', 'image/webp'))
		expect(statut).toBe(403)
		expect(ecritures()).toEqual([])
		expect(await nombreDeMedias()).toBe(0)
	})
})

describe('Ajout du 14/10 : une photo au mauvais identifiant est refusée en 400, jamais en 500', () => {
	async function profilDe(compte: Compte) {
		const payload = await payloadDeTest()
		const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
			.docs
		if (!profil) throw new Error('La fabrique n’a pas créé de profil.')
		return profil
	}

	test.each([
		['galerie d’un texte', { gallery: ['abc'] }],
		['galerie d’un nombre trop grand', { gallery: [2_147_483_648] }],
		['photo principale décimale', { mainPicture: '1.5' }],
		['galerie d’un objet sans identifiant', { gallery: [{}] }],
		['photo principale en liste', { mainPicture: [5] }],
	])('%s : 400 avec le message français, le profil est inchangé', async (_nom, corps) => {
		const compte = await creerCompte('maquilleuse')
		const avant = await profilDe(compte)
		const reponse = await appelerRest('PATCH', `/api/profiles/${avant.id}?depth=0`, {
			enTetes: compte.session.enTetes,
			corps,
		})
		expect(reponse.statut).toBe(400)
		expect(reponse.texte).toContain(MESSAGES_DES_PHOTOS.photoRefusee)
		const apres = await profilDe(compte)
		expect([apres.mainPicture ?? null, apres.gallery ?? []]).toEqual([avant.mainPicture ?? null, avant.gallery ?? []])
	})
})
