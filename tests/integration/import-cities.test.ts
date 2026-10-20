import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CaseToReview } from '../../scripts/migration/import/cities'
import type { Decisions } from '../../scripts/migration/import/decisions'
import { geoApiReference, keptReference, REFERENCE_ADDRESS } from '../../scripts/migration/import/reference'
import {
	BENCH_DECISION_FILE,
	BENCH_DECISIONS,
	BENCH_REFERENCE_FILE,
	benchReference,
	importCommand,
	importOnBench,
} from '../support/import'
import { HttpResponse, http, simulate } from '../support/outgoing-http'
import { emptyBase, testPayload } from '../support/payload-test'
import { createSourceStrapi, eraseSourceStrapi, sourceFingerprint } from '../support/source-strapi'

/**
 * Ticket 063: the city typed in a profile of the fake source becomes a commune of the official
 * list, with its INSEE code, never an address (plan 01 §6.2 « Ville »; plan 03 SEO-24). The
 * referential is read offline from its kept answers (tests/fixtures/import/bench-reference.json),
 * or simulated: no test calls the Internet.
 *
 * The cities of the fake source (docs/tests/source-strapi.md): 21 « Annecy », 22 « 74000 Annecy »,
 * 23 a postal address in Annecy, 24 « Toulouse (31) », 25 « 75116 », 26 « France », 28
 * « Saint-Julien » (six communes), 30 « annecy », 32 « Lyon », 33 « Nantes », 34 « Annemasse »;
 * 27 and 31 have none.
 */

/** The decision lines a person would write after reading the private list of review. */
const CITIES_DECISIONS: Decisions = {
	...BENCH_DECISIONS,
	cities: [
		// The Saint-Julien of the Rhône, one of the six candidates.
		{ profile: 28, inseeCode: '69215' },
		// « France » is no commune: the zone stays empty, reviewed.
		{ profile: 26, inseeCode: null },
	],
}

let review: CaseToReview[] = []
let first: Awaited<ReturnType<typeof importOnBench>>

beforeAll(async () => {
	await emptyBase()
	await createSourceStrapi()
	first = await importOnBench('real', {
		onReview: cas => {
			review = cas
		},
	})
	// The first run of the file starts Payload on the bench: longer than the default 5 s.
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

async function profiles(overrideAccess = true) {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		pagination: false,
		overrideAccess,
		// The public may not sort on what the import wrote.
		sort: overrideAccess ? 'strapiId' : 'slug',
	})
	return docs
}

const cityOf = async (strapiId: number) => (await profiles()).find(profil => profil.strapiId === strapiId)?.city

describe('Commune simple, avec code postal, et adresse postale : la bonne commune', () => {
	test('chaque ville devient sa commune, avec son code INSEE, son département et son centre à 1 km', async () => {
		const annecy = { name: 'Annecy', inseeCode: '74010', department: '74', latitude: 45.9, longitude: 6.13 }

		for (const id of [21, 22, 23, 30]) expect(await cityOf(id), String(id)).toEqual(annecy)
		const codes = Object.fromEntries(
			(await profiles()).map(({ strapiId, city }) => [strapiId, city?.inseeCode ?? null])
		)
		expect(codes).toEqual({
			21: '74010',
			22: '74010',
			23: '74010',
			24: '31555',
			25: '75056',
			26: null,
			27: null,
			28: null,
			30: '74010',
			31: null,
			32: '69123',
			33: '44109',
			34: '74012',
		})
		expect(await cityOf(25)).toMatchObject({ name: 'Paris', department: '75' })
	})

	test('l’adresse postale n’est jamais importée : aucune rue dans aucun champ, public ou non ; le profil est signalé', async () => {
		const all = JSON.stringify(await profiles())

		for (const piece of ['impasse', 'Pinceaux', '74000']) expect(all).not.toContain(piece)
		expect(first.collections.profiles?.cities?.addresses).toEqual([23])
		// The public reads the commune of a published profile, and no street.
		const publicValue = await profiles(false)
		expect(publicValue.find(({ slug }) => slug === 'zoe-lefevre')?.city).toMatchObject({
			name: 'Annecy',
			inseeCode: '74010',
		})
		expect(JSON.stringify(publicValue)).not.toContain('Pinceaux')
	})

	test('la part des villes renseignées rattachées à une commune est donnée en nombres (cible 90 %)', () => {
		expect(first.collections.profiles?.cities).toEqual({
			filledCities: 11,
			attached: 9,
			part: 81.8,
			nonEmptyProfiles: 12,
			nonEmptyProfilesWithCity: 9,
			toReview: [26, 28],
			addresses: [23],
			decided: [],
		})
		expect(first.gaps['ville-en-commune']).toBe(11)
		expect(first.parity?.profiles).toMatchObject({ expected: 13, equal: 13, different: [] })
	})
})

describe('Cas ambigu : zone vide, profil « à revoir » ; avec sa ligne de décision, la commune choisie', () => {
	test('sans décision : la zone reste vide, le profil part dans la liste de revue privée, avec ses communes possibles', async () => {
		expect([await cityOf(26), await cityOf(28)]).toEqual([
			{ name: null, inseeCode: null, department: null, latitude: null, longitude: null },
			{ name: null, inseeCode: null, department: null, latitude: null, longitude: null },
		])
		expect(review.map(({ profil, motif }) => [profil, motif])).toEqual([
			[26, 'pas-une-commune'],
			[28, 'homonymes'],
		])
		expect(review[1]?.candidats.map(({ code }) => code)).toEqual(['21555', '22307', '34271', '69215', '83113', '88421'])
		expect(JSON.stringify(review)).not.toContain('France')
	})

	test('avec sa ligne de décision : la commune choisie, ou aucune, et le profil n’est plus à revoir', async () => {
		const report = await importOnBench('real', { decisions: CITIES_DECISIONS })

		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 1 })
		expect(await cityOf(28)).toEqual({
			name: 'Saint-Julien',
			inseeCode: '69215',
			department: '69',
			latitude: 46.03,
			longitude: 4.65,
		})
		expect(report.collections.profiles?.cities).toMatchObject({
			attached: 10,
			part: 90.9,
			toReview: [],
			decided: [26, 28],
		})
		expect(report.pointlessDecisions).toBe(0)
	})

	test('second passage avec les mêmes décisions : 0 création, 0 mise à jour', async () => {
		const before = await profiles()

		const second = await importOnBench('real', { decisions: CITIES_DECISIONS })

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(await profiles()).toEqual(before)
	})
})

describe('Le référentiel simulé, et ses réponses gardées pour deux passages identiques', () => {
	/** The kept answers of the bench, sent back as the referential sends them. */
	function simulateWithBenchResponses(): string[] {
		const responses = benchReference().reponses
		const log: string[] = []
		simulate(
			http.get(`${REFERENCE_ADDRESS}/communes`, ({ request }) => {
				log.push(request.url)
				const parameters = new URL(request.url).searchParams
				const [gender, value] = parameters.has('nom')
					? ['nom', parameters.get('nom')]
					: ['codePostal', parameters.get('codePostal')]
				return HttpResponse.json(
					(responses.get(`${gender}:${value}`) ?? []).map(({ departement, latitude, longitude, ...city }) => ({
						...city,
						codeDepartement: departement,
						centre: { type: 'Point', coordinates: [longitude, latitude] },
					}))
				)
			})
		)
		return log
	}

	test('un premier passage demande chaque ville une fois ; le second ne demande rien et donne la même chose', async () => {
		const log = simulateWithBenchResponses()
		const guard = keptReference(new Map(), geoApiReference())

		const a = await importOnBench('dry-run', { decisions: CITIES_DECISIONS, reference: guard })
		const requests = log.length
		const two = await importOnBench('dry-run', { decisions: CITIES_DECISIONS, reference: guard })

		// annecy, 74000, toulouse, 75116, saint-julien, lyon, nantes, annemasse.
		expect(requests).toBe(8)
		expect(guard.nouvelles()).toBe(8)
		expect(log).toHaveLength(requests)
		expect(two.collections.profiles).toEqual(a.collections.profiles)
		expect(a.collections.profiles).toMatchObject({ created: 0, updated: 0 })
	})
})

describe('La commande', () => {
	let folder = ''

	beforeAll(() => {
		folder = mkdtempSync(path.join(tmpdir(), 'communes-import-'))
	})

	afterAll(() => rmSync(folder, { recursive: true, force: true }))

	test('--review écrit la liste de revue privée, lisible par son seul propriétaire, sans le texte saisi', async () => {
		const file = path.join(folder, 'revue.json')

		// A dry run, with the table of the bench, which settles no city.
		const { code, sortie: output } = await importCommand(['--decisions', BENCH_DECISION_FILE, '--review', file])

		expect(code, output).toBe(0)
		expect(output).toContain('communes : 9 sur 11 villes renseignées (81,8 %, cible 90 %)')
		expect(output).toContain('villes à revoir, zone vide (liste de revue privée, --review) : 26, 28')
		expect(output).toContain('adresses postales, dont seule la commune est reprise : 23')
		expect(statSync(file).mode & 0o777).toBe(0o600)
		const list = JSON.parse(readFileSync(file, 'utf8')) as CaseToReview[]
		expect(list.map(({ profil }) => profil)).toEqual([26, 28])
		expect(readFileSync(file, 'utf8')).not.toMatch(/France|Pinceaux/)
	}, 60_000)

	test('hors ligne, une réponse qui manque arrête la commande avant toute écriture', async () => {
		const before = await profiles()
		const fingerprint = (await sourceFingerprint()).empreinte
		const partial = path.join(folder, 'partiel.json')
		const responses = JSON.parse(readFileSync(BENCH_REFERENCE_FILE, 'utf8'))
		delete responses.reponses['nom:lyon']
		writeFileSync(partial, JSON.stringify(responses))

		const decisions = ['--decisions', BENCH_DECISION_FILE]
		const missing = await importCommand(['--real', ...decisions, '--cities', partial, '--offline'])
		const absent = await importCommand([
			'--real',
			...decisions,
			'--cities',
			path.join(folder, 'absent.json'),
			'--offline',
		])

		expect(missing.code, missing.sortie).toBe(1)
		expect(missing.sortie).toContain('Hors ligne (--offline), une réponse du référentiel des communes')
		expect(absent.code, absent.sortie).toBe(1)
		expect(absent.sortie).toContain('le fichier des réponses gardées du référentiel des communes n’existe pas')
		expect(await profiles()).toEqual(before)
		expect((await sourceFingerprint()).empreinte).toBe(fingerprint)
	}, 60_000)
})
