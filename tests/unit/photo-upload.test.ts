import { describe, expect, test } from 'bun:test'
import { judge, PHOTO_SIZE_MAX, PHOTO_TYPES, photoType, UPLOAD_MESSAGES, unpredictableName } from '@/lib/photo-upload'

/** What a photo sent to the site may be (ticket 133; plan 02 U79, U80, U81). */

const bytes = (...parties: (string | number[])[]) =>
	new Uint8Array(Buffer.concat(parties.map(p => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))))

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF')
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const WEBP = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')

describe('U79 : JPEG, PNG, WebP acceptés ; SVG, AVIF, HEIC, PDF, MP4 refusés, sur le contenu', () => {
	test('les trois types sont reconnus à leurs premiers octets', () => {
		expect([photoType(JPEG), photoType(PNG), photoType(WEBP)]).toEqual(['image/jpeg', 'image/png', 'image/webp'])
	})

	test.each([
		['PDF', bytes('%PDF-1.7')],
		['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
		['HEIC', bytes([0, 0, 0, 24], 'ftypheic')],
		['AVIF', bytes([0, 0, 0, 24], 'ftypavif')],
		['MP4', bytes([0, 0, 0, 24], 'ftypisom')],
		['GIF', bytes('GIF89a')],
		['RIFF qui n’est pas du WebP (WAV)', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
		['vide', new Uint8Array()],
		['un PNG coupé', PNG.slice(0, 5)],
	])('%s : refusé avec le message de l’ancien site', (_nom, contenu) => {
		expect(photoType(contenu)).toBeUndefined()
		expect(judge(contenu)).toEqual({ accepte: false, message: UPLOAD_MESSAGES.type })
	})

	test('un fichier accepté rend son type', () => {
		expect(judge(WEBP)).toEqual({ accepte: true, type: 'image/webp' })
	})
})

describe('U80 : 10 Mo au plus par fichier', () => {
	test('10 Mo passent, un octet de plus est refusé avant même de lire le type', () => {
		expect(PHOTO_SIZE_MAX).toBe(10 * 1024 * 1024)
		expect(judge(JPEG, PHOTO_SIZE_MAX).accepte).toBe(true)
		expect(judge(JPEG, PHOTO_SIZE_MAX + 1)).toEqual({ accepte: false, message: UPLOAD_MESSAGES.taille })
		expect(judge(bytes('%PDF'), 12 * 1024 * 1024)).toEqual({ accepte: false, message: UPLOAD_MESSAGES.taille })
	})
})

describe('U81 : le nom rangé est un UUID et l’extension du vrai type', () => {
	test('rien du nom d’origine, deux appels ne donnent pas le même nom', () => {
		const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/
		const names = [unpredictableName('image/jpeg'), unpredictableName('image/jpeg')]
		expect(names.every(nom => pattern.test(nom))).toBe(true)
		expect(new Set(names).size).toBe(2)
		expect(unpredictableName('image/webp', 'abc')).toBe('abc.webp')
		expect(Object.values(PHOTO_TYPES).sort()).toEqual(['jpg', 'png', 'webp'])
	})
})
