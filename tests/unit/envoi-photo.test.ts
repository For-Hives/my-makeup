import { describe, expect, test } from 'bun:test'
import {
	juger,
	MESSAGES_D_ENVOI,
	nomImprevisible,
	TAILLE_MAX_PHOTO,
	TYPES_DE_PHOTO,
	typeDeLaPhoto,
} from '@/lib/photo-upload'

/** What a photo sent to the site may be (ticket 133; plan 02 U79, U80, U81). */

const octets = (...parties: (string | number[])[]) =>
	new Uint8Array(Buffer.concat(parties.map(p => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))))

const JPEG = octets([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF')
const PNG = octets([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const WEBP = octets('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')

describe('U79 : JPEG, PNG, WebP acceptés ; SVG, AVIF, HEIC, PDF, MP4 refusés, sur le contenu', () => {
	test('les trois types sont reconnus à leurs premiers octets', () => {
		expect([typeDeLaPhoto(JPEG), typeDeLaPhoto(PNG), typeDeLaPhoto(WEBP)]).toEqual([
			'image/jpeg',
			'image/png',
			'image/webp',
		])
	})

	test.each([
		['PDF', octets('%PDF-1.7')],
		['SVG', octets('<svg xmlns="http://www.w3.org/2000/svg"/>')],
		['HEIC', octets([0, 0, 0, 24], 'ftypheic')],
		['AVIF', octets([0, 0, 0, 24], 'ftypavif')],
		['MP4', octets([0, 0, 0, 24], 'ftypisom')],
		['GIF', octets('GIF89a')],
		['RIFF qui n’est pas du WebP (WAV)', octets('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
		['vide', new Uint8Array()],
		['un PNG coupé', PNG.slice(0, 5)],
	])('%s : refusé avec le message de l’ancien site', (_nom, contenu) => {
		expect(typeDeLaPhoto(contenu)).toBeUndefined()
		expect(juger(contenu)).toEqual({ accepte: false, message: MESSAGES_D_ENVOI.type })
	})

	test('un fichier accepté rend son type', () => {
		expect(juger(WEBP)).toEqual({ accepte: true, type: 'image/webp' })
	})
})

describe('U80 : 10 Mo au plus par fichier', () => {
	test('10 Mo passent, un octet de plus est refusé avant même de lire le type', () => {
		expect(TAILLE_MAX_PHOTO).toBe(10 * 1024 * 1024)
		expect(juger(JPEG, TAILLE_MAX_PHOTO).accepte).toBe(true)
		expect(juger(JPEG, TAILLE_MAX_PHOTO + 1)).toEqual({ accepte: false, message: MESSAGES_D_ENVOI.taille })
		expect(juger(octets('%PDF'), 12 * 1024 * 1024)).toEqual({ accepte: false, message: MESSAGES_D_ENVOI.taille })
	})
})

describe('U81 : le nom rangé est un UUID et l’extension du vrai type', () => {
	test('rien du nom d’origine, deux appels ne donnent pas le même nom', () => {
		const motif = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/
		const noms = [nomImprevisible('image/jpeg'), nomImprevisible('image/jpeg')]
		expect(noms.every(nom => motif.test(nom))).toBe(true)
		expect(new Set(noms).size).toBe(2)
		expect(nomImprevisible('image/webp', 'abc')).toBe('abc.webp')
		expect(Object.values(TYPES_DE_PHOTO).sort()).toEqual(['jpg', 'png', 'webp'])
	})
})
