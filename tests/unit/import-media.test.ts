import { describe, expect, test } from 'bun:test'
import { normalize } from '../../scripts/migration/import/engine'
import {
	type Adoptable,
	classifyFiles,
	entryPhotos,
	expectedMedia,
	type FileLink,
	type FileRow,
	httpProbe,
	locationInAddress,
	MEDIA_ADAPTER,
	PROFILE_TYPE,
	probeObjects,
	type ReadFiles,
	type TakenEntries,
	TYPE_ARTICLE,
} from '../../scripts/migration/import/media'
import { exitCode, type Report, reportAsText } from '../../scripts/migration/import/report'
import { ImportRefuse } from '../../scripts/migration/import/target'
import { fileOnCreate } from '../../src/collections/Media'
import { HttpResponse, http, simulate } from '../support/outgoing-http'

/**
 * Ticket 058: what the import makes of the files of the old site, before and without the database:
 * which ones it adopts, where their object is read from their address, what a request for headers
 * says. The runs on the bench are in tests/integration/import-media.test.ts. Every value here is
 * fictional; the addresses are on a domain reserved for tests.
 */

const BASE = 'https://photos.example.test'

const file = (id: number, modif: Partial<FileRow> = {}): FileRow => ({
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

const link = (fichier: number, entree: number, champ = 'image_gallery', type = PROFILE_TYPE): FileLink => ({
	fichier,
	entree,
	type,
	champ,
})

/** Profiles 21 (account 1) and 22 (account 2) taken; profile 29 in the source, set aside; article 7 taken. */
const ENTRIES: TakenEntries = {
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
		expect(locationInAddress(`${BASE}/photo_1.png`, BASE)).toEqual({ prefix: '', filename: 'photo_1.png' })
		expect(locationInAddress(`${BASE}/1/photo_1.png`, BASE)).toEqual({ prefix: '1', filename: 'photo_1.png' })
		expect(locationInAddress(`${BASE}/a/b/photo.webp`, BASE)).toEqual({ prefix: 'a/b', filename: 'photo.webp' })
		// A character the v3 encodes the same way: the address comes back character for character.
		expect(locationInAddress(`${BASE}/1/photo%20d%C3%A9t%C3%A9.png`, BASE)).toEqual({
			prefix: '1',
			filename: 'photo dété.png',
		})
	})

	test('une adresse que la v3 ne redonnerait pas à l’identique ne se lit pas', () => {
		for (const url of [
			'https://autre.example.test/1/photo.png',
			`${BASE}-autre/1/photo.png`,
			`${BASE}/1/photo.png?v=2`,
			`${BASE}/1//photo.png`,
			`${BASE}/1/`,
			`${BASE}/1/photo+x.png`,
			`${BASE}/1/photo%zz.png`,
			BASE,
		])
			expect(locationInAddress(url, BASE), url).toBeNull()
		expect(locationInAddress(null, BASE)).toBeNull()
	})
})

describe('les fichiers de la source sont adoptés, signalés ou refusés', () => {
	const read = (fichiers: FileRow[], liens: FileLink[]): ReadFiles => ({ fichiers, liens })

	test('une image désignée par un profil repris est adoptée, au compte de ce profil ; une image d’article sans propriétaire', () => {
		const { adoptables: adoptable, pointed: designes } = classifyFiles(
			read(
				[file(1), file(2), file(3, { url: `${BASE}/photo_3.png` })],
				[link(1, 21, 'main_picture'), link(2, 22), link(3, 7, 'galery', TYPE_ARTICLE)]
			),
			ENTRIES,
			BASE
		)

		expect(designes).toBe(3)
		expect(adoptable.map(({ fichier: file, emplacement, compte }) => [file.id, emplacement, compte])).toEqual([
			[1, { prefix: '1', filename: 'photo_1.png' }, 1],
			[2, { prefix: '1', filename: 'photo_2.png' }, 2],
			[3, { prefix: '', filename: 'photo_3.png' }, null],
		])
	})

	test('aucun orphelin : ni fichier sans lien, ni fichier d’une entrée disparue ou non reprise (I39)', () => {
		const ranking = classifyFiles(
			read(
				[file(1), file(2), file(3), file(4), file(5)],
				[
					link(1, 70, 'main_picture'),
					link(2, 29),
					link(3, 21, 'video'),
					link(4, 8, 'galery', TYPE_ARTICLE),
					link(4, 3, 'image', 'api::talent.talent'),
				]
			),
			ENTRIES,
			BASE
		)

		expect(ranking).toMatchObject({
			source: 5,
			adoptables: [],
			pointed: 0,
			ofEntriesNotTaken: 1,
			ofVanishedEntries: 3,
			withoutLink: 1,
		})
	})

	test('un fichier qui n’est pas une image est signalé, pas adopté ; sans stockage, aucun ne l’est', () => {
		const source = read(
			[file(1, { mime: 'application/pdf', ext: '.pdf' }), file(2, { mime: 'image/svg+xml' }), file(3)],
			[link(1, 21), link(2, 21), link(3, 21)]
		)

		expect(classifyFiles(source, ENTRIES, BASE)).toMatchObject({
			adoptables: [{ fichier: { id: 3 } }],
			notAdopted: [
				{ file: 1, reason: 'pas-une-image' },
				{ file: 2, reason: 'pas-une-image' },
			],
			refused: [],
		})
		expect(classifyFiles(source, ENTRIES, null)).toMatchObject({
			adoptables: [],
			notAdopted: [
				{ file: 1, reason: 'pas-une-image' },
				{ file: 2, reason: 'pas-une-image' },
				{ file: 3, reason: 'sans-stockage' },
			],
		})
	})

	test('une adresse hors de la base des photos, ou un fichier de deux comptes, est refusé et attend une décision', () => {
		const { adoptables: adoptable, refused: refuses } = classifyFiles(
			read(
				[file(1, { url: 'https://ailleurs.example.test/1/photo_1.png' }), file(2), file(3)],
				[link(1, 21), link(2, 21), link(2, 22), link(3, 21), link(3, 7, 'galery', TYPE_ARTICLE)]
			),
			ENTRIES,
			BASE
		)

		expect(adoptable).toEqual([])
		expect(refuses).toEqual([
			{ strapiId: 1, reason: 'adresse-hors-de-la-base', fields: ['prefix', 'filename'] },
			{ strapiId: 2, reason: 'plusieurs-proprietaires', fields: ['owner'] },
			{ strapiId: 3, reason: 'plusieurs-proprietaires', fields: ['owner'] },
		])
	})

	test('le nom de l’objet autre que hash + ext, ou un envoi par un autre compte, est signalé et le fichier adopté', () => {
		const ranking = classifyFiles(
			read(
				[file(1, { hash: 'autre_nom' }), file(2, { uploaded_by: 9 }), file(3, { uploaded_by: 1 })],
				[link(1, 21), link(2, 21), link(3, 21)]
			),
			ENTRIES,
			BASE
		)

		expect(ranking.adoptables.map(({ fichier: file }) => file.id)).toEqual([1, 2, 3])
		expect(ranking.differentNames).toEqual([1])
		expect(ranking.uploadedByAnotherAccount).toEqual([2])
	})
})

describe('le stockage n’est lu que par des requêtes d’en-tête', () => {
	const url = `${BASE}/1/photo_1.png`

	test('200 : présent, sa taille en octets ; 404 : absent', async () => {
		simulate(
			http.head(url, () => new HttpResponse(null, { status: 200, headers: { 'Content-Length': '1234' } })),
			http.head(`${BASE}/1/absente.png`, () => new HttpResponse(null, { status: 404 }))
		)

		expect(await httpProbe(url)).toEqual({ present: true, taille: 1234 })
		expect(await httpProbe(`${BASE}/1/absente.png`)).toEqual({ present: false, taille: null })
	})

	test('toute autre réponse, ou aucune, arrête l’import avant toute écriture, sans dire l’adresse', async () => {
		for (const response of [
			() => new HttpResponse(null, { status: 500 }),
			() => new HttpResponse(null, { status: 403 }),
			() => new HttpResponse(null, { status: 301, headers: { Location: `${BASE}/ailleurs.png` } }),
			() => HttpResponse.error(),
		]) {
			simulate(http.head(url, response))
			const attempt = httpProbe(url)
			await expect(attempt).rejects.toBeInstanceOf(ImportRefuse)
			await expect(attempt).rejects.toThrow('rien n’est écrit')
			await expect(attempt).rejects.not.toThrow('photo_1')
		}
	})

	test('chaque objet à adopter est sondé une fois, à l’adresse que la v3 donnera', async () => {
		const requested: string[] = []
		const adoptable: Adoptable[] = [1, 2, 3].map(id => ({
			fichier: file(id),
			emplacement: { prefix: id === 3 ? '' : '1', filename: `photo_${id}.png` },
			compte: 1,
		}))

		const presences = await probeObjects(adoptable, BASE, async adresse => {
			requested.push(adresse)
			return { present: !adresse.endsWith('2.png'), taille: 10 }
		})

		expect(requested.sort()).toEqual([`${BASE}/1/photo_1.png`, `${BASE}/1/photo_2.png`, `${BASE}/photo_3.png`])
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
		const [media, withoutObject] = expectedMedia(
			[
				{
					fichier: file(1, { alternative_text: 'Texte fictif', formats: JSON.stringify(formats) }),
					emplacement: { prefix: '1', filename: 'photo_1.png' },
					compte: 1,
				},
				{ fichier: file(2), emplacement: { prefix: '', filename: 'photo_2.png' }, compte: null },
			],
			new Map([
				[1, { present: true, taille: 2048 }],
				[2, { present: false, taille: null }],
			]),
			new Map([[1, 501]])
		)

		expect(media).toEqual({
			strapiId: 1,
			values: {
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
			gaps: [{ field: 'filesize', reference: 'SCHEMA.md §8 (size)' }],
		})
		expect(withoutObject?.values).toMatchObject({ prefix: '', filesize: null, owner: null })
		expect(MEDIA_ADAPTER.options?.(media as never)).toEqual({ context: { skipCloudStorage: true } })
	})

	test('une photo dont le fichier n’est pas adopté est signalée, pas inventée ; à blanc, son média n’a pas encore d’identifiant', () => {
		const mediaValue = new Map<number, number | null>([
			[1, 11],
			[2, null],
		])

		expect(entryPhotos([1, 3, 2], mediaValue)).toEqual({ ids: [11], adoptees: 2, nonReprises: [3] })
	})
})

describe('la comparaison des listes, des galeries et des valeurs gardées telles quelles', () => {
	test('une galerie se compare dans son ordre ; vide, elle ne vaut rien', () => {
		expect(normalize('relations', [3, { id: 1 }])).toBe('[3,1]')
		expect(normalize('relations', [1, 3])).not.toBe(normalize('relations', [3, 1]))
		expect(normalize('relations', [])).toBeNull()
	})

	test('une liste se compare sans l’identifiant de ses lignes, champs vides à part, dans son ordre', () => {
		const written = [{ nom: 'Coiffure', description: null, options: [] }, { nom: 'Mariage' }]
		const reread = [
			{ id: 'a1', nom: 'Coiffure', description: null, options: [] },
			{ id: 'b2', description: undefined, nom: 'Mariage' },
		]

		expect(normalize('liste', reread)).toBe(normalize('liste', written))
		expect(normalize('liste', [...reread].reverse())).not.toBe(normalize('liste', written))
		expect(normalize('liste', [{ priceText: '' }])).not.toBe(normalize('liste', [{ priceText: null }]))
		expect(normalize('liste', [{ options: [{ id: 'x', nom: 'A' }] }])).toBe(
			normalize('liste', [{ options: [{ nom: 'A' }] }])
		)
		expect(normalize('liste', [])).toBeNull()
	})

	test('une valeur JSON se compare quel que soit l’ordre de ses clés', () => {
		expect(normalize('json', { b: 1, a: { d: [1, 2], c: null } })).toBe(
			normalize('json', { a: { c: null, d: [1, 2] }, b: 1 })
		)
		expect(normalize('json', { a: [1, 2] })).not.toBe(normalize('json', { a: [2, 1] }))
	})
})

describe('un média nomme toujours son objet', () => {
	const call = (operation: 'create' | 'update', data: Record<string, unknown>) =>
		Promise.resolve().then(() => fileOnCreate({ data, operation, req: { t: (cle: string) => cle } } as never))

	test('une création sans nom de fichier est refusée ; avec son nom (l’adoption de l’import), elle passe', async () => {
		await expect(call('create', { alt: 'Sans fichier' })).rejects.toThrow()
		await expect(call('create', { filename: '' })).rejects.toThrow()
		expect(await call('create', { filename: 'photo_1.png', prefix: '1' })).toEqual({
			filename: 'photo_1.png',
			prefix: '1',
		})
		expect(await call('update', { alt: 'Texte fictif' })).toEqual({ alt: 'Texte fictif' })
	})
})

describe('le rapport des fichiers et des photos', () => {
	const empty = { rows: 0, fingerprint: '' }
	const report: Report = {
		mode: 'real',
		target: 'local',
		halt: null,
		pointlessDecisions: 0,
		source: { before: { files: empty }, after: { files: empty }, unchanged: true },
		collections: {
			media: {
				source: 13,
				created: 8,
				updated: 0,
				unchanged: 0,
				refused: [],
				extra: [],
				files: {
					pointed: 9,
					ofEntriesNotTaken: 0,
					ofVanishedEntries: 2,
					withoutLink: 2,
					withoutStorage: false,
					notAdopted: [{ file: 108, reason: 'pas-une-image' }],
					notFound: [107],
					differentNames: [104],
					uploadedByAnotherAccount: [109],
				},
			},
			profiles: {
				source: 27,
				created: 13,
				updated: 0,
				unchanged: 0,
				refused: [],
				extra: [],
				photosNotCarriedOver: [{ entry: 24, file: 108 }],
				linksWithoutRow: [22],
			},
		},
		gaps: { 'SCHEMA.md §8 (size)': 8, 'fichiers-non-images-non-repris': 1 },
		parity: null,
	}

	test('en nombres et en identifiants de l’ancienne base, jamais une adresse ; un fichier signalé ne change pas le code', () => {
		const text = reportAsText(report)

		expect(text.split('\n')).toEqual(
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
		expect(text).not.toMatch(/https?:|\.png/)
		expect(exitCode(report)).toBe(0)
	})

	test('un fichier refusé (adresse hors de la base, deux comptes) attend une décision : code 5', () => {
		const media = report.collections.media
		const refuse: Report = {
			...report,
			collections: {
				...report.collections,
				media: media && {
					...media,
					refused: [{ strapiId: 110, reason: 'plusieurs-proprietaires', fields: ['owner'] }],
				},
			},
		}

		expect(reportAsText(refuse)).toContain('  - refusé : 110 (plusieurs-proprietaires : owner)')
		expect(exitCode(refuse)).toBe(5)
	})
})
