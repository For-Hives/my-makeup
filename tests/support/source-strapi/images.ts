/**
 * The pictures of the fake Strapi source: small PNG files of one colour, written byte by byte.
 *
 * The deflate stream holds « stored » blocks only, without compression, so the same width, height
 * and colour always give the same bytes, whatever the version of zlib on the machine: the
 * fingerprint of the source covers the content of every object.
 *
 * Only Node's own modules: no API of bun.
 */

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Largest payload of one stored deflate block. */
const BLOCK_MAX = 0xffff

const TABLE_CRC = Array.from({ length: 256 }, (_vide, n) => {
	let c = n
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	return c >>> 0
})

/** CRC-32 of the PNG chunks (ISO 3309, the one of zlib). */
export function crc32(octets: Uint8Array): number {
	let crc = 0xffffffff
	for (const octet of octets) crc = (TABLE_CRC[(crc ^ octet) & 0xff] ?? 0) ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

/** Adler-32, the checksum that ends a zlib stream. */
function adler32(octets: Uint8Array): number {
	let a = 1
	let b = 0
	for (const octet of octets) {
		a = (a + octet) % 65521
		b = (b + a) % 65521
	}
	return ((b << 16) | a) >>> 0
}

const integer32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]

/** Appends bytes one by one: a spread of a large array would overflow the call stack. */
function add(cible: number[], octets: ArrayLike<number>): void {
	for (let i = 0; i < octets.length; i++) cible.push(octets[i] ?? 0)
}

/** A zlib stream made of stored blocks: the data as it is, framed. */
function zlibWithoutCompression(donnees: Uint8Array): Uint8Array {
	// 0x78 0x01: deflate, 32 KiB window, no dictionary; the pair is a multiple of 31, as zlib requires.
	const bytes: number[] = [0x78, 0x01]
	let startedAt = 0
	do {
		const block = donnees.subarray(startedAt, startedAt + BLOCK_MAX)
		startedAt += block.length
		const length = block.length
		add(bytes, [
			startedAt >= donnees.length ? 1 : 0,
			length & 0xff,
			length >>> 8,
			~length & 0xff,
			(~length >>> 8) & 0xff,
		])
		add(bytes, block)
	} while (startedAt < donnees.length)
	add(bytes, integer32(adler32(donnees)))
	return Uint8Array.from(bytes)
}

function chunk(type: string, donnees: Uint8Array): number[] {
	const typeAndData: number[] = []
	add(typeAndData, new TextEncoder().encode(type))
	add(typeAndData, donnees)
	const bytes = integer32(donnees.length)
	add(bytes, typeAndData)
	add(bytes, integer32(crc32(Uint8Array.from(typeAndData))))
	return bytes
}

export interface Color {
	rouge: number
	vert: number
	bleu: number
}

/** A PNG of `largeur` × `hauteur` pixels, all of the same colour (8 bits, RGB). */
export function pngPlain(largeur: number, hauteur: number, { rouge, vert, bleu }: Color): Uint8Array {
	if (!(Number.isInteger(largeur) && Number.isInteger(hauteur) && largeur > 0 && hauteur > 0))
		throw new Error('Une image a une largeur et une hauteur entières, au moins 1 pixel.')
	// Each line starts with its filter type, 0 (none), then one RGB triple per pixel.
	const pixels = new Uint8Array(hauteur * (1 + 3 * largeur))
	for (let y = 0; y < hauteur; y++)
		for (let x = 0; x < largeur; x++) pixels.set([rouge, vert, bleu], y * (1 + 3 * largeur) + 1 + 3 * x)
	// 8 bits per sample, colour type 2 (RGB), default compression and filter, no interlace.
	const header = Uint8Array.from([...integer32(largeur), ...integer32(hauteur), 8, 2, 0, 0, 0])
	const bytes: number[] = [...SIGNATURE_PNG]
	add(bytes, chunk('IHDR', header))
	add(bytes, chunk('IDAT', zlibWithoutCompression(pixels)))
	add(bytes, chunk('IEND', new Uint8Array()))
	return Uint8Array.from(bytes)
}
