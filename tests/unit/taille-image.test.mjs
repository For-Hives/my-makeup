import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
	QUALITE_PHOTO,
	RATIO_PAR_DEFAUT,
	ratioMedia,
	sizesBoite,
	sizesGrille,
} from '../../src/lib/taille-image.js'
import {
	GRILLE_RESULTATS,
	HAUTEUR_PHOTO_CARTE,
} from '../../src/lib/recherche.js'
import { LARGEUR_PARTAGE } from '../../src/lib/seo/meta.js'

const require = createRequire(import.meta.url)

// What a browser does with `sizes` at a viewport width: the first media
// condition that holds (max-width only here), then its length in CSS px.
function largeurChoisie(sizes, vw) {
	const entrees = sizes.split(/,\s*(?![^(]*\))/)
	for (const entree of entrees) {
		const condition = /^\(max-width: (\d+)px\) (.+)$/.exec(entree)
		if (condition && vw > Number(condition[1])) continue
		const valeur = condition ? condition[2] : entree
		const px = /^(\d+)px$/.exec(valeur)
		if (px) return Number(px[1])
		const calc = /^calc\(\(?100vw - (\d+)px\)?(?: \/ (\d+))?\)$/.exec(valeur)
		if (calc) return (vw - Number(calc[1])) / Number(calc[2] ?? 1)
		throw new Error(`valeur inattendue : ${valeur}`)
	}
	throw new Error(`aucune valeur pour ${vw}px : ${sizes}`)
}

// width of a cell of the results grid at a viewport width
function largeurCellule(vw) {
	const colonnes = GRILLE_RESULTATS.findLast(g => vw >= g.des)
	return (vw - colonnes.retrait) / colonnes.colonnes
}

describe('size of the artists’ photos (UI-09)', () => {
	test('ratio of a Strapi file, null without both dimensions', () => {
		assert.equal(ratioMedia({ width: 2000, height: 1500 }), 4 / 3)
		assert.equal(ratioMedia({ width: 900, height: 1200 }), 0.75)
		for (const media of [
			null,
			undefined,
			{},
			{ width: 2000 },
			{ width: 0, height: 10 },
			{ width: '2000', height: '1500' },
			{ width: Number.NaN, height: 1 },
		])
			assert.equal(ratioMedia(media), null, JSON.stringify(media))
	})

	test('box of fixed size: its width, or the photo drawn at its height when wider', () => {
		// main photo of a profile, 200 × 200
		assert.equal(sizesBoite({ largeur: 200, hauteur: 200, ratio: 1 }), '200px')
		assert.equal(
			sizesBoite({ largeur: 200, hauteur: 200, ratio: 0.5 }),
			'200px'
		)
		assert.equal(
			sizesBoite({ largeur: 200, hauteur: 200, ratio: 4 / 3 }),
			'267px'
		)
		// slide of the portfolio: 500 px high, as wide as its photo
		assert.equal(sizesBoite({ hauteur: 500, ratio: 0.75 }), '375px')
		assert.equal(sizesBoite({ hauteur: 500, ratio: 16 / 9 }), '889px')
		// without dimensions: a 4:3 landscape
		assert.equal(RATIO_PAR_DEFAUT, 4 / 3)
		assert.equal(sizesBoite({ hauteur: 500, ratio: null }), '667px')
		assert.equal(sizesBoite({ largeur: 200, hauteur: 200 }), '267px')
	})

	test('search card: the exact sizes of a 4:3 and of a 3:4 photo', () => {
		assert.equal(
			sizesGrille(GRILLE_RESULTATS, { hauteur: 350, ratio: 4 / 3 }),
			'(max-width: 498px) 467px, (max-width: 767px) calc(100vw - 32px), ' +
				'(max-width: 3089px) 467px, calc((100vw - 288px) / 6)'
		)
		assert.equal(
			sizesGrille(GRILLE_RESULTATS, { hauteur: 350, ratio: 0.75 }),
			'(max-width: 294px) 263px, (max-width: 767px) calc(100vw - 32px), ' +
				'(max-width: 980px) 263px, (max-width: 1535px) calc((100vw - 192px) / 3), ' +
				'(max-width: 1865px) 263px, calc((100vw - 288px) / 6)'
		)
	})

	test('search card: at every viewport width, the width the photo is drawn at', () => {
		assert.equal(HAUTEUR_PHOTO_CARTE, 350)
		// ratios of the main pictures in production on 08/10: 0.46 to 1.78
		for (const ratio of [0.46, 0.56, 0.75, 0.88, 1, 4 / 3, 1.5, 1.78]) {
			const sizes = sizesGrille(GRILLE_RESULTATS, {
				hauteur: HAUTEUR_PHOTO_CARTE,
				ratio,
			})
			for (let vw = 320; vw <= 3840; vw += 1) {
				const attendue = Math.max(
					largeurCellule(vw),
					Math.ceil(HAUTEUR_PHOTO_CARTE * ratio)
				)
				const choisie = largeurChoisie(sizes, vw)
				assert.ok(
					choisie >= attendue - 0.001 && choisie <= attendue + 1,
					`ratio ${ratio}, ${vw}px : ${choisie} au lieu de ${attendue}`
				)
			}
		}
	})

	test('grids of one and of two columns', () => {
		const une = [{ des: 0, colonnes: 1, retrait: 0 }]
		assert.equal(
			sizesGrille(une, { hauteur: 100, ratio: 2 }),
			'(max-width: 199px) 200px, calc(100vw - 0px)'
		)
		assert.equal(
			sizesGrille([{ des: 0, colonnes: 2, retrait: 20 }], {
				hauteur: 10,
				ratio: 0.5,
			}),
			'(max-width: 29px) 5px, calc((100vw - 20px) / 2)'
		)
	})

	test('85 is one of the qualities the optimizer makes, with 75 (shared pictures)', () => {
		const config = require('../../next.config.js')
		assert.equal(QUALITE_PHOTO, 85)
		assert.deepEqual(config.images.qualities, [75, 85])
	})

	test('widths of the optimizer: no jump wider than 1.33 up to 1920, 828 and 1200 kept', () => {
		const { deviceSizes } = require('../../next.config.js').images
		assert.deepEqual(
			[...deviceSizes].sort((a, b) => a - b),
			deviceSizes
		)
		// 828 for the regression test of the card, 1200 for the shared pictures
		for (const largeur of [828, LARGEUR_PARTAGE, 1920, 3840])
			assert.ok(deviceSizes.includes(largeur), String(largeur))
		const jusqua1920 = deviceSizes.filter(l => l <= 1920)
		for (let i = 1; i < jusqua1920.length; i++)
			assert.ok(
				jusqua1920[i] / jusqua1920[i - 1] <= 1.33,
				`${jusqua1920[i - 1]} → ${jusqua1920[i]}`
			)
		// a landscape card on a 3x phone (1 401 px) no longer takes 1920
		const besoin = Math.ceil(HAUTEUR_PHOTO_CARTE * (4 / 3)) * 3
		assert.equal(
			deviceSizes.find(l => l >= besoin),
			1440
		)
	})
})
