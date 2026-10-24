/**
 * What the photo blocks of her page share (issues 1008 and 1018): how a chosen file is shown before it is sent,
 * and the texts a photo is stored with. They lived in the editors of the cards of her old space (removed by
 * issue 1023).
 */

/** What she reads when her main photo could not be taken over from the old site (ticket 275). */
export const MISSING_MAIN_PHOTO_MESSAGE = 'Ta photo principale n’a pas pu être reprise, ajoute-la de nouveau.'

/** The alternative text a main photo is stored with. */
export const MAIN_PICTURE_ALT = 'Photo principale'

/** The alternative text a photo of the portfolio is stored with until she describes it. */
export const ALT_PORTFOLIO = 'Photo du portfolio'

/** How a chosen file is shown before it is sent: a local address, or nothing where the browser has none. */
export function localPreview(fichier: Blob): string {
	try {
		return URL.createObjectURL(fichier)
	} catch {
		return ''
	}
}

/** Gives back a local address made by `localPreview`. */
export function releasePreview(adresse: string): void {
	try {
		if (adresse !== '') URL.revokeObjectURL(adresse)
	} catch {
		// Nothing to give back.
	}
}
