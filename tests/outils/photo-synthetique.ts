/**
 * A large made-up photo, for the tests that need an original heavier than a preview may be (ticket 116):
 * smooth shapes under a fine grain, 2 400 x 1 600 px. It is not a person nor a place.
 */

import sharp from 'sharp'

export const LARGEUR_SYNTHETIQUE = 2400
export const HAUTEUR_SYNTHETIQUE = 1600

/** A WebP of 2 400 x 1 600 px, always the same bytes for the same call. */
export async function grandePhotoSynthetique(): Promise<Uint8Array> {
	const octets = Buffer.alloc(LARGEUR_SYNTHETIQUE * HAUTEUR_SYNTHETIQUE * 3)
	let graine = 12345
	const hasard = () => {
		graine = (graine * 1664525 + 1013904223) >>> 0
		return graine / 0x1_0000_0000
	}
	for (let y = 0; y < HAUTEUR_SYNTHETIQUE; y++) {
		for (let x = 0; x < LARGEUR_SYNTHETIQUE; x++) {
			const i = (y * LARGEUR_SYNTHETIQUE + x) * 3
			const grain = (hasard() - 0.5) * 40
			octets[i] = 128 + 100 * Math.sin(x / 90) * Math.cos(y / 140) + grain
			octets[i + 1] = 128 + 100 * Math.sin((x + y) / 160) + grain
			octets[i + 2] = 128 + 100 * Math.cos(x / 70 - y / 110) + grain
		}
	}
	return sharp(octets, { raw: { width: LARGEUR_SYNTHETIQUE, height: HAUTEUR_SYNTHETIQUE, channels: 3 } })
		.webp({ quality: 92 })
		.toBuffer()
}
