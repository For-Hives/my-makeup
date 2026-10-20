import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { INDEXABLE_FILTER, isIndexable, isList, isVisible, LISTED_FILTER } from '@/lib/profile/visibility'
import { LIST_MAX_LIMIT, listProfiles } from '@/services/public/profiles'

/**
 * The public reading of the profiles, without a database (ticket 071; plan 02 §7.2, U20 and U22):
 * the three rules, the keys of a card, and the guard that keeps every public page behind the
 * module. The runs against the bench: tests/integration/lecture-publique.test.ts.
 */

describe('U20 : listé, indexable, visible', () => {
	test('le masqué, l’indisponible et l’entièrement vide ne sont pas listés', () => {
		expect(isList({ status: 'published', available: true, fullyEmpty: false })).toBe(true)
		expect(isList({ status: 'hidden', available: true, fullyEmpty: false })).toBe(false)
		expect(isList({ status: 'published', available: false, fullyEmpty: false })).toBe(false)
		expect(isList({ status: 'published', available: true, fullyEmpty: true })).toBe(false)
	})

	test('une disponibilité jamais posée compte comme disponible (available=null)', () => {
		expect(isList({ status: 'published', available: null, fullyEmpty: false })).toBe(true)
		expect(isList({ status: 'published', fullyEmpty: false })).toBe(true)
	})

	test('indexable : publiable et pas masqué ; un profil visible mais non publiable reste hors de l’index', () => {
		expect(isIndexable({ status: 'published', publishable: true })).toBe(true)
		expect(isIndexable({ status: 'published', publishable: false })).toBe(false)
		expect(isIndexable({ status: 'published', publishable: null })).toBe(false)
		expect(isIndexable({ status: 'hidden', publishable: true })).toBe(false)
		expect(isVisible({ status: 'published', publishable: false })).toBe(true)
	})

	test('visible à son adresse : tout sauf le masqué, indisponible ou non', () => {
		expect(isVisible({ status: 'published', available: false, fullyEmpty: true })).toBe(true)
		expect(isVisible({ status: 'hidden' })).toBe(false)
	})

	test('les filtres de la base, sans le statut que la règle de lecture pose déjà', () => {
		expect(LISTED_FILTER).toEqual({
			and: [{ available: { not_equals: false } }, { fullyEmpty: { not_equals: true } }],
		})
		expect(INDEXABLE_FILTER).toEqual({ publishable: { equals: true } })
	})
})

/** A Payload that records the reads it is given and answers one profile. */
function payloadEspion() {
	const lectures: Record<string, unknown>[] = []
	const payload = {
		find: async (options: Record<string, unknown>) => {
			lectures.push(options)
			// The photos: read by the identifiers the profiles gave, with more fields than a card keeps.
			if (options.collection === 'media')
				return {
					docs: [
						{
							id: 7,
							url: 'https://photos.example.test/media/abc.webp',
							width: 400,
							height: 400,
							filename: 'abc.webp',
							owner: 3,
						},
					],
				}
			// The id of the old site, read apart (it is a field the public does not read).
			if (options.collection === 'profiles' && (options.select as Record<string, unknown>)?.strapiId === true)
				return { docs: [{ id: 1, strapiId: 4242 }] }
			return {
				docs: [
					{
						id: 1,
						slug: 'zoe-fictive',
						firstName: 'Zoé',
						lastName: 'Fictive',
						specialty: 'Mariage',
						city: { name: 'Annecy', inseeCode: '74010' },
						radiusKm: 30,
						superArtist: true,
						mainPicture: 7,
					},
				],
				page: 1,
				totalDocs: 1,
				hasNextPage: false,
			}
		},
	}
	return { payload: payload as unknown as Payload, lectures }
}

describe('U22 : la carte d’une liste, clés figées', () => {
	test('ni email, ni téléphone, ni compte, ni score, ni statut : sept clés, la photo et l’identifiant de mesure compris', async () => {
		const { payload } = payloadEspion()

		const { cartes } = await listProfiles(payload)

		expect(cartes).toHaveLength(1)
		expect(Object.keys(cartes[0] ?? {}).sort()).toEqual([
			'lieu',
			'nom',
			'photo',
			'pid',
			'slug',
			'specialite',
			'superMaquilleuse',
		])
		expect(cartes[0]).toEqual({
			slug: 'zoe-fictive',
			pid: 4242,
			nom: 'Zoé Fictive',
			specialite: 'Mariage',
			lieu: 'Annecy et 30 km autour',
			superMaquilleuse: true,
			photo: { url: 'https://photos.example.test/media/abc.webp', width: 400, height: 400 },
		})
	})

	test('l’identifiant de mesure : celui de l’ancien site s’il y en a un, lu à part, sur les seuls profils déjà donnés', async () => {
		const { payload, lectures } = payloadEspion()

		await listProfiles(payload)

		const lecturesDesIdentifiants = lectures.filter(
			lecture => lecture.collection === 'profiles' && (lecture.select as Record<string, unknown>)?.strapiId === true
		)
		expect(lecturesDesIdentifiants).toHaveLength(1)
		expect(lecturesDesIdentifiants[0]).toMatchObject({
			where: { id: { in: [1] } },
			select: { strapiId: true },
			overrideAccess: true,
		})
	})

	test('la photo n’est que son adresse et sa taille : jamais son propriétaire, son nom de fichier ni ses autres champs', async () => {
		const { payload } = payloadEspion()
		const { cartes } = await listProfiles(payload)
		expect(Object.keys(cartes[0]?.photo ?? {}).sort()).toEqual(['height', 'url', 'width'])
	})

	test('les photos de la liste se lisent en une requête, par les identifiants que la lecture des profils a donnés', async () => {
		const { payload, lectures } = payloadEspion()

		await listProfiles(payload)

		const photos = lectures.filter(lecture => lecture.collection === 'media')
		expect(photos).toHaveLength(1)
		expect(photos[0]).toMatchObject({
			where: { id: { in: [7] } },
			select: { url: true, width: true, height: true, filename: true, prefix: true },
			limit: LIST_MAX_LIMIT,
		})
	})

	test('la lecture choisit ses champs, garde les règles d’accès, filtre sur « listé » et se borne elle-même', async () => {
		const { payload, lectures } = payloadEspion()

		await listProfiles(payload, { page: 3, limite: 5000 })
		await listProfiles(payload, { limite: 0 })

		const [grande, nulle] = lectures.filter(
			lecture => lecture.collection === 'profiles' && lecture.overrideAccess === false
		)
		expect(grande).toMatchObject({ collection: 'profiles', where: LISTED_FILTER, overrideAccess: false, page: 3 })
		expect(grande?.limit).toBe(LIST_MAX_LIMIT)
		expect(nulle?.limit).toBe(20)
		const champs = Object.keys(grande?.select as object).sort()
		for (const prive of ['contactDetails', 'publicContact', 'pro', 'score', 'internalNote', 'status', 'email'])
			expect(champs).not.toContain(prive)
	})
})

/** The TypeScript and TSX files under a folder, relative paths. */
function fichiersDe(dossier: string): string[] {
	return readdirSync(dossier).flatMap(nom => {
		const chemin = join(dossier, nom)
		return statSync(chemin).isDirectory() ? fichiersDe(chemin) : /\.tsx?$/.test(nom) ? [chemin] : []
	})
}

/** The text of each call of a method of Payload (`.find({ … })`), up to its closing brace. */
function appelsDe(code: string, methode: string): string[] {
	const appels: string[] = []
	for (const debut of code.matchAll(new RegExp(`\\.${methode}\\(\\s*\\{`, 'g'))) {
		let profondeur = 0
		let fin = debut.index
		for (; fin < code.length; fin += 1) {
			if (code[fin] === '{') profondeur += 1
			if (code[fin] === '}' && --profondeur === 0) break
		}
		appels.push(code.slice(debut.index, fin + 1))
	}
	return appels
}

const LECTURES_DE_PAYLOAD = ['find', 'findByID', 'findDistinct', 'count', 'findVersions', 'findGlobal']

describe('Un seul point de lecture publique', () => {
	test('aucune page ni aucun composant du site ne lit une collection : ils passent par src/services/public/', () => {
		const fautes = fichiersDe('src/app/(front)').flatMap(fichier => {
			const code = readFileSync(fichier, 'utf8')
			return LECTURES_DE_PAYLOAD.filter(methode => new RegExp(`\\.${methode}\\(`).test(code)).map(
				methode => `${fichier} : .${methode}(`
			)
		})
		expect(fautes).toEqual([])
	})

	test('chaque lecture en liste du module donne sa limite, et garde les règles d’accès', () => {
		const fichiers = fichiersDe('src/services/public')
		expect(fichiers.length).toBeGreaterThan(0)
		const fautes = fichiers.flatMap(fichier => {
			const code = readFileSync(fichier, 'utf8')
			return appelsDe(code, 'find').flatMap(appel => [
				...(/\blimit:/.test(appel) ? [] : [`${fichier} : un .find( sans limit`]),
				...(/overrideAccess:\s*(false|true)/.test(appel) ? [] : [`${fichier} : un .find( sans overrideAccess`]),
			])
		})
		expect(fautes).toEqual([])
	})

	test('le contrôle voit une lecture sans limite', () => {
		const appels = appelsDe("await payload.find({ collection: 'profiles', depth: 0 })", 'find')
		expect(appels).toHaveLength(1)
		expect(appels[0]).not.toMatch(/\blimit:/)
		expect(appelsDe('payload.find({ where: { a: { equals: 1 } }, limit: 3 })', 'find')[0]).toMatch(/\blimit:/)
	})
})
