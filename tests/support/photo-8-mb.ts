/**
 * A made-up JPEG of about 8 MiB, for the tests of the reduction in the browser (ticket 134): smooth
 * shapes under a fine grain, 3 400 x 2 550 px, at full quality. The server would take it as it is
 * (10 MiB at most): only the browser reduces it below 1 MiB. It is not a person nor a place.
 */

import sharp from 'sharp'

export const LARGEUR_DE_8_MO = 3400
export const HAUTEUR_DE_8_MO = 2550

/** The same bytes for the same call. */
export async function photoDeHuitMo(): Promise<Buffer> {
	const octets = Buffer.alloc(LARGEUR_DE_8_MO * HAUTEUR_DE_8_MO * 3)
	let graine = 4242
	const hasard = () => {
		graine = (graine * 1664525 + 1013904223) >>> 0
		return graine / 0x1_0000_0000
	}
	for (let y = 0; y < HAUTEUR_DE_8_MO; y++) {
		for (let x = 0; x < LARGEUR_DE_8_MO; x++) {
			const i = (y * LARGEUR_DE_8_MO + x) * 3
			const grain = (hasard() - 0.5) * 28
			octets[i] = 128 + 90 * Math.sin(x / 130) * Math.cos(y / 170) + grain
			octets[i + 1] = 128 + 90 * Math.sin((x + y) / 190) + grain
			octets[i + 2] = 128 + 90 * Math.cos(x / 90 - y / 140) + grain
		}
	}
	return sharp(octets, { raw: { width: LARGEUR_DE_8_MO, height: HAUTEUR_DE_8_MO, channels: 3 } })
		.jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
		.toBuffer()
}
