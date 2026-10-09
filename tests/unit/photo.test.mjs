import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { eventData } from '../../src/lib/analytics.js'
import {
	ACCEPT,
	COTE_MAX,
	codeRefusEnvoi,
	compresserPhoto,
	dimensionsCibles,
	kindRefusEnvoi,
	MESSAGES_PHOTO,
	nomPhoto,
	PALIERS,
	preparerPhoto,
	TAILLE_MAX_CHOIX,
	TAILLE_MAX_ENVOI,
	typeDepuisNom,
	typeImageDepuisOctets,
	verifierPhoto,
} from '../../src/lib/photo.js'

const MO = 1024 * 1024
const ascii = texte => [...texte].map(c => c.charCodeAt(0))
// first bytes of real files
const TETES = {
	jpeg: [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii('JFIF'), 0, 1],
	png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d],
	webp: [...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBP')],
	heic: [0, 0, 0, 0x18, ...ascii('ftypheic'), 0, 0, 0, 0],
	heicMif1: [0, 0, 0, 0x1c, ...ascii('ftypmif1'), 0, 0, 0, 0],
	avif: [0, 0, 0, 0x20, ...ascii('ftypavif'), 0, 0, 0, 0],
	svg: ascii('<svg xmlns="h'),
	gif: ascii('GIF89a......'),
	pdf: ascii('%PDF-1.7....'),
}

describe('accepted types (same list as the API upload guard)', () => {
	test('the file inputs accept JPEG, PNG and WebP only', () => {
		assert.equal(ACCEPT, 'image/jpeg,image/png,image/webp')
	})

	test('reads the real type from the first bytes', () => {
		assert.equal(typeImageDepuisOctets(TETES.jpeg), 'image/jpeg')
		assert.equal(typeImageDepuisOctets(TETES.png), 'image/png')
		assert.equal(typeImageDepuisOctets(TETES.webp), 'image/webp')
		assert.equal(typeImageDepuisOctets(TETES.heic), 'image/heic')
		assert.equal(typeImageDepuisOctets(TETES.heicMif1), 'image/heic')
		assert.equal(typeImageDepuisOctets(TETES.avif), 'image/avif')
		for (const autre of [TETES.svg, TETES.gif, TETES.pdf, [], [0xff]]) {
			assert.equal(typeImageDepuisOctets(autre), null)
		}
		assert.equal(typeImageDepuisOctets(undefined), null)
		assert.equal(typeImageDepuisOctets(new Uint8Array(TETES.png)), 'image/png')
	})

	test('guesses the type from the name when the browser gives none', () => {
		assert.equal(typeDepuisNom('IMG_0001.HEIC'), 'image/heic')
		assert.equal(typeDepuisNom('photo.jpeg'), 'image/jpeg')
		assert.equal(typeDepuisNom('photo.JPG'), 'image/jpeg')
		assert.equal(typeDepuisNom('logo.svg'), 'image/svg+xml')
		assert.equal(typeDepuisNom('sans-extension'), '')
		assert.equal(typeDepuisNom(undefined), '')
	})
})

describe('verifierPhoto', () => {
	const ok = (type, tete, size = 2 * MO, name = 'photo') => ({
		name,
		type,
		size,
		tete: tete && new Uint8Array(tete),
	})

	test('accepts JPEG, PNG and WebP, with the type read from the bytes', () => {
		assert.deepEqual(verifierPhoto(ok('image/jpeg', TETES.jpeg)), {
			ok: true,
			type: 'image/jpeg',
		})
		assert.deepEqual(verifierPhoto(ok('image/png', TETES.png)), {
			ok: true,
			type: 'image/png',
		})
		assert.deepEqual(verifierPhoto(ok('', TETES.webp, MO, 'a.webp')), {
			ok: true,
			type: 'image/webp',
		})
	})

	test('refuses HEIC with the iPhone message, declared or read', () => {
		for (const fichier of [
			ok('image/heic', TETES.heic, 3 * MO, 'IMG_0001.HEIC'),
			ok('', TETES.heic, 3 * MO, 'IMG_0001.HEIC'),
			// a HEIC renamed .jpg by a sharing app: the bytes win
			ok('image/jpeg', TETES.heic, 3 * MO, 'IMG_0001.jpg'),
			ok('image/heif', undefined, 3 * MO),
		]) {
			const resultat = verifierPhoto(fichier)
			assert.equal(resultat.ok, false)
			assert.equal(resultat.raison, 'type')
			assert.equal(resultat.code, 'heic')
			assert.match(resultat.message, /HEIC/)
			assert.match(resultat.message, /JPEG, PNG ou WebP/)
		}
	})

	test('refuses AVIF, SVG, GIF, PDF and spoofed types', () => {
		for (const fichier of [
			ok('image/avif', TETES.avif),
			ok('image/svg+xml', TETES.svg),
			ok('image/gif', TETES.gif),
			ok('application/pdf', TETES.pdf),
			// declared JPEG, but the bytes are an SVG or an AVIF
			ok('image/jpeg', TETES.svg),
			ok('image/jpeg', TETES.avif),
		]) {
			const resultat = verifierPhoto(fichier)
			assert.equal(resultat.ok, false, JSON.stringify(fichier.type))
			assert.equal(resultat.code, 'type')
			assert.equal(resultat.message, MESSAGES_PHOTO.type)
		}
	})

	test('refuses a picture above 25 MB before decoding it, and empty files', () => {
		const lourde = verifierPhoto(ok('image/jpeg', TETES.jpeg, TAILLE_MAX_CHOIX + 1))
		assert.equal(lourde.ok, false)
		assert.equal(lourde.raison, 'taille')
		assert.match(lourde.message, /25 Mo/)
		assert.equal(verifierPhoto(ok('image/jpeg', TETES.jpeg, TAILLE_MAX_CHOIX)).ok, true)
		assert.equal(verifierPhoto(ok('image/jpeg', TETES.jpeg, 0)).code, 'illisible')
	})

	test('an 8 MB phone photo is accepted: it is compressed, not refused', () => {
		assert.equal(verifierPhoto(ok('image/jpeg', TETES.jpeg, 8 * MO)).ok, true)
	})
})

describe('dimensionsCibles', () => {
	test('brings the longest side down to 2000 px, ratio kept', () => {
		assert.deepEqual(dimensionsCibles(4000, 3000), {
			largeur: 2000,
			hauteur: 1500,
		})
		assert.deepEqual(dimensionsCibles(3024, 4032), {
			largeur: 1500,
			hauteur: 2000,
		})
		assert.deepEqual(dimensionsCibles(8000, 1000), {
			largeur: 2000,
			hauteur: 250,
		})
		assert.equal(COTE_MAX, 2000)
	})

	test('never enlarges a small picture', () => {
		assert.deepEqual(dimensionsCibles(800, 600), {
			largeur: 800,
			hauteur: 600,
		})
		assert.deepEqual(dimensionsCibles(2000, 2000), {
			largeur: 2000,
			hauteur: 2000,
		})
	})

	test('rounds to whole pixels, 1 at least', () => {
		assert.deepEqual(dimensionsCibles(3001, 2001), {
			largeur: 2000,
			hauteur: 1334,
		})
		assert.deepEqual(dimensionsCibles(100000, 1), {
			largeur: 2000,
			hauteur: 1,
		})
	})

	test('invalid sizes give null', () => {
		for (const [l, h] of [
			[0, 100],
			[100, -1],
			[NaN, 10],
			[Infinity, 10],
		]) {
			assert.equal(dimensionsCibles(l, h), null)
		}
		assert.equal(dimensionsCibles(100, 100, 0), null)
	})
})

// Fake encoder: the size of a picture grows with its pixels and its quality
const encodeurFactice = ({ octetsParPixel = 0.5, webp = true } = {}) => {
	const appels = []
	const encoder = async cible => {
		appels.push(cible)
		const type = !webp && cible.type === 'image/webp' ? 'image/png' : cible.type
		const size = Math.round(cible.largeur * cible.hauteur * octetsParPixel * cible.qualite)
		return { type, size }
	}
	return { appels, encoder }
}

describe('compresserPhoto', () => {
	test('a 4000×3000 photo comes out in WebP, 2000 px, under 1 MB at the first step', async () => {
		const { appels, encoder } = encodeurFactice({ octetsParPixel: 0.4 })
		const resultat = await compresserPhoto({
			largeur: 4000,
			hauteur: 3000,
			encoder,
		})
		assert.equal(resultat.ok, true)
		assert.equal(resultat.type, 'image/webp')
		assert.equal(resultat.largeur, 2000)
		assert.equal(resultat.hauteur, 1500)
		assert.equal(resultat.qualite, PALIERS[0].qualite)
		assert.ok(resultat.blob.size <= TAILLE_MAX_ENVOI)
		assert.equal(appels.length, 1)
	})

	test('lowers the quality, then the size, until it fits', async () => {
		const { appels, encoder } = encodeurFactice({ octetsParPixel: 1.2 })
		const resultat = await compresserPhoto({
			largeur: 4000,
			hauteur: 3000,
			encoder,
		})
		assert.equal(resultat.ok, true)
		assert.ok(resultat.blob.size <= TAILLE_MAX_ENVOI)
		// every step before the last one was too heavy
		for (const appel of appels.slice(0, -1)) {
			assert.ok(appel.largeur * appel.hauteur * 1.2 * appel.qualite > TAILLE_MAX_ENVOI)
		}
		// qualities go down within a size, sizes never go up
		for (let i = 1; i < appels.length; i++) {
			assert.ok(appels[i].largeur <= appels[i - 1].largeur)
			if (appels[i].largeur === appels[i - 1].largeur) assert.ok(appels[i].qualite < appels[i - 1].qualite)
		}
		assert.ok(resultat.largeur < 2000)
		assert.ok(resultat.largeur >= 1000)
	})

	test('falls back to JPEG when the browser cannot encode WebP', async () => {
		const { appels, encoder } = encodeurFactice({
			octetsParPixel: 0.4,
			webp: false,
		})
		const resultat = await compresserPhoto({
			largeur: 3000,
			hauteur: 2000,
			encoder,
		})
		assert.equal(resultat.ok, true)
		assert.equal(resultat.type, 'image/jpeg')
		assert.deepEqual(
			appels.map(appel => appel.type),
			['image/webp', 'image/jpeg']
		)
	})

	test('gives up after the last step: « trop-lourde »', async () => {
		const { appels, encoder } = encodeurFactice({ octetsParPixel: 50 })
		const resultat = await compresserPhoto({
			largeur: 4000,
			hauteur: 3000,
			encoder,
		})
		assert.deepEqual({ ok: resultat.ok, code: resultat.code }, { ok: false, code: 'trop-lourde' })
		assert.equal(appels.length, PALIERS.length)
	})

	test('an encoder that answers with another type twice: « illisible »', async () => {
		const resultat = await compresserPhoto({
			largeur: 100,
			hauteur: 100,
			encoder: async () => ({ type: 'image/png', size: 10 }),
		})
		assert.deepEqual({ ok: resultat.ok, code: resultat.code }, { ok: false, code: 'illisible' })
	})

	test('a picture without size: « illisible », nothing encoded', async () => {
		const { appels, encoder } = encodeurFactice()
		const resultat = await compresserPhoto({ largeur: 0, hauteur: 0, encoder })
		assert.equal(resultat.code, 'illisible')
		assert.equal(appels.length, 0)
	})
})

describe('nomPhoto', () => {
	test('a safe name with the extension of the sent type', () => {
		assert.equal(nomPhoto('IMG_0001.HEIC', 'image/webp'), 'img-0001.webp')
		assert.equal(nomPhoto('Mariée à Annecy.png', 'image/jpeg'), 'mariee-a-annecy.jpg')
		assert.equal(nomPhoto('../../etc/passwd', 'image/webp'), 'etc-passwd.webp')
		assert.equal(nomPhoto('', 'image/webp'), 'photo.webp')
		assert.equal(nomPhoto(undefined, 'image/jpeg'), 'photo.jpg')
		assert.ok(nomPhoto(`${'x'.repeat(300)}.jpg`, 'image/webp').length <= 65)
	})
})

describe('preparerPhoto (ports)', () => {
	const ports = ({ tete = TETES.jpeg, largeur = 4000, hauteur = 3000 } = {}) => {
		const journal = { decode: 0, libere: 0 }
		return {
			journal,
			lireTete: async () => new Uint8Array(tete),
			decoder: async () => {
				journal.decode++
				return {
					largeur,
					hauteur,
					encoder: encodeurFactice({ octetsParPixel: 0.4 }).encoder,
					liberer: () => journal.libere++,
				}
			},
			fabriquerFichier: (blob, nom, type) => ({ nom, type, size: blob.size }),
		}
	}

	test('8 MB JPEG from a phone: a WebP under 1 MB, 2000 px wide', async () => {
		const p = ports()
		const resultat = await preparerPhoto({ name: 'IMG_2040.JPG', type: 'image/jpeg', size: 8 * MO }, p)
		assert.equal(resultat.ok, true)
		assert.equal(resultat.fichier.nom, 'img-2040.webp')
		assert.equal(resultat.fichier.type, 'image/webp')
		assert.ok(resultat.taille <= TAILLE_MAX_ENVOI)
		assert.equal(resultat.largeur, 2000)
		assert.equal(p.journal.libere, 1)
	})

	test('HEIC: refused before decoding', async () => {
		const p = ports({ tete: TETES.heic })
		const resultat = await preparerPhoto({ name: 'IMG_0001.HEIC', type: 'image/heic', size: 3 * MO }, p)
		assert.equal(resultat.ok, false)
		assert.equal(resultat.code, 'heic')
		assert.equal(p.journal.decode, 0)
	})

	test('a picture the browser cannot decode: « illisible », never thrown', async () => {
		const p = ports()
		p.decoder = async () => {
			throw new Error('decode')
		}
		const resultat = await preparerPhoto({ name: 'a.jpg', type: 'image/jpeg', size: MO }, p)
		assert.equal(resultat.code, 'illisible')
		assert.equal(resultat.message, MESSAGES_PHOTO.illisible)

		p.lireTete = async () => {
			throw new Error('read')
		}
		assert.equal((await preparerPhoto({ name: 'a.jpg', type: 'image/jpeg', size: 1 }, p)).code, 'illisible')
	})
})

describe('codeRefusEnvoi (answer of POST /api/upload)', () => {
	test('413 → too large, 400 → refused type, anything else → retry later', () => {
		assert.equal(codeRefusEnvoi(413), 'refus-taille')
		assert.equal(codeRefusEnvoi(400), 'refus-type')
		for (const status of [0, 401, 403, 500, 502, 200]) {
			assert.equal(codeRefusEnvoi(status), 'envoi-impossible')
		}
		for (const code of ['refus-taille', 'refus-type', 'envoi-impossible']) {
			assert.ok(MESSAGES_PHOTO[code])
		}
	})
})

describe('kindRefusEnvoi (upload_error of a refused POST /api/upload)', () => {
	test('413 → size, 400 and 415 → type, anything else → server', () => {
		assert.equal(kindRefusEnvoi(413), 'size')
		assert.equal(kindRefusEnvoi(400), 'type')
		assert.equal(kindRefusEnvoi(415), 'type')
		// 0: API out of reach; 200: stored, but its answer could not be read
		for (const status of [0, 200, 401, 403, 429, 500, 502, 503]) {
			assert.equal(kindRefusEnvoi(status), 'server')
		}
	})

	test('every kind is in the catalogue and carries the status only', () => {
		for (const status of [413, 400, 415, 500, 0]) {
			assert.deepEqual(eventData('upload_error', { kind: kindRefusEnvoi(status) }), {
				kind: kindRefusEnvoi(status),
			})
		}
	})
})
