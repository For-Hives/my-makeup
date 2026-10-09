/**
 * Width at which the artists' photos are asked to the image optimizer
 * (UI-09, plans/01 §3.2). next/image picks a width in its srcset from
 * `sizes`, the width the picture takes on screen. A photo drawn with
 * object-fit: cover in a box of fixed height takes more than the width of
 * its box as soon as it is wider than the box: a 4:3 photo in a search card
 * of 356 × 350 px is drawn 467 px wide, then cropped. `sizes` has to give
 * that width, or a 3x phone gets a picture the browser enlarges (the blurred
 * search cards of 08/10: 640 px asked for 1 400 px on screen).
 *
 * Plain px and calc() only in `sizes` (CSS max() is not read there by every
 * browser): the ranges of viewport widths where the height decides are
 * written as media conditions.
 *
 * Screens of 2.5 dppx and more (3x phones) get 3/4 of that width: 2.25
 * device px per CSS px instead of 3, hardly visible at arm's length, for a
 * third fewer bytes on the LCP of a phone (a 4:3 search card: 1080w at q85,
 * 41 KB, instead of 1440w, 61 KB). A browser that does not read
 * min-resolution in `sizes` skips those entries and takes the full width.
 */

/** Quality of the artists' photos (one of images.qualities in next.config.js) */
export const QUALITE_PHOTO = 85

/** Screens whose photos are asked below their density (3x phones) */
export const ECRAN_TRES_DENSE = '(min-resolution: 2.5dppx)'

/** Part of the drawn width asked on those screens: 2.25x on a 3x screen */
export const FACTEUR_TRES_DENSE = 0.75

/**
 * Ratio assumed for a photo without dimensions (every main picture has them
 * in production, 08/10): a 4:3 landscape, the costliest common shape.
 */
export const RATIO_PAR_DEFAUT = 4 / 3

const positif = v => (Number.isFinite(v) && v > 0 ? v : null)

/**
 * @param {{width?: unknown, height?: unknown}|null|undefined} media
 * @returns {number|null} width / height, null when unknown
 */
export function ratioMedia(media) {
	const largeur = positif(media?.width)
	const hauteur = positif(media?.height)
	return largeur && hauteur ? largeur / hauteur : null
}

/** Width of a photo of that ratio drawn at that height, in whole px */
const largeurDessinee = (hauteur, ratio) => Math.ceil(hauteur * (positif(ratio) ?? RATIO_PAR_DEFAUT))

/**
 * A width of `sizes`, times `facteur`: fixed ({px}) or a cell of a grid
 * ({colonnes, retrait}, see Colonnes).
 */
function longueur(largeur, facteur = 1) {
	if ('px' in largeur) return `${Math.ceil(largeur.px * facteur)}px`
	const { colonnes, retrait } = largeur
	if (facteur !== 1) return `calc((100vw - ${retrait}px) * ${facteur / colonnes})`
	return colonnes === 1 ? `calc(100vw - ${retrait}px)` : `calc((100vw - ${retrait}px) / ${colonnes})`
}

/**
 * `sizes` from its entries, in order (`condition` null for the last): those
 * of the very dense screens first, at FACTEUR_TRES_DENSE, then the others.
 * @param {{condition: string|null, largeur: object}[]} entrees
 */
function ecrireSizes(entrees) {
	const denses = entrees.map(
		({ condition, largeur }) =>
			`${[ECRAN_TRES_DENSE, condition].filter(Boolean).join(' and ')} ${longueur(largeur, FACTEUR_TRES_DENSE)}`
	)
	const autres = entrees.map(({ condition, largeur }) => [condition, longueur(largeur)].filter(Boolean).join(' '))
	return [...denses, ...autres].join(', ')
}

/**
 * `sizes` of a photo drawn with object-fit: cover in a box of fixed size,
 * or in a box of its own ratio (`largeur` 0: only the height counts).
 * @param {{largeur?: number, hauteur: number, ratio?: number|null}} boite
 * @returns {string} e.g. '(min-resolution: 2.5dppx) 201px, 267px'
 */
export function sizesBoite({ largeur = 0, hauteur, ratio }) {
	const px = Math.max(Math.ceil(largeur), largeurDessinee(hauteur, ratio))
	return ecrireSizes([{ condition: null, largeur: { px } }])
}

/**
 * @typedef {object} Colonnes - from `des` px of viewport width on, a cell of
 *   the grid is (100vw - retrait) / colonnes wide
 * @property {number} des - viewport width, in px (0 for the first)
 * @property {number} colonnes
 * @property {number} retrait - paddings and gaps of a row, in px
 */

/**
 * `sizes` of a photo drawn with object-fit: cover in a cell of a grid, at a
 * fixed height: the width of the cell, or the width of the photo drawn at
 * that height when the cell is narrower.
 * @param {Colonnes[]} grille - in increasing `des`, the first at 0
 * @param {{hauteur: number, ratio?: number|null}} photo
 * @returns {string}
 */
export function sizesGrille(grille, { hauteur, ratio }) {
	const dessinee = { px: largeurDessinee(hauteur, ratio) }
	const segments = []
	const ajouter = (jusqua, largeur) => {
		const dernier = segments.at(-1)
		if (dernier && longueur(dernier.largeur) === longueur(largeur)) dernier.jusqua = jusqua
		else segments.push({ jusqua, largeur })
	}
	for (const [i, colonnes] of grille.entries()) {
		const fin = grille[i + 1]?.des ?? Infinity
		// below this viewport width, the cell is narrower than the photo
		const bascule = colonnes.colonnes * dessinee.px + colonnes.retrait
		if (bascule > colonnes.des) ajouter(Math.min(bascule, fin), dessinee)
		if (bascule < fin) ajouter(fin, colonnes)
	}
	return ecrireSizes(
		segments.map(({ jusqua, largeur }) => ({
			condition: jusqua === Infinity ? null : `(max-width: ${jusqua - 1}px)`,
			largeur,
		}))
	)
}
