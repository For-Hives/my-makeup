import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { convertToWebp } from '@/collections/Media'
import { photoLimitsFrom } from '@/lib/photo-limits'

/** Every accepted photo is stored as WebP, shrunk, upright and without metadata (ticket 309). */

const limits = photoLimitsFrom({})

/** A JPEG of 3000 × 2000 pixels carrying a GPS position and an orientation tag. */
const phonePhoto = () =>
	sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#c08080' } })
		.withMetadata({ orientation: 6 })
		.withExif({ IFD0: { Copyright: 'fictif' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' } })
		.jpeg()
		.toBuffer()

describe('convertToWebp', () => {
	test('WebP, grand côté borné, orientation appliquée, aucune métadonnée', async () => {
		const source = await phonePhoto()
		const before = await sharp(source).metadata()
		expect(before.exif).toBeDefined()
		expect(before.orientation).toBe(6)
		const out = await convertToWebp(source, limits)
		const meta = await sharp(out).metadata()
		expect(meta.format).toBe('webp')
		expect(meta.exif).toBeUndefined()
		// Orientation 6 turns the 3000 × 2000 picture upright: 2000 × 3000, then the long side is brought to 2000.
		expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2000)
		expect(meta.height).toBeGreaterThan(meta.width ?? 0)
	})

	test('une photo plus petite que la limite n’est pas agrandie', async () => {
		const small = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#808080' } })
			.png()
			.toBuffer()
		const meta = await sharp(await convertToWebp(small, limits)).metadata()
		expect([meta.format, meta.width, meta.height]).toEqual(['webp', 640, 480])
	})

	test('le côté et la qualité suivent les réglages', async () => {
		const source = await phonePhoto()
		const small = await convertToWebp(source, photoLimitsFrom({ PHOTO_SIDE_MAX_PX: '800', PHOTO_WEBP_QUALITY: '50' }))
		const big = await convertToWebp(source, limits)
		const meta = await sharp(small).metadata()
		expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(800)
		expect(small.length).toBeLessThan(big.length)
	})

	test('une image coupée est refusée, pas stockée', async () => {
		const source = await phonePhoto()
		await expect(convertToWebp(source.subarray(0, 200), limits)).rejects.toThrow()
	})
})
