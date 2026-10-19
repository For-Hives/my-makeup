import { describe, expect, test } from 'bun:test'
import { ImportRefuse } from '../../scripts/migration/import/cible'
import {
	ADAPTATEUR_MEDIAS,
	type Adoptable,
	classerLesFichiers,
	type EntreesPrises,
	emplacementDansLAdresse,
	type FichiersLus,
	type LienDeFichier,
	type LigneFichier,
	mediasAttendus,
	photosDeLEntree,
	sondeHttp,
	sonderLesObjets,
	TYPE_ARTICLE,
	TYPE_PROFIL,
} from '../../scripts/migration/import/medias'
import { normaliser } from '../../scripts/migration/import/moteur'
import { codeDeSortie, type Rapport, rapportEnTexte } from '../../scripts/migration/import/rapport'
import { unFichierALaCreation } from '../../src/collections/Media'
import { HttpResponse, http, simuler } from '../outils/http-sortant'

/**
 * Ticket 058: what the import makes of the files of the old site, before and without the database:
 * which ones it adopts, where their object is read from their address, what a request for headers
 * says. The runs on the bench are in tests/integration/import-medias.test.ts. Every value here is
 * fictional; the addresses are on a domain reserved for tests.
 */

const BASE = 'https://photos.example.test'

const fichier = (id: number, modif: Partial<LigneFichier> = {}): LigneFichier => ({
	id,
	alternative_text: null,
	width: 40,
	height: 30,
	formats: null,
	hash: `photo_${id}`,
	ext: '.png',
	mime: 'image/png',
	url: `${BASE}/1/photo_${id}.png`,
	uploaded_by: null,
	created_at: '2024-01-01T10:00:00.000Z',
	updated_at: '2024-01-02T10:00:00.000Z',
	...modif,
})

const lien = (fichier: number, entree: number, champ = 'image_gallery', type = TYPE_PROFIL): LienDeFichier => ({
	fichier,
	entree,
	type,
	champ,
})

/** Profiles 21 (account 1) and 22 (account 2) taken; profile 29 in the source, set aside; article 7 taken. */
const ENTREES: EntreesPrises = {
	profils: new Map([
		[21, 1],
		[22, 2],
	]),
	articles: new Set([7]),
	profilsDeLaSource: new Set([21, 22, 29]),
	articlesDeLaSource: new Set([7]),
}

describe('le dossier et le nom d’un objet se lisent dans son adresse', () => {
	test('à la racine, sous un préfixe, sous plusieurs dossiers', () => {
		expect(emplacementDansLAdresse(`${BASE}/photo_1.png`, BASE)).toEqual({ prefix: '', filename: 'photo_1.png' })
		expect(emplacementDansLAdresse(`${BASE}/1/photo_1.png`, BASE)).toEqual({ prefix: '1', filename: 'photo_1.png' })
		expect(emplacementDansLAdresse(`${BASE}/a/b/photo.webp`, BASE)).toEqual({ prefix: 'a/b', filename: 'photo.webp' })
		// A character the v3 encodes the same way: the address comes back character for character.
		expect(emplacementDansLAdresse(`${BASE}/1/photo%20d%C3%A9t%C3%A9.png`, BASE)).toEqual({
			prefix: '1',
			filename: 'photo dété.png',
		})
	})

	test('une adresse que la v3 ne redonnerait pas à l’identique ne se lit pas', () => {
		for (const adresse of [
			'https://autre.example.test/1/photo.png',
			`${BASE}-autre/1/photo.png`,
			`${BASE}/1/photo.png?v=2`,
			`${BASE}/1//photo.png`,
			`${BASE}/1/`,
			`${BASE}/1/photo+x.png`,
			`${BASE}/1/photo%zz.png`,
			BASE,
		])
			expect(emplacementDansLAdresse(adresse, BASE), adresse).toBeNull()
		expect(emplacementDansLAdresse(null, BASE)).toBeNull()
	})
})

describe('les fichiers de la source sont adoptés, signalés ou refusés', () => {
	const lus = (fichiers: LigneFichier[], liens: LienDeFichier[]): FichiersLus => ({ fichiers, liens })

	test('une image désignée par un profil repris est adoptée, au compte de ce profil ; une image d’article sans propriétaire', () => {
		const { adoptables, designes } = classerLesFichiers(
			lus(
				[fichier(1), fichier(2), fichier(3, { url: `${BASE}/photo_3.png` })],
				[lien(1, 21, 'main_picture'), lien(2, 22), lien(3, 7, 'galery', TYPE_ARTICLE)]
			),
			ENTREES,
			BASE
		)

		expect(designes).toBe(3)
		expect(adoptables.map(({ fichier, emplacement, compte }) => [fichier.id, emplacement, compte])).toEqual([
			[1, { prefix: '1', filename: 'photo_1.png' }, 1],
			[2, { prefix: '1', filename: 'photo_2.png' }, 2],
			[3, { prefix: '', filename: 'photo_3.png' }, null],
		])
	})

	test('aucun orphelin : ni fichier sans lien, ni fichier d’une entrée disparue ou non reprise (I39)', () => {
		const classement = classerLesFichiers(
			lus(
				[fichier(1), fichier(2), fichier(3), fichier(4), fichier(5)],
				[
					lien(1, 70, 'main_picture'),
					lien(2, 29),
					lien(3, 21, 'video'),
					lien(4, 8, 'galery', TYPE_ARTICLE),
					lien(4, 3, 'image', 'api::talent.talent'),
				]
			),
			ENTREES,
			BASE
		)

		expect(classement).toMatchObject({
			source: 5,
			adoptables: [],
			designes: 0,
			deEntreesNonPrises: 1,
			deEntreesDisparues: 3,
			sansLien: 1,
		})
	})

	test('un fichier qui n’est pas une image est signalé, pas adopté ; sans stockage, aucun ne l’est', () => {
		const source = lus(
			[fichier(1, { mime: 'application/pdf', ext: '.pdf' }), fichier(2, { mime: 'image/svg+xml' }), fichier(3)],
			[lien(1, 21), lien(2, 21), lien(3, 21)]
		)

		expect(classerLesFichiers(source, ENTREES, BASE)).toMatchObject({
			adoptables: [{ fichier: { id: 3 } }],
			nonAdoptes: [
				{ fichier: 1, motif: 'pas-une-image' },
				{ fichier: 2, motif: 'pas-une-image' },
			],
			refuses: [],
		})
		expect(classerLesFichiers(source, ENTREES, null)).toMatchObject({
			adoptables: [],
			nonAdoptes: [
				{ fichier: 1, motif: 'pas-une-image' },
				{ fichier: 2, motif: 'pas-une-image' },
				{ fichier: 3, motif: 'sans-stockage' },
			],
		})
	})

	test('une adresse hors de la base des photos, ou un fichier de deux comptes, est refusé et attend une décision', () => {
		const { adoptables, refuses } = classerLesFichiers(
			lus(
				[fichier(1, { url: 'https://ailleurs.example.test/1/photo_1.png' }), fichier(2), fichier(3)],
				[lien(1, 21), lien(2, 21), lien(2, 22), lien(3, 21), lien(3, 7, 'galery', TYPE_ARTICLE)]
			),
			ENTREES,
			BASE
		)

		expect(adoptables).toEqual([])
		expect(refuses).toEqual([
			{ strapiId: 1, motif: 'adresse-hors-de-la-base', champs: ['prefix', 'filename'] },
			{ strapiId: 2, motif: 'plusieurs-proprietaires', champs: ['owner'] },
			{ strapiId: 3, motif: 'plusieurs-proprietaires', champs: ['owner'] },
		])
	})

	test('le nom de l’objet autre que hash + ext, ou un envoi par un autre compte, est signalé et le fichier adopté', () => {
		const classement = classerLesFichiers(
			lus(
				[fichier(1, { hash: 'autre_nom' }), fichier(2, { uploaded_by: 9 }), fichier(3, { uploaded_by: 1 })],
				[lien(1, 21), lien(2, 21), lien(3, 21)]
			),
			ENTREES,
			BASE
		)

		expect(classement.adoptables.map(({ fichier }) => fichier.id)).toEqual([1, 2, 3])
		expect(classement.nomsDifferents).toEqual([1])
		expect(classement.envoyesParUnAutreCompte).toEqual([2])
	})
})

describe('le stockage n’est lu que par des requêtes d’en-tête', () => {
	const adresse = `${BASE}/1/photo_1.png`

	test('200 : présent, sa taille en octets ; 404 : absent', async () => {
		simuler(
			http.head(adresse, () => new HttpResponse(null, { status: 200, headers: { 'Content-Length': '1234' } })),
			http.head(`${BASE}/1/absente.png`, () => new HttpResponse(null, { status: 404 }))
		)

		expect(await sondeHttp(adresse)).toEqual({ present: true, taille: 1234 })
		expect(await sondeHttp(`${BASE}/1/absente.png`)).toEqual({ present: false, taille: null })
	})

	test('toute autre réponse, ou aucune, arrête l’import avant toute écriture, sans dire l’adresse', async () => {
		for (const reponse of [
			() => new HttpResponse(null, { status: 500 }),
			() => new HttpResponse(null, { status: 403 }),
			() => new HttpResponse(null, { status: 301, headers: { Location: `${BASE}/ailleurs.png` } }),
			() => HttpResponse.error(),
		]) {
			simuler(http.head(adresse, reponse))
			const essai = sondeHttp(adresse)
			await expect(essai).rejects.toBeInstanceOf(ImportRefuse)
			await expect(essai).rejects.toThrow('rien n’est écrit')
			await expect(essai).rejects.not.toThrow('photo_1')
		}
	})

	test('chaque objet à adopter est sondé une fois, à l’adresse que la v3 donnera', async () => {
		const demandees: string[] = []
		const adoptables: Adoptable[] = [1, 2, 3].map(id => ({
			fichier: fichier(id),
			emplacement: { prefix: id === 3 ? '' : '1', filename: `photo_${id}.png` },
			compte: 1,
		}))

		const presences = await sonderLesObjets(adoptables, BASE, async adresse => {
			demandees.push(adresse)
			return { present: !adresse.endsWith('2.png'), taille: 10 }
		})

		expect(demandees.sort()).toEqual([`${BASE}/1/photo_1.png`, `${BASE}/1/photo_2.png`, `${BASE}/photo_3.png`])
		expect([...presences.entries()]).toEqual([
			[1, { present: true, taille: 10 }],
			[2, { present: false, taille: 10 }],
			[3, { present: true, taille: 10 }],
		])
	})
})

describe('les médias attendus', () => {
	test('chaque colonne tel quel ; la taille est celle de l’objet ; le propriétaire, le compte du profil dans Payload', () => {
		const formats = { thumbnail: { url: `${BASE}/thumbnail_photo_1.png`, size: 0.33, width: 13 } }
		const [media, sansObjet] = mediasAttendus(
			[
				{
					fichier: fichier(1, { alternative_text: 'Texte fictif', formats: JSON.stringify(formats) }),
					emplacement: { prefix: '1', filename: 'photo_1.png' },
					compte: 1,
				},
				{ fichier: fichier(2), emplacement: { prefix: '', filename: 'photo_2.png' }, compte: null },
			],
			new Map([
				[1, { present: true, taille: 2048 }],
				[2, { present: false, taille: null }],
			]),
			new Map([[1, 501]])
		)

		expect(media).toEqual({
			strapiId: 1,
			valeurs: {
				strapiId: 1,
				alt: 'Texte fictif',
				filename: 'photo_1.png',
				prefix: '1',
				mimeType: 'image/png',
				filesize: 2048,
				width: 40,
				height: 30,
				strapiFormats: formats,
				owner: 501,
				createdAt: '2024-01-01T10:00:00.000Z',
				updatedAt: '2024-01-02T10:00:00.000Z',
			},
			ecarts: [{ champ: 'filesize', reference: 'SCHEMA.md §8 (size)' }],
		})
		expect(sansObjet?.valeurs).toMatchObject({ prefix: '', filesize: null, owner: null })
		expect(ADAPTATEUR_MEDIAS.options?.(media as never)).toEqual({ contexte: { skipCloudStorage: true } })
	})

	test('une photo dont le fichier n’est pas adopté est signalée, pas inventée ; à blanc, son média n’a pas encore d’identifiant', () => {
		const medias = new Map<number, number | null>([
			[1, 11],
			[2, null],
		])

		expect(photosDeLEntree([1, 3, 2], medias)).toEqual({ ids: [11], adoptees: 2, nonReprises: [3] })
	})
})

describe('la comparaison des listes, des galeries et des valeurs gardées telles quelles', () => {
	test('une galerie se compare dans son ordre ; vide, elle ne vaut rien', () => {
		expect(normaliser('relations', [3, { id: 1 }])).toBe('[3,1]')
		expect(normaliser('relations', [1, 3])).not.toBe(normaliser('relations', [3, 1]))
		expect(normaliser('relations', [])).toBeNull()
	})

	test('une liste se compare sans l’identifiant de ses lignes, champs vides à part, dans son ordre', () => {
		const ecrite = [{ nom: 'Coiffure', description: null, options: [] }, { nom: 'Mariage' }]
		const relue = [
			{ id: 'a1', nom: 'Coiffure', description: null, options: [] },
			{ id: 'b2', description: undefined, nom: 'Mariage' },
		]

		expect(normaliser('liste', relue)).toBe(normaliser('liste', ecrite))
		expect(normaliser('liste', [...relue].reverse())).not.toBe(normaliser('liste', ecrite))
		expect(normaliser('liste', [{ prixTexte: '' }])).not.toBe(normaliser('liste', [{ prixTexte: null }]))
		expect(normaliser('liste', [{ options: [{ id: 'x', nom: 'A' }] }])).toBe(
			normaliser('liste', [{ options: [{ nom: 'A' }] }])
		)
		expect(normaliser('liste', [])).toBeNull()
	})

	test('une valeur JSON se compare quel que soit l’ordre de ses clés', () => {
		expect(normaliser('json', { b: 1, a: { d: [1, 2], c: null } })).toBe(
			normaliser('json', { a: { c: null, d: [1, 2] }, b: 1 })
		)
		expect(normaliser('json', { a: [1, 2] })).not.toBe(normaliser('json', { a: [2, 1] }))
	})
})

describe('un média nomme toujours son objet', () => {
	const appel = (operation: 'create' | 'update', data: Record<string, unknown>) =>
		Promise.resolve().then(() => unFichierALaCreation({ data, operation, req: { t: (cle: string) => cle } } as never))

	test('une création sans nom de fichier est refusée ; avec son nom (l’adoption de l’import), elle passe', async () => {
		await expect(appel('create', { alt: 'Sans fichier' })).rejects.toThrow()
		await expect(appel('create', { filename: '' })).rejects.toThrow()
		expect(await appel('create', { filename: 'photo_1.png', prefix: '1' })).toEqual({
			filename: 'photo_1.png',
			prefix: '1',
		})
		expect(await appel('update', { alt: 'Texte fictif' })).toEqual({ alt: 'Texte fictif' })
	})
})

describe('le rapport des fichiers et des photos', () => {
	const vide = { lignes: 0, empreinte: '' }
	const rapport: Rapport = {
		mode: 'reel',
		cible: 'locale',
		arret: null,
		decisionsSansObjet: 0,
		source: { avant: { files: vide }, apres: { files: vide }, inchangee: true },
		collections: {
			media: {
				source: 13,
				crees: 8,
				modifies: 0,
				inchanges: 0,
				refuses: [],
				enTrop: [],
				fichiers: {
					designes: 9,
					deEntreesNonPrises: 0,
					deEntreesDisparues: 2,
					sansLien: 2,
					sansStockage: false,
					nonAdoptes: [{ fichier: 108, motif: 'pas-une-image' }],
					introuvables: [107],
					nomsDifferents: [104],
					envoyesParUnAutreCompte: [109],
				},
			},
			profiles: {
				source: 27,
				crees: 13,
				modifies: 0,
				inchanges: 0,
				refuses: [],
				enTrop: [],
				photosNonReprises: [{ entree: 24, fichier: 108 }],
				liensSansLigne: [22],
			},
		},
		ecarts: { 'SCHEMA.md §8 (size)': 8, 'fichiers-non-images-non-repris': 1 },
		parite: null,
	}

	test('en nombres et en identifiants de l’ancienne base, jamais une adresse ; un fichier signalé ne change pas le code', () => {
		const texte = rapportEnTexte(rapport)

		expect(texte.split('\n')).toEqual(
			expect.arrayContaining([
				'Médias : 13 à la source ; 8 créations, 0 mise à jour, 0 inchangé, 0 refusé',
				'  - fichiers : 9 désignés par un profil ou un article repris ; désignés par aucun, donc non adoptés : 0 liés à une entrée non reprise, 2 à une entrée disparue, 2 sans lien',
				'  - non adoptés (pas-une-image) : 108',
				'  - 404 connus, adoptés sans objet dans le stockage : 107',
				'  - objet nommé autrement que hash suivi de ext : 104',
				'  - envoyés par un autre compte que celui du profil : 109',
				'  - photos non reprises, leur fichier n’étant pas adopté : 24 (fichier 108)',
				'  - liens de liste qui ne nomment aucune ligne, signalés : 22',
				'Écarts voulus, à lire contre le registre ou le schéma : fichiers-non-images-non-repris 1 ; SCHEMA.md §8 (size) 8.',
			])
		)
		expect(texte).not.toMatch(/https?:|\.png/)
		expect(codeDeSortie(rapport)).toBe(0)
	})

	test('un fichier refusé (adresse hors de la base, deux comptes) attend une décision : code 5', () => {
		const media = rapport.collections.media
		const refuse: Rapport = {
			...rapport,
			collections: {
				...rapport.collections,
				media: media && { ...media, refuses: [{ strapiId: 110, motif: 'plusieurs-proprietaires', champs: ['owner'] }] },
			},
		}

		expect(rapportEnTexte(refuse)).toContain('  - refusé : 110 (plusieurs-proprietaires : owner)')
		expect(codeDeSortie(refuse)).toBe(5)
	})
})
