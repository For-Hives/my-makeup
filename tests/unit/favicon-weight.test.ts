import { describe, expect, test } from 'bun:test'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The icon of the tab (issue 1033). Every first visit downloads `/favicon.webp`, at a high priority, once the page
 * is loaded; Lighthouse counts it in the simulated LCP of a page whose first paint came late. It was a 1 024 px
 * picture of 36 KB for an icon drawn at 16 to 32 px. 192 px is a multiple of 48, the size Google asks for to show
 * it in its results, and weighs a few kilobytes.
 */

const FILE = join(import.meta.dir, '../../public/favicon.webp')

/** Width and height of a WebP file, read in its header (lossy, lossless and extended forms). */
function webpSize(bytes: Buffer): { width: number; height: number } {
	expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
	expect(bytes.toString('ascii', 8, 12)).toBe('WEBP')
	const form = bytes.toString('ascii', 12, 16)
	if (form === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
	if (form === 'VP8L') {
		const bits = bytes.readUInt32LE(21)
		return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
	}
	return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
}

describe('l’icône de l’onglet', () => {
	test('est une image carrée de 192 px au plus', () => {
		const { width, height } = webpSize(readFileSync(FILE))
		expect(width).toBe(height)
		expect(width).toBeGreaterThanOrEqual(48)
		expect(width).toBeLessThanOrEqual(192)
		expect(width % 48).toBe(0)
	})

	test('pèse moins de 12 Ko', () => {
		expect(statSync(FILE).size).toBeLessThan(12 * 1024)
	})
})
