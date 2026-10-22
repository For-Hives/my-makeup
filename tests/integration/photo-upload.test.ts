import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import sharp from 'sharp'
import { photoLimits, uploadRequestSizeMax } from '@/lib/photo-limits'
import { UPLOAD_MESSAGES } from '@/lib/photo-upload'
import { PHOTO_MESSAGES } from '@/lib/profile/photos'
import type { Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage, listObjects, readObject } from '../support/s3'
import { deletionsWithoutTrash, type Spy, spyStorage } from '../support/s3-spy'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * What the server takes from a makeup artist: real photos only (ticket 133; plan 02 §7.3, I23 and
 * I26; U79 to U81). Through the real REST API, against the S3 simulator of the bench.
 */

type Account = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>

let spy: Spy

beforeEach(() => {
	spy = spyStorage()
})

afterEach(async () => {
	const faults = deletionsWithoutTrash(spy.journal)
	spy.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
	expect(faults).toEqual([])
})

/** A real image of 1200 × 800 pixels, large enough for every derived size. */
const image = (format: 'webp' | 'jpeg' | 'png') =>
	sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c08080' } })
		[format]()
		.toBuffer()

const send = (compte: Account | undefined, fichier: File) =>
	callRest('POST', '/api/media?depth=0', {
		enTetes: compte?.session.enTetes,
		formulaire: formWithFile(fichier),
	})

const file = (octets: Uint8Array, nom: string, type: string) => new File([Uint8Array.from(octets)], nom, { type })

const mediaCount = async () => (await (await testPayload()).count({ collection: 'media' })).totalDocs

const writes = () => spy.journal.filter(commande => commande.nom === 'PutObject')

describe('I23 : une image valide est rangée sous une clé imprévisible, avec ses tailles', () => {
	test('un WebP valide : objet sous media/<uuid>.webp, tailles dérivées à côté, média rattaché à sa propriétaire (U81)', async () => {
		const account = await createAccount('maquilleuse')
		const {
			statut: status,
			corps,
			texte: text,
		} = await send(account, file(await image('webp'), 'Mon Selfie Marie.webp', 'image/webp'))
		expect(status).toBe(201)
		const media = (corps as { doc: Media }).doc
		expect(media.filename).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/)
		expect(media.mimeType).toBe('image/webp')
		expect(String(media.owner)).toBe(String(account.id))
		// Nothing of the original name, in the address or anywhere in the answer.
		expect(text.toLowerCase()).not.toContain('selfie')
		expect(media.url).toContain(`/media/${media.filename}`)
		const names = Object.values(media.sizes ?? {}).map(taille => taille?.filename)
		expect(names.filter(Boolean).length).toBeGreaterThanOrEqual(3)
		const keys = (await listObjects('media/')).map(({ cle }) => cle).sort()
		expect(keys).toEqual([`media/${media.filename}`, ...names.filter(nom => nom).map(nom => `media/${nom}`)].sort())
	})

	test('un JPEG et un PNG valides passent ; ils sont rangés en WebP, quel que soit le nom envoyé (ticket 309)', async () => {
		const account = await createAccount('maquilleuse')
		const jpeg = await send(account, file(await image('jpeg'), 'photo.png', 'image/png'))
		const png = await send(account, file(await image('png'), 'photo.jpg', 'image/jpeg'))
		expect([jpeg.statut, png.statut]).toEqual([201, 201])
		expect((jpeg.corps as { doc: Media }).doc.filename).toMatch(/\.webp$/)
		expect((png.corps as { doc: Media }).doc.filename).toMatch(/\.webp$/)
		expect((png.corps as { doc: Media }).doc.mimeType).toBe('image/webp')
	})
})

describe('I26 : PDF, SVG, HEIC, vidéo et 12 Mo sont refusés, rien n’est écrit (U79, U80)', () => {
	const bytes = (...parties: (string | number[])[]) =>
		Buffer.concat(
			parties.map(partie => (typeof partie === 'string' ? Buffer.from(partie, 'latin1') : Buffer.from(partie)))
		)
	const refuses: [string, Buffer, string, string][] = [
		['un PDF', bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n'), 'cv.pdf', 'application/pdf'],
		['un PDF qui se dit JPEG', bytes('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'), 'photo.jpg', 'image/jpeg'],
		[
			'un SVG',
			bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
			'a.svg',
			'image/svg+xml',
		],
		['un SVG qui se dit PNG', bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.png', 'image/png'],
		['un HEIC', bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'), 'iphone.heic', 'image/heic'],
		['un HEIC qui se dit JPEG', bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'), 'iphone.jpg', 'image/jpeg'],
		['une vidéo MP4', bytes([0, 0, 0, 24], 'ftypisom', [0, 0, 2, 0], 'isomiso2mp41'), 'film.mp4', 'video/mp4'],
		['un AVIF', bytes([0, 0, 0, 24], 'ftypavif', [0, 0, 0, 0], 'avifmif1'), 'a.avif', 'image/avif'],
		['un GIF', bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0]), 'a.gif', 'image/gif'],
		['des octets quelconques nommés .jpg', bytes('pas une image du tout'), 'x.jpg', 'image/jpeg'],
	]

	test.each(refuses)('%s : refusé en 400, aucun objet écrit, aucun média créé', async (_nom, contenu, nom, type) => {
		const account = await createAccount('maquilleuse')
		const { statut: status, texte: text } = await send(account, file(contenu, nom, type))
		expect(status).toBe(400)
		expect(text).toContain(UPLOAD_MESSAGES.type)
		expect(writes()).toEqual([])
		expect(await listObjects()).toEqual([])
		expect(await mediaCount()).toBe(0)
	})

	test('une vraie image au-delà du plafond de l’envoi : refusée avec le message de taille, rien d’écrit', async () => {
		const account = await createAccount('maquilleuse')
		const jpeg = await image('jpeg')
		const big = Buffer.concat([jpeg, Buffer.alloc(photoLimits().uploadBytes + 1024 - jpeg.length)])
		expect(big.length).toBeGreaterThan(photoLimits().uploadBytes)
		const { statut: status, texte: text } = await send(account, file(big, 'gros.jpg', 'image/jpeg'))
		// Cut by the parser at the limit (ticket 273): 413 with the same message, not read to the end.
		expect(status).toBe(413)
		expect(text).toContain(UPLOAD_MESSAGES.taille)
		expect(writes()).toEqual([])
		expect(await listObjects()).toEqual([])
		expect(await mediaCount()).toBe(0)
	})

	test('le remplacement du fichier d’un média par un PDF est refusé de même, l’objet reste', async () => {
		const account = await createAccount('maquilleuse')
		const { corps } = await send(account, file(await image('webp'), 'a.webp', 'image/webp'))
		const media = (corps as { doc: Media }).doc
		const before = await listObjects()
		const response = await callRest('PATCH', `/api/media/${media.id}?depth=0`, {
			enTetes: account.session.enTetes,
			formulaire: formWithFile(file(Buffer.from('%PDF-1.7\n'), 'b.pdf', 'application/pdf')),
		})
		expect(response.statut).toBe(400)
		expect(await listObjects()).toEqual(before)
	})
})

describe('Anonyme refusé', () => {
	test('sans session : refusé, rien d’écrit', async () => {
		const { statut: status } = await send(undefined, file(await image('webp'), 'a.webp', 'image/webp'))
		expect(status).toBe(403)
		expect(writes()).toEqual([])
		expect(await mediaCount()).toBe(0)
	})
})

describe('Ticket 273 : un envoi trop gros est coupé avant d’être lu', () => {
	/** A multipart body of a file of `taille` bytes, produced chunk by chunk; `lus` counts what the server pulled. */
	function streamedUpload(taille: number, session?: Record<string, string>) {
		const boundary = '----limite273'
		const head = Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="gros.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
		)
		const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
		const chunk = Buffer.alloc(64 * 1024, 1)
		const counter = { lus: 0 }
		let sent = 0
		let step = 0
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				let part: Uint8Array
				if (step === 0) {
					part = head
					step = 1
				} else if (sent < taille) {
					part = chunk.subarray(0, Math.min(chunk.length, taille - sent))
					sent += part.length
				} else if (step === 1) {
					part = tail
					step = 2
				} else {
					controller.close()
					return
				}
				counter.lus += part.length
				controller.enqueue(part)
			},
		})
		const request = new Request(new URL('/api/media?depth=0', process.env.NEXT_PUBLIC_SITE_URL), {
			method: 'POST',
			headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...session },
			body,
			duplex: 'half',
		} as RequestInit)
		return { request, counter }
	}

	const post = async (request: Request) => {
		const { POST } = await import('@/app/(payload)/api/[...slug]/route')
		return POST(request, { params: Promise.resolve({ slug: ['media'] }) })
	}

	test('un POST anonyme de 30 Mio : 413, pas plus de la limite lue, rien d’écrit', async () => {
		const total = 30 * 1024 * 1024
		const { request, counter } = streamedUpload(total)
		const rssBefore = process.memoryUsage().rss
		const response = await post(request)
		const growth = process.memoryUsage().rss - rssBefore
		expect([403, 413]).toContain(response.status)
		// The server stopped pulling at the limit of the request, far from the 30 MiB offered.
		expect(counter.lus).toBeLessThanOrEqual(uploadRequestSizeMax() + 256 * 1024)
		expect(growth).toBeLessThan(25 * 1024 * 1024)
		expect(writes()).toEqual([])
		expect(await mediaCount()).toBe(0)
	})

	test('un envoi de 13 Mio par une maquilleuse : refusé avec le message français de taille', async () => {
		const account = await createAccount('maquilleuse')
		const { request, counter } = streamedUpload(13 * 1024 * 1024, account.session.enTetes)
		const response = await post(request)
		expect(response.status).toBe(413)
		expect(await response.text()).toContain(UPLOAD_MESSAGES.taille)
		expect(counter.lus).toBeLessThan(uploadRequestSizeMax() + 256 * 1024)
		expect(writes()).toEqual([])
		expect(await mediaCount()).toBe(0)
	})

	test('la limite de Payload est le réglage du site', async () => {
		const { default: config } = await import('@/payload.config')
		const built = await config
		expect(built.upload?.limits?.fileSize).toBe(photoLimits().uploadBytes)
		expect(built.upload?.requestSizeLimit).toBe(uploadRequestSizeMax())
	})
})

describe('Ajout du 14/10 : une photo au mauvais identifiant est refusée en 400, jamais en 500', () => {
	async function profileOf(compte: Account) {
		const payload = await testPayload()
		const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
			.docs
		if (!profile) throw new Error('La fabrique n’a pas créé de profil.')
		return profile
	}

	test.each([
		['galerie d’un texte', { gallery: ['abc'] }],
		['galerie d’un nombre trop grand', { gallery: [2_147_483_648] }],
		['photo principale décimale', { mainPicture: '1.5' }],
		['galerie d’un objet sans identifiant', { gallery: [{}] }],
		['photo principale en liste', { mainPicture: [5] }],
	])('%s : 400 avec le message français, le profil est inchangé', async (_nom, corps) => {
		const account = await createAccount('maquilleuse')
		const before = await profileOf(account)
		const response = await callRest('PATCH', `/api/profiles/${before.id}?depth=0`, {
			enTetes: account.session.enTetes,
			corps,
		})
		expect(response.statut).toBe(400)
		expect(response.texte).toContain(PHOTO_MESSAGES.photoRefusee)
		const after = await profileOf(account)
		expect([after.mainPicture ?? null, after.gallery ?? []]).toEqual([before.mainPicture ?? null, before.gallery ?? []])
	})
})

describe('Ticket 309 : tout est rangé en WebP, sans métadonnées, et une maquilleuse ne se sert pas du site comme d’un stockage', () => {
	const MIB = 1024 * 1024
	const saved: Record<string, string | undefined> = {}
	const setting = (name: string, value: string) => {
		if (!(name in saved)) saved[name] = process.env[name]
		process.env[name] = value
	}
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
		for (const name of Object.keys(saved)) delete saved[name]
	})

	const docOf = (response: { corps: unknown }) => (response.corps as { doc: Media }).doc

	/** A phone photo: 3000 × 2000 pixels, a GPS position and an orientation tag. */
	const phonePhoto = () =>
		sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#c08080' } })
			.withMetadata({ orientation: 6 })
			.withExif({ IFD0: { Copyright: 'fictif' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' } })
			.jpeg()
			.toBuffer()

	test('l’objet rangé est un WebP de 2000 px au plus, sans EXIF ni GPS ; ses tailles dérivées aussi', async () => {
		const account = await createAccount('maquilleuse')
		const source = await phonePhoto()
		expect((await sharp(source).metadata()).exif).toBeDefined()
		const response = await send(account, file(source, 'IMG_0001.JPG', 'image/jpeg'))
		expect(response.statut).toBe(201)
		const media = docOf(response)
		const stored = await readObject(`media/${media.filename}`)
		if (!stored) throw new Error('L’objet n’est pas dans le stockage.')
		expect(stored.type).toBe('image/webp')
		const meta = await sharp(stored.octets).metadata()
		expect(meta.format).toBe('webp')
		expect(meta.exif).toBeUndefined()
		expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2000)
		expect(stored.octets.length).toBe(media.filesize ?? -1)
		expect(media.mimeType).toBe('image/webp')
		expect(media.filename).toMatch(/\.webp$/)
		for (const size of Object.values(media.sizes ?? {})) {
			if (!size?.filename) continue
			const derived = await readObject(`media/${size.filename}`)
			expect(derived?.type).toBe('image/webp')
			expect((await sharp(derived?.octets).metadata()).format).toBe('webp')
		}
		// Heavier originals shrink: the stored photo is lighter than the file sent.
		expect(stored.octets.length).toBeLessThan(source.length)
	})

	test('le côté long et la qualité sont des réglages', async () => {
		setting('PHOTO_SIDE_MAX_PX', '800')
		const account = await createAccount('maquilleuse')
		const media = docOf(await send(account, file(await phonePhoto(), 'a.jpg', 'image/jpeg')))
		const stored = await readObject(`media/${media.filename}`)
		const meta = await sharp(stored?.octets).metadata()
		expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(800)
	})

	test('au nombre maximal de photos : refusée côté serveur (409), rien d’écrit, aucun média de plus', async () => {
		setting('PHOTO_PROFILE_MAX_COUNT', '2')
		const account = await createAccount('maquilleuse')
		const png = await image('png')
		expect((await send(account, file(png, 'a.png', 'image/png'))).statut).toBe(201)
		expect((await send(account, file(png, 'b.png', 'image/png'))).statut).toBe(201)
		const objects = await listObjects()
		const putsBefore = writes().length
		const third = await send(account, file(png, 'c.png', 'image/png'))
		expect(third.statut).toBe(409)
		expect(third.texte).toContain('limite de 2 photos')
		expect(writes().length).toBe(putsBefore)
		expect(await listObjects()).toEqual(objects)
		expect(await mediaCount()).toBe(2)
	})

	test('au volume maximal : refusée (409) avec le message du volume, rien d’écrit', async () => {
		setting('PHOTO_PROFILE_MAX_MB', '1')
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		// 1 Mo moins quelques octets déjà pris, par un média repris de l’ancien site (sans fichier envoyé).
		await payload.create({
			collection: 'media',
			data: {
				filename: 'ancienne.webp',
				prefix: '7',
				mimeType: 'image/webp',
				filesize: MIB - 10,
				owner: Number(account.id),
			},
			context: { skipCloudStorage: true },
			overrideAccess: true,
		})
		const response = await send(account, file(await image('webp'), 'a.webp', 'image/webp'))
		expect(response.statut).toBe(409)
		expect(response.texte).toContain('ne rentre pas dans ton espace')
		expect(writes()).toEqual([])
		expect(await listObjects()).toEqual([])
		expect(await mediaCount()).toBe(1)
	})

	test('un profil déjà au-dessus de la limite garde ses photos et n’en ajoute plus ; sous la limite il ajoute à nouveau', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const seeded: (number | string)[] = []
		for (const name of ['x', 'y', 'z']) {
			const media = await payload.create({
				collection: 'media',
				data: {
					filename: `${name}.jpg`,
					prefix: '7',
					mimeType: 'image/jpeg',
					filesize: 1000,
					owner: Number(account.id),
				},
				context: { skipCloudStorage: true },
				overrideAccess: true,
			})
			seeded.push(media.id)
		}
		setting('PHOTO_PROFILE_MAX_COUNT', '2')
		const png = await image('png')
		expect((await send(account, file(png, 'a.png', 'image/png'))).statut).toBe(409)
		// Her photos are still there: nothing was deleted nor converted.
		expect(await mediaCount()).toBe(3)
		const kept = await payload.findByID({ collection: 'media', id: seeded[0] as number, depth: 0 })
		expect([kept.filename, kept.mimeType]).toEqual(['x.jpg', 'image/jpeg'])
		// Removing two puts her under the limit again (one left, the limit is two).
		await payload.delete({
			collection: 'media',
			id: seeded[0] as number,
			overrideAccess: true,
			context: { skipCloudStorage: true },
		})
		await payload.delete({
			collection: 'media',
			id: seeded[1] as number,
			overrideAccess: true,
			context: { skipCloudStorage: true },
		})
		expect((await send(account, file(png, 'b.png', 'image/png'))).statut).toBe(201)
	})

	test('la limite est celle de chaque maquilleuse : l’autre n’est pas gênée', async () => {
		setting('PHOTO_PROFILE_MAX_COUNT', '1')
		const first = await createAccount('maquilleuse')
		const second = await createAccount('maquilleuse')
		const png = await image('png')
		expect((await send(first, file(png, 'a.png', 'image/png'))).statut).toBe(201)
		expect((await send(first, file(png, 'b.png', 'image/png'))).statut).toBe(409)
		expect((await send(second, file(png, 'c.png', 'image/png'))).statut).toBe(201)
	})

	test('l’admin et la rédaction ne sont pas soumises à la limite du profil', async () => {
		setting('PHOTO_PROFILE_MAX_COUNT', '1')
		const artist = await createAccount('maquilleuse')
		const admin = await createAccount('admin')
		const editor = await createAccount('redaction')
		const png = await image('png')
		expect((await send(artist, file(png, 'a.png', 'image/png'))).statut).toBe(201)
		for (const index of [1, 2]) {
			const response = await callRest('POST', '/api/media?depth=0', {
				enTetes: admin.session.enTetes,
				formulaire: formWithFile(file(png, `admin-${index}.png`, 'image/png'), { owner: Number(artist.id) }),
			})
			expect(response.statut).toBe(201)
		}
		for (const name of ['r.png', 'r2.png']) {
			const response = await callRest('POST', '/api/media?depth=0', {
				enTetes: editor.session.enTetes,
				formulaire: formWithFile(file(png, name, 'image/png')),
			})
			expect(response.statut).toBe(201)
		}
	})

	test('le remplacement du fichier d’une photo ne compte pas une photo de plus', async () => {
		setting('PHOTO_PROFILE_MAX_COUNT', '1')
		const account = await createAccount('maquilleuse')
		const png = await image('png')
		const media = docOf(await send(account, file(png, 'a.png', 'image/png')))
		const response = await callRest('PATCH', `/api/media/${media.id}?depth=0`, {
			enTetes: account.session.enTetes,
			formulaire: formWithFile(file(await image('jpeg'), 'b.jpg', 'image/jpeg')),
		})
		expect(response.statut).toBe(200)
		expect(await mediaCount()).toBe(1)
	})
})
