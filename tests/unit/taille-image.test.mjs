import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
	ECRAN_TRES_DENSE,
	FACTEUR_TRES_DENSE,
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

// What a browser does with `sizes` at a viewport width and a density: the
// first entry whose media conditions (min-resolution, max-width) all hold,
// then its length in CSS px.
function largeurChoisie(sizes, vw, dpr = 1) {
	const entrees = sizes.split(/,\s*(?![^(]*\))/)
	for (const entree of entrees) {
		const conditions = []
		let valeur = entree
		for (
			let c;
			(c = /^\((min-resolution|max-width): ([\d.]+)(dppx|px)\)(?: and)? /.exec(
				valeur
			));
		) {
			conditions.push({ nom: c[1], v: Number(c[2]) })
			valeur = valeur.slice(c[0].length)
		}
		const vraie = ({ nom, v }) => (nom === 'max-width' ? vw <= v : dpr >= v)
		if (!conditions.every(vraie)) continue
		const px = /^(\d+)px$/.exec(valeur)
		if (px) return Number(px[1])
		const calc =
			/^calc\(\(?100vw - (\d+)px\)?(?: \/ (\d+))?(?: \* ([\d.]+))?\)$/.exec(
				valeur
			)
		if (calc)
			return (
				((vw - Number(calc[1])) / Number(calc[2] ?? 1)) * Number(calc[3] ?? 1)
			)
		throw new Error(`valeur inattendue : ${valeur}`)
	}
	throw new Error(`aucune valeur pour ${vw}px : ${sizes}`)
}

// part of the drawn width asked at that density
const part = dpr => (dpr >= 2.5 ? FACTEUR_TRES_DENSE : 1)

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
		// on a 3x phone, 3/4 of it (2.25x)
		const sizes = px => `${ECRAN_TRES_DENSE} ${Math.ceil(px * 0.75)}px, ${px}px`
		assert.equal(ECRAN_TRES_DENSE, '(min-resolution: 2.5dppx)')
		assert.equal(FACTEUR_TRES_DENSE, 0.75)
		// main photo of a profile, 200 × 200
		assert.equal(
			sizesBoite({ largeur: 200, hauteur: 200, ratio: 1 }),
			'(min-resolution: 2.5dppx) 150px, 200px'
		)
		assert.equal(
			sizesBoite({ largeur: 200, hauteur: 200, ratio: 0.5 }),
			sizes(200)
		)
		assert.equal(
			sizesBoite({ largeur: 200, hauteur: 200, ratio: 4 / 3 }),
			'(min-resolution: 2.5dppx) 201px, 267px'
		)
		// slide of the portfolio: 500 px high, as wide as its photo
		assert.equal(sizesBoite({ hauteur: 500, ratio: 0.75 }), sizes(375))
		assert.equal(sizesBoite({ hauteur: 500, ratio: 16 / 9 }), sizes(889))
		// without dimensions: a 4:3 landscape
		assert.equal(RATIO_PAR_DEFAUT, 4 / 3)
		assert.equal(sizesBoite({ hauteur: 500, ratio: null }), sizes(667))
		assert.equal(sizesBoite({ largeur: 200, hauteur: 200 }), sizes(267))
	})

	test('search card: the exact sizes of a 4:3 and of a 3:4 photo', () => {
		const dense = `${ECRAN_TRES_DENSE} and`
		assert.equal(
			sizesGrille(GRILLE_RESULTATS, { hauteur: 350, ratio: 4 / 3 }),
			`${dense} (max-width: 498px) 351px, ` +
				`${dense} (max-width: 767px) calc((100vw - 32px) * 0.75), ` +
				`${dense} (max-width: 3089px) 351px, ` +
				`${ECRAN_TRES_DENSE} calc((100vw - 288px) * 0.125), ` +
				'(max-width: 498px) 467px, (max-width: 767px) calc(100vw - 32px), ' +
				'(max-width: 3089px) 467px, calc((100vw - 288px) / 6)'
		)
		assert.equal(
			sizesGrille(GRILLE_RESULTATS, { hauteur: 350, ratio: 0.75 }),
			`${dense} (max-width: 294px) 198px, ` +
				`${dense} (max-width: 767px) calc((100vw - 32px) * 0.75), ` +
				`${dense} (max-width: 980px) 198px, ` +
				`${dense} (max-width: 1535px) calc((100vw - 192px) * 0.25), ` +
				`${dense} (max-width: 1865px) 198px, ` +
				`${ECRAN_TRES_DENSE} calc((100vw - 288px) * 0.125), ` +
				'(max-width: 294px) 263px, (max-width: 767px) calc(100vw - 32px), ' +
				'(max-width: 980px) 263px, (max-width: 1535px) calc((100vw - 192px) / 3), ' +
				'(max-width: 1865px) 263px, calc((100vw - 288px) / 6)'
		)
	})

	test('search card: at every viewport width, the width the photo is drawn at (3/4 of it from 2.5 dppx)', () => {
		assert.equal(HAUTEUR_PHOTO_CARTE, 350)
		// ratios of the main pictures in production on 08/10: 0.46 to 1.78
		for (const ratio of [0.46, 0.56, 0.75, 0.88, 1, 4 / 3, 1.5, 1.78]) {
			const sizes = sizesGrille(GRILLE_RESULTATS, {
				hauteur: HAUTEUR_PHOTO_CARTE,
				ratio,
			})
			for (const dpr of [1, 2, 2.25, 2.5, 2.625, 3, 3.5])
				for (let vw = 320; vw <= 3840; vw += 1) {
					const dessinee = Math.max(
						largeurCellule(vw),
						Math.ceil(HAUTEUR_PHOTO_CARTE * ratio)
					)
					const attendue = dessinee * part(dpr)
					const choisie = largeurChoisie(sizes, vw, dpr)
					assert.ok(
						choisie >= attendue - 0.001 && choisie <= attendue + 1,
						`ratio ${ratio}, ${vw}px @${dpr}x : ${choisie} au lieu de ${attendue}`
					)
				}
		}
	})

	test('a 3x phone takes 2.25 device px per CSS px; a 2x screen, all of them', () => {
		const { deviceSizes } = require('../../next.config.js').images
		// the srcset of a card: the widths of the optimizer from 640
		const candidat = (sizes, vw, dpr) =>
			deviceSizes.find(l => l >= largeurChoisie(sizes, vw, dpr) * dpr)
		const paysage = sizesGrille(GRILLE_RESULTATS, {
			hauteur: 350,
			ratio: 4 / 3,
		})
		const portrait = sizesGrille(GRILLE_RESULTATS, {
			hauteur: 350,
			ratio: 0.75,
		})
		// 390 px phone: 467 px drawn (4:3), 358 px (3:4, the cell)
		assert.equal(candidat(paysage, 390, 3), 1080)
		assert.equal(candidat(portrait, 390, 3), 828)
		assert.equal(candidat(paysage, 390, 2), 1080)
		assert.equal(candidat(portrait, 390, 2), 750)
		// without the 3/4: 1440 and 1080
		assert.equal(
			deviceSizes.find(l => l >= 467 * 3),
			1440
		)
		assert.equal(
			deviceSizes.find(l => l >= 358 * 3),
			1080
		)
		// main photo of a profile (a srcset in px: the imageSizes of Next.js
		// too, not set in next.config.js): on a 3x phone, the 640 it got
		// before UI-09 (150 px × 3), whatever its shape
		const toutes = [16, 32, 48, 64, 96, 128, 256, 384, ...deviceSizes]
		for (const ratio of [0.75, 1, 4 / 3]) {
			const profil = sizesBoite({ largeur: 200, hauteur: 200, ratio })
			const besoin = largeurChoisie(profil, 390, 3) * 3
			assert.equal(
				toutes.find(l => l >= besoin),
				640,
				String(ratio)
			)
		}
		assert.equal(
			toutes.find(l => l >= 150 * 3),
			640
		)
	})

	test('grids of one and of two columns', () => {
		const une = [{ des: 0, colonnes: 1, retrait: 0 }]
		assert.equal(
			sizesGrille(une, { hauteur: 100, ratio: 2 }),
			`${ECRAN_TRES_DENSE} and (max-width: 199px) 150px, ` +
				`${ECRAN_TRES_DENSE} calc((100vw - 0px) * 0.75), ` +
				'(max-width: 199px) 200px, calc(100vw - 0px)'
		)
		assert.equal(
			sizesGrille([{ des: 0, colonnes: 2, retrait: 20 }], {
				hauteur: 10,
				ratio: 0.5,
			}),
			`${ECRAN_TRES_DENSE} and (max-width: 29px) 4px, ` +
				`${ECRAN_TRES_DENSE} calc((100vw - 20px) * 0.375), ` +
				'(max-width: 29px) 5px, calc((100vw - 20px) / 2)'
		)
	})

	test('85 is one of the qualities the optimizer makes, with 75 (shared pictures)', () => {
		const config = require('../../next.config.js')
		assert.equal(QUALITE_PHOTO, 85)
		assert.deepEqual(config.images.qualities, [75, 85])
	})

	test('widths of the optimizer: those of Next.js, plus 1440', () => {
		const { deviceSizes } = require('../../next.config.js').images
		// Next.js: 640, 750, 828, 1080, 1200, 1920, 2048, 3840; 828 for the
		// regression test of the card, 1200 for the shared pictures
		assert.deepEqual(
			deviceSizes,
			[640, 750, 828, 1080, 1200, 1440, 1920, 2048, 3840]
		)
		assert.ok(deviceSizes.includes(LARGEUR_PARTAGE))
		// a landscape portfolio slide on a 2x screen (1 334 px) no longer
		// takes 1920
		const diapo = sizesBoite({ hauteur: 500, ratio: 4 / 3 })
		assert.equal(
			deviceSizes.find(l => l >= largeurChoisie(diapo, 1440, 2) * 2),
			1440
		)
		// a decoration at 100vw on a 2x tablet (1 536 px) still takes 1920
		assert.equal(
			deviceSizes.find(l => l >= 768 * 2),
			1920
		)
	})
})
