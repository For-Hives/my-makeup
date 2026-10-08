/**
 * Browser ports of `preparerPhoto` (src/lib/photo.js): read the first bytes,
 * decode the picture, draw it on a canvas and encode it. Browser only, run
 * by the Playwright scenarios (tests/regression), the decisions themselves
 * are unit tested in photo.js.
 */

import { preparerPhoto } from './photo.js'

async function lireTete(fichier) {
	return new Uint8Array(await fichier.slice(0, 16).arrayBuffer())
}

function toile(largeur, hauteur) {
	if (typeof OffscreenCanvas === 'function')
		return new OffscreenCanvas(largeur, hauteur)
	const canvas = document.createElement('canvas')
	canvas.width = largeur
	canvas.height = hauteur
	return canvas
}

function encoderToile(canvas, type, qualite) {
	if (typeof canvas.convertToBlob === 'function')
		return canvas.convertToBlob({ type, quality: qualite })
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			blob => (blob ? resolve(blob) : reject(new Error('encodage'))),
			type,
			qualite
		)
	)
}

// Browsers without createImageBitmap (Safari before 15): an <img>
async function chargerImage(fichier) {
	const url = URL.createObjectURL(fichier)
	const image = new Image()
	image.src = url
	try {
		await image.decode()
	} catch (erreur) {
		URL.revokeObjectURL(url)
		throw erreur
	}
	return {
		image,
		largeur: image.naturalWidth,
		hauteur: image.naturalHeight,
		liberer: () => URL.revokeObjectURL(url),
	}
}

async function decoder(fichier) {
	// the EXIF orientation of phone photos is applied while decoding (the
	// default of current browsers, for createImageBitmap as for <img>)
	let source
	if (typeof createImageBitmap === 'function') {
		const bitmap = await createImageBitmap(fichier)
		source = {
			image: bitmap,
			largeur: bitmap.width,
			hauteur: bitmap.height,
			liberer: () => bitmap.close(),
		}
	} else {
		source = await chargerImage(fichier)
	}
	const { image } = source
	return {
		largeur: source.largeur,
		hauteur: source.hauteur,
		liberer: source.liberer,
		async encoder({ largeur, hauteur, type, qualite }) {
			const canvas = toile(largeur, hauteur)
			const contexte = canvas.getContext('2d')
			if (type === 'image/jpeg') {
				// no transparency in JPEG: white instead of black
				contexte.fillStyle = '#ffffff'
				contexte.fillRect(0, 0, largeur, hauteur)
			}
			contexte.imageSmoothingQuality = 'high'
			contexte.drawImage(image, 0, 0, largeur, hauteur)
			return encoderToile(canvas, type, qualite)
		},
	}
}

function fabriquerFichier(blob, nom, type) {
	return new File([blob], nom, { type, lastModified: Date.now() })
}

/**
 * @param {File} fichier - picked in an <input type="file">
 * @returns {ReturnType<typeof preparerPhoto>}
 */
export function preparerPhotoNavigateur(fichier) {
	return preparerPhoto(fichier, { lireTete, decoder, fabriquerFichier })
}
