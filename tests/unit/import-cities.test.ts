import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readArguments } from '../../scripts/migration/import/arguments'
import {
	citySearch,
	comparableName,
	expectedCity,
	profileCities,
	resolveCity,
} from '../../scripts/migration/import/cities'
import { readDecisions } from '../../scripts/migration/import/decisions'
import {
	answersAsText,
	geoApiReference,
	keptReference,
	REFERENCE_ADDRESS,
	type ReferenceCity,
	readAnswers,
} from '../../scripts/migration/import/reference'
import { ImportRefuse } from '../../scripts/migration/import/target'
import { delay, HttpResponse, http, simulate } from '../support/outgoing-http'
import { sourceDefinition } from '../support/source-strapi/data'

/**
 * Ticket 063: the city typed in a profile becomes a commune of the official list, with its INSEE
 * code, never an address. The referential (geo.api.gouv.fr) is simulated: invented communes, with
 * well-formed INSEE codes. No database: the runs are in tests/integration/import-profils.test.ts.
 */

const ROOT = path.resolve(import.meta.dir, '../..')

/** An invented commune, as the referential sends it. */
interface SimulatedCity {
	nom: string
	code: string
	codeDepartement: string
	codesPostaux: string[]
	centre: { type: 'Point'; coordinates: [number, number] }
}

const cityAlt = (nom: string, code: string, codesPostaux: string[], [lon, lat]: [number, number]): SimulatedCity => ({
	nom,
	code,
	codeDepartement: code.slice(0, 2),
	codesPostaux,
	centre: { type: 'Point', coordinates: [lon, lat] },
})

const CITIES: SimulatedCity[] = [
	cityAlt('Bourg-Fictif', '74901', ['74900'], [6.11147, 45.98761]),
	cityAlt('Saint-Exemple', '01901', ['01990'], [5.2, 46.1]),
	cityAlt('Saint-Exemple', '26901', ['26990'], [5.0, 44.9]),
	cityAlt('Saint-Exemple-sur-Mer', '34901', ['34990'], [3.5, 43.4]),
	cityAlt('Val-Imaginaire', '31901', ['31990'], [1.4, 43.6]),
	cityAlt('Val-Imaginaire', '69901', ['69990'], [4.8, 45.7]),
	cityAlt('Cité-des-Tests', '75901', ['75901', '75902'], [2.35, 48.86]),
	cityAlt('Nouvelle-Fusion', '44901', ['44990'], [-1.5, 47.2]),
]

/** What the simulated referential received: the address of each request, its parameters included. */
type Log = string[]

/**
 * The referential, simulated: a name gives every commune whose name holds it (the real one ranks
 * near names too), a postal code the communes that hold it, an INSEE code its commune or a 404.
 */
function simulateReference(communes: SimulatedCity[] = CITIES): Log {
	const log: Log = []
	const fold = (texte: string) => comparableName(texte)
	simulate(
		http.get(`${REFERENCE_ADDRESS}/communes`, ({ request }) => {
			log.push(request.url)
			const parameters = new URL(request.url).searchParams
			const name = parameters.get('nom')
			const codePostal = parameters.get('codePostal')
			if (name) return HttpResponse.json(communes.filter(c => fold(c.nom).includes(fold(name))))
			return HttpResponse.json(communes.filter(c => codePostal !== null && c.codesPostaux.includes(codePostal)))
		}),
		http.get(`${REFERENCE_ADDRESS}/communes/:code`, ({ request, params }) => {
			log.push(request.url)
			const found = communes.find(({ code }) => code === params.code)
			return found ? HttpResponse.json(found) : HttpResponse.json({ code: 404 }, { status: 404 })
		})
	)
	return log
}

const codes = (communes: readonly Pick<ReferenceCity, 'code'>[]): string[] => communes.map(({ code }) => code)

describe('ce que l’import cherche dans une ville saisie : un nom, un code postal, jamais une rue', () => {
	test('vide : rien à chercher', () => {
		for (const cityValue of [null, '', '   ']) expect(citySearch(cityValue), String(cityValue)).toBeNull()
	})

	test('une commune simple, avec son code postal, avec son département', () => {
		expect(citySearch('Bourg-Fictif')).toEqual({
			nom: 'bourg-fictif',
			codePostal: null,
			departement: null,
			adresse: false,
		})
		expect(citySearch('74900 Bourg-Fictif')).toEqual({
			nom: 'bourg-fictif',
			codePostal: '74900',
			departement: '74',
			adresse: false,
		})
		expect(citySearch('bourg-fictif ')?.nom).toBe('bourg-fictif')
		expect(citySearch('Val-Imaginaire (31)')).toMatchObject({ nom: 'val-imaginaire', departement: '31' })
		expect(citySearch('75901')).toMatchObject({ nom: null, codePostal: '75901' })
	})

	test('une adresse postale : la commune et le code postal, jamais la rue', () => {
		const search = citySearch('3 impasse des Pinceaux, 74900 Bourg-Fictif')

		expect(search).toEqual({ nom: 'bourg-fictif', codePostal: '74900', departement: '74', adresse: true })
		expect(JSON.stringify(search)).not.toMatch(/impasse|pinceaux|\b3\b/i)
		// Without a postal code nor a commune after the street: nothing at all is asked.
		expect(citySearch('12 rue des Lilas')).toMatchObject({ nom: null, codePostal: null, adresse: true })
	})

	test('un numéro de département en tête est retiré : « 74 Bourg-Fictif » est une commune, pas une adresse (ticket 226)', () => {
		// The number is the département: the commune is looked for there only.
		expect(citySearch('74 Bourg-Fictif')).toEqual({
			nom: 'bourg-fictif',
			codePostal: null,
			departement: '74',
			adresse: false,
		})
		expect(citySearch('2a Bourg-Fictif')).toMatchObject({
			nom: 'bourg-fictif',
			departement: '2A',
			adresse: false,
		})
		expect(citySearch('974  Bourg-Fictif ')).toMatchObject({
			nom: 'bourg-fictif',
			departement: '974',
			adresse: false,
		})
		// The case of the name does not matter: « 74 annecy » is the same place as « 74 Annecy ».
		for (const cityValue of ['74 bourg-fictif', '74 BOURG-FICTIF', '74 Bourg-fictif'])
			expect(citySearch(cityValue), cityValue).toEqual({
				nom: 'bourg-fictif',
				codePostal: null,
				departement: '74',
				adresse: false,
			})
		expect(citySearch('2a bourg-fictif')).toMatchObject({ departement: '2A', adresse: false })
		expect(citySearch('13 marseille')).toMatchObject({ nom: 'marseille', departement: '13', adresse: false })
		// Not a département (no such code), or not one place after it: read as before.
		expect(citySearch('00 Bourg-Fictif')).toMatchObject({ adresse: true })
		expect(citySearch('74 et alentours')).toMatchObject({ nom: null })
		expect(citySearch('12 Les Marais, Bourg-Fictif')).toMatchObject({ nom: 'bourg-fictif', adresse: true })
		expect(citySearch('3 impasse des Pinceaux')).toMatchObject({ nom: null, adresse: true })
	})

	test('une ville précédée de son département n’est plus listée sous « adresses » (ticket 226)', async () => {
		simulateReference()
		const { communes: cities, bilan: summary } = await profileCities(
			[{ id: 1, city: '74 Bourg-Fictif', videALaSource: false }],
			geoApiReference()
		)

		expect(cities.get(1)?.inseeCode).toBe('74901')
		expect(summary.addresses).toEqual([])
	})

	test('le numéro de tête est un département, pas un numéro de rue : « 01 Bourg-Fictif » ne prend pas la commune du 74', async () => {
		simulateReference()
		const { communes: cities, bilan: summary } = await profileCities(
			[
				{ id: 1, city: '74 Bourg-Fictif', videALaSource: false },
				{ id: 2, city: '01 Bourg-Fictif', videALaSource: false },
			],
			geoApiReference()
		)

		expect(cities.get(1)?.inseeCode).toBe('74901')
		// Ain holds no such commune: « à revoir », never the commune of another département.
		expect(cities.get(2)).toBeNull()
		expect(summary.toReview).toEqual([2])
		expect(summary.addresses).toEqual([])
	})

	test('ce qui n’est pas une commune ne se cherche pas : un pays, une liste, une phrase, un numéro', () => {
		for (const cityValue of ['France', 'Toute la France', 'Paris, Lyon et Annecy', '74'])
			expect(citySearch(cityValue), cityValue).toMatchObject({ nom: null, codePostal: null })
	})

	test('« St » s’écrit « saint », un arrondissement donne sa ville', () => {
		expect(citySearch('St Exemple')?.nom).toBe('saint exemple')
		expect(citySearch('Ste-Foy')?.nom).toBe('sainte-foy')
		expect(citySearch('Paris 16e')?.nom).toBe('paris')
		expect(comparableName('Saint-Exemple')).toBe(comparableName('st exemple'))
		expect(comparableName('L’Œuf-d’Été')).toBe('l oeuf d ete')
	})
})

describe('la ville devient une commune du référentiel (simulé)', () => {
	test('commune simple, avec code postal, et adresse postale : la bonne commune, sans rue demandée', async () => {
		const log = simulateReference()
		const reference = geoApiReference()

		for (const cityValue of ['Bourg-Fictif', '74900 Bourg-Fictif', '3 impasse des Pinceaux, 74900 Bourg-Fictif']) {
			const resolution = await resolveCity(cityValue, reference)
			expect(resolution, cityValue).toMatchObject({ genre: 'commune', commune: { code: '74901', nom: 'Bourg-Fictif' } })
		}
		expect(await resolveCity('3 impasse des Pinceaux, 74900 Bourg-Fictif', reference)).toMatchObject({
			adresse: true,
		})
		for (const url of log) expect(decodeURIComponent(url)).not.toMatch(/impasse|pinceaux/i)
	})

	test('le département ou le code postal départagent deux communes de même nom', async () => {
		simulateReference()
		const reference = geoApiReference()

		expect(await resolveCity('Val-Imaginaire (31)', reference)).toMatchObject({ commune: { code: '31901' } })
		expect(await resolveCity('69990 Val-Imaginaire', reference)).toMatchObject({ commune: { code: '69901' } })
	})

	test('un code postal seul, ou avec le nom d’une commune qui n’existe plus, donne la commune qui le porte', async () => {
		simulateReference()
		const reference = geoApiReference()

		expect(await resolveCity('75901', reference)).toMatchObject({ commune: { code: '75901' } })
		expect(await resolveCity('Ancienne-Fusion 44990', reference)).toMatchObject({
			commune: { code: '44901', nom: 'Nouvelle-Fusion' },
		})
	})

	test('cas ambigu : homonymes, introuvable ou pas une commune, avec les communes possibles', async () => {
		const log = simulateReference()
		const reference = geoApiReference()

		const homonyms = await resolveCity('Saint-Exemple', reference)
		expect(homonyms).toMatchObject({ genre: 'a-revoir', motif: 'homonymes' })
		expect(homonyms.genre === 'a-revoir' && codes(homonyms.candidats)).toEqual(['01901', '26901'])
		expect(await resolveCity('Inconnue-sur-Rien', reference)).toMatchObject({
			genre: 'a-revoir',
			motif: 'introuvable',
		})
		const before = log.length
		expect(await resolveCity('France', reference)).toMatchObject({ genre: 'a-revoir', motif: 'pas-une-commune' })
		expect(log).toHaveLength(before)
	})

	test('la commune d’un profil : son nom, son code, son département, son centre à deux décimales', () => {
		const [bourg] = CITIES
		expect(
			expectedCity({
				nom: bourg?.nom ?? '',
				code: bourg?.code ?? '',
				departement: '74',
				codesPostaux: [],
				latitude: 45.98761,
				longitude: 6.11147,
			})
		).toEqual({ name: 'Bourg-Fictif', inseeCode: '74901', department: '74', latitude: 45.99, longitude: 6.11 })
	})
})

describe('les villes des profils, la liste de revue et la table de décision', () => {
	const profiles = [
		{ id: 1, city: 'Bourg-Fictif', videALaSource: false },
		{ id: 2, city: 'Saint-Exemple', videALaSource: false },
		{ id: 3, city: 'France', videALaSource: false },
		{ id: 4, city: 'Inconnue-sur-Rien', videALaSource: true },
		{ id: 5, city: '3 impasse des Pinceaux, 74900 Bourg-Fictif', videALaSource: false },
		{ id: 6, city: null, videALaSource: true },
		{ id: 7, city: '', videALaSource: false },
	]

	test('sans décision : zone vide et profil à revoir ; la part des villes rattachées en nombres', async () => {
		simulateReference()

		const {
			communes: cities,
			revue: review,
			bilan: summary,
			sansObjet: withoutObject,
		} = await profileCities(profiles, geoApiReference())

		expect([...cities.entries()].map(([id, c]) => [id, c?.inseeCode ?? null])).toEqual([
			[1, '74901'],
			[2, null],
			[3, null],
			[4, null],
			[5, '74901'],
			[6, null],
			[7, null],
		])
		expect(summary).toEqual({
			filledCities: 5,
			attached: 2,
			part: 40,
			nonEmptyProfiles: 5,
			nonEmptyProfilesWithCity: 2,
			toReview: [2, 3, 4],
			addresses: [5],
			decided: [],
		})
		expect(withoutObject).toBe(0)
		expect(review.map(({ profil, motif }) => [profil, motif])).toEqual([
			[2, 'homonymes'],
			[3, 'pas-une-commune'],
			[4, 'introuvable'],
		])
		expect(codes(review[0]?.candidats ?? [])).toEqual(['01901', '26901'])
		// The private list never holds the text typed, only what was asked.
		expect(JSON.stringify(review)).not.toMatch(/France|Inconnue-sur-Rien|Pinceaux/)
	})

	test('avec sa ligne de décision : la commune choisie, ou aucune ; une ligne sans cas est sans objet', async () => {
		const log = simulateReference()

		const {
			communes: cities,
			revue: review,
			bilan: summary,
			sansObjet: withoutObject,
		} = await profileCities(profiles, geoApiReference(), [
			{ profile: 2, inseeCode: '26901' },
			{ profile: 3, inseeCode: null },
			// Not among the candidates of 4: asked by its INSEE code.
			{ profile: 4, inseeCode: '74901' },
			// 1 is not « à revoir », 99 is no profile.
			{ profile: 1, inseeCode: '01901' },
			{ profile: 99, inseeCode: null },
		])

		expect(cities.get(2)).toEqual({
			name: 'Saint-Exemple',
			inseeCode: '26901',
			department: '26',
			latitude: 44.9,
			longitude: 5,
		})
		expect([cities.get(1)?.inseeCode, cities.get(3), cities.get(4)?.inseeCode]).toEqual(['74901', null, '74901'])
		expect(summary).toMatchObject({ attached: 4, part: 80, toReview: [], decided: [2, 3, 4] })
		expect(review).toEqual([])
		expect(withoutObject).toBe(2)
		expect(
			log.some(adresse =>
				adresse.endsWith('/communes/74901?fields=nom%2Ccode%2CcodesPostaux%2CcodeDepartement%2Ccentre')
			)
		).toBe(true)
	})

	test('une ligne qui donne une commune que le référentiel ne connaît pas arrête l’import avant toute écriture', async () => {
		simulateReference()

		const failure = profileCities(profiles, geoApiReference(), [{ profile: 2, inseeCode: '74999' }])

		await expect(failure).rejects.toBeInstanceOf(ImportRefuse)
		await expect(failure).rejects.toThrow('profil 2 une commune que le référentiel ne connaît pas (code INSEE 74999)')
	})
})

describe('les réponses du référentiel sont gardées : deux passages identiques', () => {
	test('le second passage ne demande rien, même si le référentiel a changé entre-temps', async () => {
		const log = simulateReference()
		const profiles = [
			{ id: 1, city: 'Bourg-Fictif', videALaSource: false },
			{ id: 2, city: '74900 Bourg-Fictif', videALaSource: false },
			{ id: 3, city: 'Saint-Exemple', videALaSource: false },
		]
		const first = keptReference(new Map(), geoApiReference())
		const before = await profileCities(profiles, first)
		expect(first.nouvelles()).toBe(log.length)
		expect(log).toHaveLength(3)

		// The referential changes: Bourg-Fictif is gone. The kept answers, read back from their file, still say it.
		const newLog = simulateReference(CITIES.slice(1))
		const text = answersAsText(first.reponses)
		const second = keptReference(readAnswers(text), geoApiReference())
		const after = await profileCities(profiles, second)

		expect(after).toEqual(before)
		expect(newLog).toHaveLength(0)
		expect(second.nouvelles()).toBe(0)
		expect(answersAsText(second.reponses)).toBe(text)
	})

	test('le fichier range ses questions dans l’ordre, et refuse ce qui n’est pas une réponse gardée', () => {
		const text = answersAsText(
			new Map([
				['nom:bourg-fictif', []],
				['codePostal:74900', []],
			])
		)
		expect(Object.keys(JSON.parse(text).reponses)).toEqual(['codePostal:74900', 'nom:bourg-fictif'])
		expect([...readAnswers(text).keys()]).toEqual(['codePostal:74900', 'nom:bourg-fictif'])
		for (const fake of [
			'pas du json',
			'{}',
			'{"version":1,"source":"https://geo.api.gouv.fr","reponses":{"rue:x":[]}}',
		])
			expect(() => readAnswers(fake), fake).toThrow(ImportRefuse)
	})

	test('hors ligne, une réponse qui n’est pas gardée arrête l’import ; rien n’est demandé', async () => {
		const log = simulateReference()
		const offline = keptReference(new Map(), null)

		await expect(resolveCity('Bourg-Fictif', offline)).rejects.toThrow(
			'Hors ligne (--offline), une réponse du référentiel des communes n’est pas dans le fichier des réponses gardées'
		)
		expect(log).toHaveLength(0)
	})

	test('les réponses du banc couvrent chaque ville de la fausse base Strapi, hors ligne', async () => {
		const { lignes: lines } = sourceDefinition('http://127.0.0.1:9090/mymakeup-test')
		const responses = readAnswers(readFileSync(path.join(ROOT, 'tests/fixtures/import/bench-reference.json'), 'utf8'))
		const profiles = lines.makeup_artistes.map(({ id, city }) => ({
			id: Number(id),
			city: typeof city === 'string' ? city : null,
			videALaSource: false,
		}))

		const { communes: cities, bilan: summary } = await profileCities(profiles, keptReference(responses, null))

		const byCode = Object.fromEntries([...cities.entries()].map(([id, c]) => [id, c?.inseeCode ?? null]))
		expect(byCode).toMatchObject({
			21: '74010',
			22: '74010',
			23: '74010',
			24: '31555',
			25: '75056',
			26: null,
			28: null,
			30: '74010',
			32: '69123',
			33: '44109',
			34: '74012',
		})
		expect(summary).toMatchObject({ toReview: [26, 28], addresses: [23] })
	})
})

describe('le référentiel qui ne répond pas arrête l’import avant toute écriture', () => {
	const url = `${REFERENCE_ADDRESS}/communes`

	test('une panne, un réseau coupé, une réponse qui n’est pas une liste de communes, un service muet', async () => {
		simulate(http.get(url, () => new HttpResponse(null, { status: 500 })))
		await expect(geoApiReference().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow('réponse 500')

		simulate(http.get(url, () => HttpResponse.error()))
		await expect(geoApiReference().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow('réseau injoignable')

		simulate(http.get(url, () => HttpResponse.json({ message: 'pas une liste' })))
		await expect(geoApiReference().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow(
			'sa réponse n’est pas une liste de communes'
		)

		simulate(
			http.get(url, async () => {
				await delay('infinite')
				return HttpResponse.json([])
			})
		)
		await expect(geoApiReference({ delaiMs: 50 }).repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow(
			'pas de réponse en 0.05 s'
		)
	})

	test('une commune inconnue par son code INSEE est une réponse vide', async () => {
		simulateReference()
		expect(await geoApiReference().repondre({ genre: 'code', valeur: '74999' })).toEqual([])
	})
})

describe('la table de décision et la ligne de commande', () => {
	test('une ligne par profil à revoir : un code INSEE bien formé, ou aucun', () => {
		expect(
			readDecisions('{ "cities": [{ "profile": 28, "inseeCode": "2A004" }, { "profile": 26, "inseeCode": null }] }')
		).toEqual({
			sharedEmails: [],
			excludedProfiles: [],
			cities: [
				{ profile: 28, inseeCode: '2A004' },
				{ profile: 26, inseeCode: null },
			],
		})
		for (const fake of [
			'{ "cities": [{ "profile": 28, "inseeCode": "74" }] }',
			'{ "cities": [{ "profile": 28, "inseeCode": "Annecy" }] }',
			'{ "cities": [{ "profile": 28, "inseeCode": "74010" }, { "profile": 28, "inseeCode": null }] }',
			'{ "communes": [{ "profil": 28 }] }',
			'{ "cities": [{ "profile": 28, "inseeCode": null, "ville": "x" }] }',
		])
			expect(() => readDecisions(fake), fake).toThrow(ImportRefuse)
	})

	test('--cities, --offline et --review', () => {
		expect(readArguments(['--cities', 'c.json', '--offline', '--review', 'v.json'])).toEqual({
			mode: 'dry-run',
			remoteTarget: false,
			cities: 'c.json',
			offline: true,
			review: 'v.json',
		})
		for (const line of [['--cities'], ['--review', '--real'], ['--offline', '--offline']])
			expect(readArguments(line), line.join(' ')).toBeNull()
	})
})
