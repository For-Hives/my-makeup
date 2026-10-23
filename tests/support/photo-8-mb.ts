/**
 * A made-up JPEG of about 8 MiB, for the tests of the reduction in the browser (ticket 134): smooth
 * shapes under a fine grain, 3 400 x 2 550 px, at full quality. The server would take it as it is
 * (10 MiB at most): only the browser reduces it below 1 MiB. It is not a person nor a place.
 */

import sharp from 'sharp'

export const PHOTO_8_MB_WIDTH = 3400
export const PHOTO_8_MB_HEIGHT = 2550

/** The same bytes for the same call. */
export async function eightMbPhoto(): Promise<Buffer> {
	const bytes = Buffer.alloc(PHOTO_8_MB_WIDTH * PHOTO_8_MB_HEIGHT * 3)
	let seed = 4242
	const random = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0
		return seed / 0x1_0000_0000
	}
	for (let y = 0; y < PHOTO_8_MB_HEIGHT; y++) {
		for (let x = 0; x < PHOTO_8_MB_WIDTH; x++) {
			const i = (y * PHOTO_8_MB_WIDTH + x) * 3
			const grain = (random() - 0.5) * 28
			bytes[i] = 128 + 90 * Math.sin(x / 130) * Math.cos(y / 170) + grain
			bytes[i + 1] = 128 + 90 * Math.sin((x + y) / 190) + grain
			bytes[i + 2] = 128 + 90 * Math.cos(x / 90 - y / 140) + grain
		}
	}
	return sharp(bytes, { raw: { width: PHOTO_8_MB_WIDTH, height: PHOTO_8_MB_HEIGHT, channels: 3 } })
		.jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
		.toBuffer()
}
