/**
 * Photos for the tests: a real image, as small as it gets (a PNG of 1 × 1 pixel), under a name of
 * its own each time, ready for the Local API (`fichierPourPayload`) or for a form (`fichierPourFormulaire`).
 *
 * Made up and harmless: no person, no place, no metadata. What a photo may be (types, size) is the
 * work of ticket 133.
 */

import { randomUUID } from 'node:crypto'

/** A PNG of 1 × 1 transparent pixel. */
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
)

/** A file name of its own, so that two tests never write the same object. */
export const nomDePhoto = (prefixe = 'photo') => `${prefixe}-${randomUUID()}.png`

/** The file as the Local API takes it (`payload.create({ collection: 'media', file })`). */
export function fichierPourPayload(nom = nomDePhoto()) {
	return { data: Buffer.from(PNG_1X1), mimetype: 'image/png', name: nom, size: PNG_1X1.length }
}

/** The file as a browser sends it in a form. */
export function fichierPourFormulaire(nom = nomDePhoto()): File {
	return new File([new Uint8Array(PNG_1X1)], nom, { type: 'image/png' })
}
