/**
 * A large made-up photo, for the tests that need an original heavier than a preview may be (ticket 116):
 * smooth shapes under a fine grain, 2 400 x 1 600 px. It is not a person nor a place.
 */

import sharp from 'sharp'

export const SYNTHETIC_WIDTH = 2400
export const SYNTHETIC_HEIGHT = 1600

/** A WebP of 2 400 x 1 600 px, always the same bytes for the same call. */
export async function largePhotoSynthetic(): Promise<Uint8Array> {
	const bytes = Buffer.alloc(SYNTHETIC_WIDTH * SYNTHETIC_HEIGHT * 3)
	let seed = 12345
	const random = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0
		return seed / 0x1_0000_0000
	}
	for (let y = 0; y < SYNTHETIC_HEIGHT; y++) {
		for (let x = 0; x < SYNTHETIC_WIDTH; x++) {
			const i = (y * SYNTHETIC_WIDTH + x) * 3
			const grain = (random() - 0.5) * 40
			bytes[i] = 128 + 100 * Math.sin(x / 90) * Math.cos(y / 140) + grain
			bytes[i + 1] = 128 + 100 * Math.sin((x + y) / 160) + grain
			bytes[i + 2] = 128 + 100 * Math.cos(x / 70 - y / 110) + grain
		}
	}
	return sharp(bytes, { raw: { width: SYNTHETIC_WIDTH, height: SYNTHETIC_HEIGHT, channels: 3 } })
		.webp({ quality: 92 })
		.toBuffer()
}
