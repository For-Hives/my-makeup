import { describe, expect, test } from 'bun:test'
import {
	CHOICE_SIZE_MAX,
	checkPhoto,
	compressPhoto,
	LADDER,
	MESSAGES_PHOTO,
	photoName,
	preparePhoto,
	targetDimensions,
	UPLOAD_SIZE_MAX,
} from '@/lib/dashboard/photo'
import { type PhotoToSend, sendThenSave, UNCERTAIN_RESULT_MESSAGE, uploadPhoto } from '@/lib/dashboard/photos-upload'
import { FAILURE_MESSAGE, MESSAGE_SESSION, type SaveResult } from '@/lib/dashboard/result'
import { UPLOAD_MESSAGES } from '@/lib/photo-upload'

/**
 * The photos she sends from her space (tickets 134 and 135; plan 02 U79, U80, E36): what is refused
 * before anything is sent, the reduction, and the gesture « send, then save » with its three
 * outcomes kept apart.
 */

const octets = (...parties: (string | number[])[]) =>
	Uint8Array.from(parties.flatMap(p => (typeof p === 'string' ? [...p].map(c => c.charCodeAt(0)) : p)))
const JPEG = octets([0xff, 0xd8, 0xff, 0xe0])
const PNG = octets([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WEBP = octets('RIFF', [0, 0, 0, 0], 'WEBP')

describe('E36, U79 : un fichier qui n’est pas une photo acceptée est refusé avant l’envoi', () => {
	test('JPEG, PNG et WebP sont acceptés, lus dans les octets', () => {
		for (const tete of [JPEG, PNG, WEBP]) expect(checkPhoto({ name: 'a.bin', type: '', size: 10, tete }).ok).toBe(true)
	})

	test('un PDF, un SVG, un GIF et des octets quelconques sont refusés, même nommés .jpg', () => {
		for (const tete of [octets('%PDF-1.7'), octets('<svg xmlns'), octets('GIF89a'), octets('pas une image')]) {
			const verdict = checkPhoto({ name: 'photo.jpg', type: 'image/jpeg', size: 10, tete })
			expect(verdict).toMatchObject({ ok: false, code: 'type', message: MESSAGES_PHOTO.type })
		}
	})

	test('un HEIC est refusé avec le message des iPhone ; un AVIF avec celui des types', () => {
		const heic = octets([0, 0, 0, 24], 'ftypheic')
		const avif = octets([0, 0, 0, 24], 'ftypavif')
		expect(checkPhoto({ name: 'a.jpg', type: 'image/jpeg', size: 10, tete: heic })).toMatchObject({ code: 'heic' })
		expect(checkPhoto({ name: 'a.avif', type: 'image/avif', size: 10, tete: avif })).toMatchObject({ code: 'type' })
	})

	test('plus de 25 Mo est refusé avant toute lecture ; un fichier vide aussi', () => {
		expect(checkPhoto({ name: 'a.jpg', type: 'image/jpeg', size: CHOICE_SIZE_MAX + 1, tete: JPEG })).toMatchObject({
			ok: false,
			raison: 'taille',
		})
		expect(checkPhoto({ name: 'a.jpg', type: 'image/jpeg', size: 0, tete: JPEG })).toMatchObject({
			code: 'illisible',
		})
	})
})

describe('la réduction : 2 000 px au plus, 1 Mo au plus', () => {
	test('le plus long côté passe à 2 000 px, jamais agrandi, le rapport est gardé', () => {
		expect(targetDimensions(4000, 3000)).toEqual({ largeur: 2000, hauteur: 1500 })
		expect(targetDimensions(800, 600)).toEqual({ largeur: 800, hauteur: 600 })
		expect(targetDimensions(0, 10)).toBeNull()
	})

	test('les paliers sont essayés dans l’ordre jusqu’à passer sous 1 Mo', async () => {
		const essais: number[] = []
		const resultat = await compressPhoto({
			largeur: 4000,
			hauteur: 3000,
			encoder: async ({ qualite, type }) => {
				essais.push(qualite)
				return new Blob([new Uint8Array(qualite > 0.62 ? UPLOAD_SIZE_MAX + 1 : 1000)], { type })
			},
		})
		expect(resultat).toMatchObject({ ok: true, type: 'image/webp', largeur: 2000, hauteur: 1500 })
		expect(essais).toEqual([0.82, 0.72, 0.62])
	})

	test('un navigateur qui ne sait pas encoder le WebP donne du JPEG', async () => {
		const resultat = await compressPhoto({
			largeur: 100,
			hauteur: 100,
			encoder: async ({ type }) => new Blob(['x'], { type: type === 'image/webp' ? 'image/png' : type }),
		})
		expect(resultat).toMatchObject({ ok: true, type: 'image/jpeg' })
	})

	test('une photo qui reste trop lourde à tous les paliers est refusée avec son message', async () => {
		const resultat = await compressPhoto({
			largeur: 100,
			hauteur: 100,
			encoder: async ({ type }) => new Blob([new Uint8Array(UPLOAD_SIZE_MAX + 1)], { type }),
		})
		expect(resultat).toEqual({ ok: false, code: 'trop-lourde', essais: LADDER.length })
	})

	test('le nom envoyé est sûr, avec l’extension du type envoyé', () => {
		expect(photoName('Mon Été à Nîmes (1).HEIC.jpg', 'image/webp')).toBe('mon-ete-a-nimes-1-heic.webp')
		expect(photoName('', 'image/jpeg')).toBe('photo.jpg')
	})

	test('preparerPhoto ne lève jamais : un décodage qui échoue donne « illisible », et libère l’image', async () => {
		const fichier = { name: 'a.jpg', type: 'image/jpeg', size: 10 }
		const refus = await preparePhoto(fichier, {
			lireTete: async () => JPEG,
			decoder: async () => {
				throw new Error('decode')
			},
			fabriquerFichier: () => 'x',
		})
		expect(refus).toMatchObject({ ok: false, code: 'illisible' })
		let libere = false
		const bon = await preparePhoto(fichier, {
			lireTete: async () => JPEG,
			decoder: async () => ({
				largeur: 10,
				hauteur: 10,
				encoder: async ({ type }) => new Blob(['x'], { type }),
				liberer: () => {
					libere = true
				},
			}),
			fabriquerFichier: (_blob, nom) => nom,
		})
		expect(bon).toMatchObject({ ok: true, fichier: 'a.webp' })
		expect(libere).toBe(true)
	})
})

const reponse = (statut: number, corps: unknown = '') =>
	new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: statut })
const FICHIER = new File(['x'], 'a.webp', { type: 'image/webp' })

describe('E36 : le refus du serveur est dit avec sa cause', () => {
	test('201 : l’identifiant du média ; l’alt part avec le fichier', async () => {
		let corps: FormData | undefined
		const resultat = await uploadPhoto(FICHIER, 'Photo principale', async (_adresse, options) => {
			corps = options?.body as FormData
			return reponse(201, { doc: { id: 12 } })
		})
		expect(resultat).toEqual({ ok: true, id: 12 })
		expect(JSON.parse(String(corps?.get('_payload')))).toEqual({ alt: 'Photo principale' })
		expect(corps?.get('file')).toBeInstanceOf(File)
	})

	test('400 de taille, 400 de type, 401, 500 et coupure du réseau donnent chacun leur message', async () => {
		const avec = (r: () => Promise<Response>) => uploadPhoto(FICHIER, 'x', r)
		expect(await avec(async () => reponse(400, { errors: [{ message: UPLOAD_MESSAGES.taille }] }))).toMatchObject({
			message: MESSAGES_PHOTO['refus-taille'],
		})
		expect(await avec(async () => reponse(400, { errors: [{ message: UPLOAD_MESSAGES.type }] }))).toMatchObject({
			message: MESSAGES_PHOTO['refus-type'],
		})
		expect(await avec(async () => reponse(401))).toEqual({ ok: false, message: MESSAGE_SESSION, session: 'expiree' })
		expect(await avec(async () => reponse(500))).toMatchObject({ message: MESSAGES_PHOTO['envoi-impossible'] })
		expect(
			await avec(async () => {
				throw new TypeError('Failed to fetch')
			})
		).toMatchObject({ message: MESSAGES_PHOTO['envoi-impossible'] })
	})
})

describe('U03, I24 : envoyer puis enregistrer, et ce qu’on supprime ensuite', () => {
	const photo = (cle: string, id?: number): PhotoToSend => ({
		cle,
		fichier: FICHIER,
		alt: 'x',
		...(id ? { id } : {}),
	})

	function monter(options: {
		envoi?: (n: number) => Awaited<ReturnType<typeof uploadPhoto>>
		enregistrer: (ids: (number | string)[]) => Promise<SaveResult<Record<string, unknown>>>
	}) {
		const supprimes: (number | string)[] = []
		const envoyes: number[] = []
		let n = 0
		return {
			supprimes,
			envoyes,
			lancer: (photos: PhotoToSend[]) =>
				sendThenSave({
					photos,
					televerser: async () => {
						n++
						const r = options.envoi?.(n) ?? { ok: true as const, id: 100 + n }
						if (r.ok) envoyes.push(Number(r.id))
						return r
					},
					supprimer: async id => {
						supprimes.push(id)
					},
					enregistrer: options.enregistrer,
				}),
		}
	}

	test('tout passe : les identifiants arrivent dans l’ordre, rien n’est supprimé', async () => {
		let recus: unknown
		const banc = monter({
			enregistrer: async ids => {
				recus = ids
				return { ok: true, valeurs: { ids } }
			},
		})
		expect(await banc.lancer([photo('a'), photo('b')])).toMatchObject({ ok: true })
		expect(recus).toEqual([101, 102])
		expect(banc.supprimes).toEqual([])
	})

	test('coupure pendant l’envoi du second fichier : le premier est supprimé, rien n’est enregistré (U03)', async () => {
		let enregistre = false
		const banc = monter({
			envoi: n => (n === 2 ? { ok: false, message: MESSAGES_PHOTO['envoi-impossible'] } : { ok: true, id: 101 }),
			enregistrer: async () => {
				enregistre = true
				return { ok: true, valeurs: {} }
			},
		})
		const issue = await banc.lancer([photo('a'), photo('b')])
		expect(issue).toMatchObject({ ok: false, message: MESSAGES_PHOTO['envoi-impossible'] })
		expect(enregistre).toBe(false)
		expect(banc.supprimes).toEqual([101])
	})

	test('le serveur répond « non enregistré » : les fichiers envoyés ici sont supprimés, pas ceux déjà tenus', async () => {
		const banc = monter({ enregistrer: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		const issue = await banc.lancer([photo('a', 7), photo('b')])
		expect(issue).toMatchObject({ ok: false, message: FAILURE_MESSAGE })
		expect(banc.supprimes).toEqual([101])
	})

	test('l’appel au serveur se perd : résultat incertain, RIEN n’est supprimé', async () => {
		const banc = monter({
			enregistrer: async () => {
				throw new Error('Failed to fetch')
			},
		})
		const issue = await banc.lancer([photo('a')])
		expect(issue).toEqual({ ok: false, message: UNCERTAIN_RESULT_MESSAGE, incertain: true })
		expect(banc.supprimes).toEqual([])
	})

	test('session expirée à l’enregistrement : rien n’est supprimé (elle ne le pourrait pas), le fichier reste pour le nouvel essai', async () => {
		const banc = monter({ enregistrer: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) })
		expect(await banc.lancer([photo('a')])).toMatchObject({ ok: false, session: 'expiree' })
		expect(banc.supprimes).toEqual([])
	})
})
