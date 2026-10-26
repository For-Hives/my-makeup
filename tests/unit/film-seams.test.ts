/**
 * The seams of the film « L'Ombre nette » (docs/accueil.md, « Le film »): which frames must be one and the same, and
 * how far apart two frames are. The decoding of the real files is `bun run film:check` (scripts/film/check.ts), which
 * needs ffmpeg: here only its rules, on made-up frames.
 */

import { describe, expect, test } from 'bun:test'
import { FILM_STILLS, FILM_VIDEOS } from '@/components/home/film'
import { rmse, SEAM_LIMIT, seamsOf } from '../../scripts/film/seams'

describe('l’écart entre deux images', () => {
	test('nul entre deux images identiques, 1 entre le noir et le blanc', () => {
		const grey = new Uint8Array(12).fill(128)
		expect(rmse(grey, grey.slice())).toBe(0)
		expect(rmse(new Uint8Array(12), new Uint8Array(12).fill(255))).toBe(1)
	})

	test('la moyenne quadratique sur tous les canaux, ramenée à 0-1', () => {
		// One value of four moves by 51 (a fifth of 255): sqrt(51² / 4) / 255 = 0.1.
		const a = new Uint8Array([10, 20, 30, 40])
		const b = new Uint8Array([10, 20, 30, 91])
		expect(rmse(a, b)).toBeCloseTo(0.1, 10)
	})

	test('deux images de tailles différentes ne se comparent pas', () => {
		expect(() => rmse(new Uint8Array(3), new Uint8Array(6))).toThrow()
	})

	test('le seuil : en dessous de 0,01, le raccord ne se voit pas', () => {
		expect(SEAM_LIMIT).toBe(0.01)
	})
})

describe('les raccords du film', () => {
	const seams = seamsOf(FILM_VIDEOS, FILM_STILLS)
	const pairs = seams.map(({ a, b }) => `${a.src}#${a.frame} ${b.src}#${b.frame}`)

	test('chaque boucle revient à sa première image, et chaque intro finit sur la première image de sa boucle', () => {
		for (const [index, loop] of FILM_VIDEOS.loop.entries()) {
			const intro = FILM_VIDEOS.intro[index]
			expect(pairs).toContain(`${loop.src}#last ${loop.src}#first`)
			expect(pairs).toContain(`${intro?.src}#last ${loop.src}#first`)
		}
	})

	test('l’affiche du début est la première image de chaque intro, l’image de fin la première de chaque boucle', () => {
		for (const still of FILM_STILLS.start)
			for (const intro of FILM_VIDEOS.intro) expect(pairs).toContain(`${still.src}#first ${intro.src}#first`)
		for (const still of FILM_STILLS.end)
			for (const loop of FILM_VIDEOS.loop) expect(pairs).toContain(`${still.src}#first ${loop.src}#first`)
		const videos = FILM_VIDEOS.loop.length
		expect(seams).toHaveLength(2 * videos + (FILM_STILLS.start.length + FILM_STILLS.end.length) * videos)
	})

	test('une intro et une boucle qui n’ont pas les mêmes formats, dans le même ordre, sont refusées', () => {
		const [first, second] = FILM_VIDEOS.loop
		if (!(first && second)) throw new Error('il faut deux formats de boucle')
		expect(() => seamsOf({ intro: FILM_VIDEOS.intro, loop: [second, first] }, FILM_STILLS)).toThrow()
		expect(() => seamsOf({ intro: FILM_VIDEOS.intro, loop: [first] }, FILM_STILLS)).toThrow()
	})
})
