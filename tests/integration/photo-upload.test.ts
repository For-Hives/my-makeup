import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import sharp from 'sharp'
import { PHOTO_SIZE_MAX, UPLOAD_MESSAGES, UPLOAD_REQUEST_SIZE_MAX } from '@/lib/photo-upload'
import { PHOTO_MESSAGES } from '@/lib/profile/photos'
import type { Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage, listObjects } from '../support/s3'
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

	test('un JPEG et un PNG valides passent ; l’extension suit le contenu, pas le nom envoyé', async () => {
		const account = await createAccount('maquilleuse')
		const jpeg = await send(account, file(await image('jpeg'), 'photo.png', 'image/png'))
		const png = await send(account, file(await image('png'), 'photo.jpg', 'image/jpeg'))
		expect([jpeg.statut, png.statut]).toEqual([201, 201])
		expect((jpeg.corps as { doc: Media }).doc.filename).toMatch(/\.jpg$/)
		expect((png.corps as { doc: Media }).doc.filename).toMatch(/\.png$/)
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

	test('une vraie image de 12 Mo : refusée en 400 avec le message de taille, rien d’écrit', async () => {
		const account = await createAccount('maquilleuse')
		const jpeg = await image('jpeg')
		const big = Buffer.concat([jpeg, Buffer.alloc(12 * 1024 * 1024 - jpeg.length)])
		expect(big.length).toBeGreaterThan(PHOTO_SIZE_MAX)
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
		expect(counter.lus).toBeLessThanOrEqual(UPLOAD_REQUEST_SIZE_MAX + 256 * 1024)
		expect(growth).toBeLessThan(25 * 1024 * 1024)
		expect(writes()).toEqual([])
		expect(await mediaCount()).toBe(0)
	})

	test('un envoi de 11 Mio par une maquilleuse : refusé avec le message français de taille', async () => {
		const account = await createAccount('maquilleuse')
		const { request, counter } = streamedUpload(11 * 1024 * 1024, account.session.enTetes)
		const response = await post(request)
		expect(response.status).toBe(413)
		expect(await response.text()).toContain(UPLOAD_MESSAGES.taille)
		expect(counter.lus).toBeLessThan(12 * 1024 * 1024 + 256 * 1024)
		expect(writes()).toEqual([])
		expect(await mediaCount()).toBe(0)
	})

	test('la limite de Payload est la constante du site', async () => {
		const { default: config } = await import('@/payload.config')
		const built = await config
		expect(built.upload?.limits?.fileSize).toBe(PHOTO_SIZE_MAX)
		expect(built.upload?.requestSizeLimit).toBe(UPLOAD_REQUEST_SIZE_MAX)
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
