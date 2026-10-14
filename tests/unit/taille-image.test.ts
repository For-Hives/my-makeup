import { describe, expect, test } from 'bun:test'
import { ECRAN_TRES_DENSE, FACTEUR_TRES_DENSE, RATIO_PAR_DEFAUT, ratioMedia, sizesBoite } from '@/lib/taille-image'

/**
 * The width the photos of the makeup artists are asked at (plan 01 §3.2 UI-09): ported from
 * tests/unit/taille-image.test.mjs of the old site (branch main), same cases and values, for the box of
 * a photo of a fixed size or of its own shape (the main photo and the portfolio of a profile).
 */

describe('taille-image', () => {
	test('le ratio d’une photo : largeur sur hauteur, rien sans dimensions', () => {
		expect(ratioMedia({ width: 400, height: 200 })).toBe(2)
		for (const media of [
			null,
			undefined,
			{},
			{ width: 0, height: 10 },
			{ width: 10, height: -1 },
			{ width: '4', height: 3 },
		])
			expect(ratioMedia(media)).toBeNull()
	})

	test('les écrans très denses demandent les trois quarts de la largeur dessinée', () => {
		expect(ECRAN_TRES_DENSE).toBe('(min-resolution: 2.5dppx)')
		expect(FACTEUR_TRES_DENSE).toBe(0.75)
		expect(sizesBoite({ largeur: 200, hauteur: 200, ratio: 1 })).toBe('(min-resolution: 2.5dppx) 150px, 200px')
		expect(sizesBoite({ largeur: 200, hauteur: 200, ratio: 4 / 3 })).toBe('(min-resolution: 2.5dppx) 201px, 267px')
	})

	test('une photo plus étroite que sa boîte est demandée à la largeur de la boîte', () => {
		expect(sizesBoite({ largeur: 200, hauteur: 200, ratio: 0.5 })).toBe('(min-resolution: 2.5dppx) 150px, 200px')
	})

	test('la photo du portfolio : 500 px de haut, aussi large que sa photo', () => {
		expect(sizesBoite({ hauteur: 500, ratio: 0.75 })).toBe('(min-resolution: 2.5dppx) 282px, 375px')
		expect(sizesBoite({ hauteur: 500, ratio: 16 / 9 })).toBe('(min-resolution: 2.5dppx) 667px, 889px')
	})

	test('sans dimensions : un paysage 4:3, le plus coûteux des formats courants', () => {
		expect(RATIO_PAR_DEFAUT).toBe(4 / 3)
		expect(sizesBoite({ hauteur: 500, ratio: null })).toBe('(min-resolution: 2.5dppx) 501px, 667px')
		expect(sizesBoite({ largeur: 200, hauteur: 200 })).toBe(sizesBoite({ largeur: 200, hauteur: 200, ratio: 4 / 3 }))
	})
})
