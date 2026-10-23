import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { INDEXABLE_FILTER, isIndexable, isList, isVisible, LISTED_FILTER } from '@/lib/profile/visibility'
import { LIST_MAX_LIMIT, listProfiles } from '@/services/public/profiles'

/**
 * The public reading of the profiles, without a database (ticket 071; plan 02 §7.2, U20 and U22):
 * the three rules, the keys of a card, and the guard that keeps every public page behind the
 * module. The runs against the bench: tests/integration/public-read.test.ts.
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
function payloadSpy(surcharge: Record<string, unknown> = {}) {
	const readings: Record<string, unknown>[] = []
	const payload = {
		find: async (options: Record<string, unknown>) => {
			readings.push(options)
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
						...surcharge,
					},
				],
				page: 1,
				totalDocs: 1,
				hasNextPage: false,
			}
		},
	}
	return { payload: payload as unknown as Payload, lectures: readings }
}

/** The keys of a card of a commune (U22). */
const CARD_KEYS = ['lieu', 'nom', 'photo', 'pid', 'slug', 'specialite', 'superMaquilleuse']

describe('U22 : la carte d’une liste, clés figées', () => {
	test('ni email, ni téléphone, ni compte, ni score, ni statut : sept clés, la photo et l’identifiant de mesure compris', async () => {
		const { payload } = payloadSpy()

		const { cartes: cards } = await listProfiles(payload)

		expect(cards).toHaveLength(1)
		expect(Object.keys(cards[0] ?? {}).sort()).toEqual([
			'lieu',
			'nom',
			'photo',
			'pid',
			'slug',
			'specialite',
			'superMaquilleuse',
		])
		expect(cards[0]).toEqual({
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
		const { payload, lectures: readings } = payloadSpy()

		await listProfiles(payload)

		const identifiersReadings = readings.filter(
			lecture => lecture.collection === 'profiles' && (lecture.select as Record<string, unknown>)?.strapiId === true
		)
		expect(identifiersReadings).toHaveLength(1)
		expect(identifiersReadings[0]).toMatchObject({
			where: { id: { in: [1] } },
			select: { strapiId: true },
			overrideAccess: true,
		})
	})

	test('la photo n’est que son adresse et sa taille : jamais son propriétaire, son nom de fichier ni ses autres champs', async () => {
		const { payload } = payloadSpy()
		const { cartes: cards } = await listProfiles(payload)
		expect(Object.keys(cards[0]?.photo ?? {}).sort()).toEqual(['height', 'url', 'width'])
	})

	test('les photos de la liste se lisent en une requête, par les identifiants que la lecture des profils a donnés', async () => {
		const { payload, lectures: readings } = payloadSpy()

		await listProfiles(payload)

		const photos = readings.filter(lecture => lecture.collection === 'media')
		expect(photos).toHaveLength(1)
		expect(photos[0]).toMatchObject({
			where: { id: { in: [7] } },
			select: { url: true, width: true, height: true, filename: true, prefix: true },
			limit: LIST_MAX_LIMIT,
		})
	})

	test('la lecture choisit ses champs, garde les règles d’accès, filtre sur « listé » et se borne elle-même', async () => {
		const { payload, lectures: readings } = payloadSpy()

		await listProfiles(payload, { page: 3, limite: 5000 })
		await listProfiles(payload, { limite: 0 })

		const [large, nulle] = readings.filter(
			lecture => lecture.collection === 'profiles' && lecture.overrideAccess === false
		)
		expect(large).toMatchObject({ collection: 'profiles', where: LISTED_FILTER, overrideAccess: false, page: 3 })
		expect(large?.limit).toBe(LIST_MAX_LIMIT)
		expect(nulle?.limit).toBe(20)
		const fields = Object.keys(large?.select as object).sort()
		for (const privateOnes of ['contactDetails', 'publicContact', 'pro', 'score', 'internalNote', 'status', 'email'])
			expect(fields).not.toContain(privateOnes)
	})
})

/** The TypeScript and TSX files under a folder, relative paths. */
function filesOf(dossier: string): string[] {
	return readdirSync(dossier).flatMap(nom => {
		const filePath = join(dossier, nom)
		return statSync(filePath).isDirectory() ? filesOf(filePath) : /\.tsx?$/.test(nom) ? [filePath] : []
	})
}

/** The text of each call of a method of Payload (`.find({ … })`), up to its closing brace. */
function callsOf(code: string, methode: string): string[] {
	const calls: string[] = []
	for (const startedAt of code.matchAll(new RegExp(`\\.${methode}\\(\\s*\\{`, 'g'))) {
		let depth = 0
		let end = startedAt.index
		for (; end < code.length; end += 1) {
			if (code[end] === '{') depth += 1
			if (code[end] === '}' && --depth === 0) break
		}
		calls.push(code.slice(startedAt.index, end + 1))
	}
	return calls
}

const PAYLOAD_READINGS = ['find', 'findByID', 'findDistinct', 'count', 'findVersions', 'findGlobal']

describe('Un seul point de lecture publique', () => {
	test('aucune page ni aucun composant du site ne lit une collection : ils passent par src/services/public/', () => {
		const faults = filesOf('src/app/(front)').flatMap(fichier => {
			const code = readFileSync(fichier, 'utf8')
			return PAYLOAD_READINGS.filter(methode => new RegExp(`\\.${methode}\\(`).test(code)).map(
				methode => `${fichier} : .${methode}(`
			)
		})
		expect(faults).toEqual([])
	})

	test('chaque lecture en liste du module donne sa limite, et garde les règles d’accès', () => {
		const files = filesOf('src/services/public')
		expect(files.length).toBeGreaterThan(0)
		const faults = files.flatMap(fichier => {
			const code = readFileSync(fichier, 'utf8')
			return callsOf(code, 'find').flatMap(appel => [
				...(/\blimit:/.test(appel) ? [] : [`${fichier} : un .find( sans limit`]),
				...(/overrideAccess:\s*(false|true)/.test(appel) ? [] : [`${fichier} : un .find( sans overrideAccess`]),
			])
		})
		expect(faults).toEqual([])
	})

	test('le contrôle voit une lecture sans limite', () => {
		const calls = callsOf("await payload.find({ collection: 'profiles', depth: 0 })", 'find')
		expect(calls).toHaveLength(1)
		expect(calls[0]).not.toMatch(/\blimit:/)
		expect(callsOf('payload.find({ where: { a: { equals: 1 } }, limit: 3 })', 'find')[0]).toMatch(/\blimit:/)
	})
})

describe('264 : la carte d’une zone hors de France', () => {
	const REGIONAL_INDICATORS = /[\u{1F1E6}-\u{1F1FF}]/u

	test('une ville à l’étranger : le lieu dit la ville et le pays, le drapeau est une clé à part', async () => {
		const { payload } = payloadSpy({
			city: null,
			zoneKind: 'countries',
			countries: ['BE'],
			town: 'Bruxelles',
			radiusKm: 30,
		})

		const [card] = (await listProfiles(payload)).cartes

		expect(card).toMatchObject({ lieu: 'Bruxelles (Belgique) et 30 km autour', flags: ['🇧🇪'] })
		expect(card?.lieu).not.toMatch(REGIONAL_INDICATORS)
		expect(Object.keys(card ?? {}).sort()).toEqual([...CARD_KEYS, 'flags'].sort())
	})

	test('un pays seul, puis plusieurs pays : le nom est écrit, le rayon est ignoré, aucun drapeau dans le texte', async () => {
		const alone = (
			await listProfiles(payloadSpy({ city: null, zoneKind: 'countries', countries: ['BE'], radiusKm: 30 }).payload)
		).cartes[0]
		const several = (
			await listProfiles(payloadSpy({ city: null, zoneKind: 'countries', countries: ['FR', 'IT'] }).payload)
		).cartes[0]

		expect(alone).toMatchObject({ lieu: 'Belgique', flags: ['🇧🇪'] })
		expect(several).toMatchObject({ lieu: 'France et Italie', flags: ['🇫🇷', '🇮🇹'] })
		for (const card of [alone, several]) expect(card?.lieu).not.toMatch(REGIONAL_INDICATORS)
	})

	test('une commune : la carte est ce qu’elle était, sans clé de drapeau', async () => {
		const [card] = (await listProfiles(payloadSpy().payload)).cartes
		expect(card?.lieu).toBe('Annecy et 30 km autour')
		expect(Object.keys(card ?? {}).sort()).toEqual([...CARD_KEYS].sort())
	})
})
