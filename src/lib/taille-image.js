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
 */

/** Quality of the artists' photos (one of images.qualities in next.config.js) */
export const QUALITE_PHOTO = 85

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
const largeurDessinee = (hauteur, ratio) =>
	Math.ceil(hauteur * (positif(ratio) ?? RATIO_PAR_DEFAUT))

/**
 * `sizes` of a photo drawn with object-fit: cover in a box of fixed size,
 * or in a box of its own ratio (`largeur` 0: only the height counts).
 * @param {{largeur?: number, hauteur: number, ratio?: number|null}} boite
 * @returns {string} e.g. '267px'
 */
export function sizesBoite({ largeur = 0, hauteur, ratio }) {
	return `${Math.max(Math.ceil(largeur), largeurDessinee(hauteur, ratio))}px`
}

/**
 * @typedef {object} Colonnes - from `des` px of viewport width on, a cell of
 *   the grid is (100vw - retrait) / colonnes wide
 * @property {number} des - viewport width, in px (0 for the first)
 * @property {number} colonnes
 * @property {number} retrait - paddings and gaps of a row, in px
 */

const largeurCellule = ({ colonnes, retrait }) =>
	colonnes === 1
		? `calc(100vw - ${retrait}px)`
		: `calc((100vw - ${retrait}px) / ${colonnes})`

/**
 * `sizes` of a photo drawn with object-fit: cover in a cell of a grid, at a
 * fixed height: the width of the cell, or the width of the photo drawn at
 * that height when the cell is narrower.
 * @param {Colonnes[]} grille - in increasing `des`, the first at 0
 * @param {{hauteur: number, ratio?: number|null}} photo
 * @returns {string}
 */
export function sizesGrille(grille, { hauteur, ratio }) {
	const dessinee = largeurDessinee(hauteur, ratio)
	const segments = []
	const ajouter = (jusqua, valeur) => {
		const dernier = segments.at(-1)
		if (dernier?.valeur === valeur) dernier.jusqua = jusqua
		else segments.push({ jusqua, valeur })
	}
	grille.forEach((colonnes, i) => {
		const fin = grille[i + 1]?.des ?? Infinity
		// below this viewport width, the cell is narrower than the photo
		const bascule = colonnes.colonnes * dessinee + colonnes.retrait
		if (bascule > colonnes.des) ajouter(Math.min(bascule, fin), `${dessinee}px`)
		if (bascule < fin) ajouter(fin, largeurCellule(colonnes))
	})
	return segments
		.map(({ jusqua, valeur }) =>
			jusqua === Infinity ? valeur : `(max-width: ${jusqua - 1}px) ${valeur}`
		)
		.join(', ')
}
