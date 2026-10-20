import { type DecodedImage, type PhotoPorts, type PreparedPhoto, preparePhoto } from './photo'

/**
 * The browser ports of `preparerPhoto` (src/lib/espace/photo.ts): read the first bytes, decode the
 * picture, draw it on a canvas, encode it. Browser only; the browser tests play them, the decisions
 * themselves are unit tested in photo.ts.
 */

async function readHead(fichier: File): Promise<Uint8Array> {
	return new Uint8Array(await fichier.slice(0, 16).arrayBuffer())
}

type Canvas = OffscreenCanvas | HTMLCanvasElement

function makeCanvas(largeur: number, hauteur: number): Canvas {
	if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(largeur, hauteur)
	const canvas = document.createElement('canvas')
	canvas.width = largeur
	canvas.height = hauteur
	return canvas
}

function encodeCanvas(canvas: Canvas, type: string, qualite: number): Promise<Blob> {
	if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality: qualite })
	return new Promise((resolve, reject) =>
		canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('encodage'))), type, qualite)
	)
}

interface Source {
	image: CanvasImageSource
	largeur: number
	hauteur: number
	liberer: () => void
}

// Browsers without createImageBitmap: an <img>.
async function loadImage(fichier: File): Promise<Source> {
	const url = URL.createObjectURL(fichier)
	const image = new Image()
	image.src = url
	try {
		await image.decode()
	} catch (error) {
		URL.revokeObjectURL(url)
		throw error
	}
	return {
		image,
		largeur: image.naturalWidth,
		hauteur: image.naturalHeight,
		liberer: () => URL.revokeObjectURL(url),
	}
}

async function decoder(fichier: File): Promise<DecodedImage> {
	// The EXIF orientation of phone photos is applied while decoding (the default of current browsers).
	let source: Source
	if (typeof createImageBitmap === 'function') {
		const bitmap = await createImageBitmap(fichier)
		source = { image: bitmap, largeur: bitmap.width, hauteur: bitmap.height, liberer: () => bitmap.close() }
	} else {
		source = await loadImage(fichier)
	}
	const { image } = source
	return {
		largeur: source.largeur,
		hauteur: source.hauteur,
		liberer: source.liberer,
		async encoder({ largeur, hauteur, type, qualite }) {
			const canvas = makeCanvas(largeur, hauteur)
			const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
			if (context === null) throw new Error('canvas')
			if (type === 'image/jpeg') {
				// No transparency in a JPEG: white instead of black.
				context.fillStyle = '#ffffff'
				context.fillRect(0, 0, largeur, hauteur)
			}
			context.imageSmoothingQuality = 'high'
			context.drawImage(image, 0, 0, largeur, hauteur)
			return await encodeCanvas(canvas, type, qualite)
		},
	}
}

const makeFile = (blob: Blob, nom: string, type: string): File =>
	new File([blob], nom, { type, lastModified: Date.now() })

const PORTS: PhotoPorts<File, File> = { lireTete: readHead, decoder, fabriquerFichier: makeFile }

/** The browser's way of preparing a picked file: the default `preparer` of the photo editors. */
export const prepareBrowserPhoto = (fichier: File): Promise<PreparedPhoto<File>> => preparePhoto(fichier, PORTS)
