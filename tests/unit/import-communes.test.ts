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
import { delay, HttpResponse, http, simuler } from '../outils/http-sortant'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 063: the city typed in a profile becomes a commune of the official list, with its INSEE
 * code, never an address. The referential (geo.api.gouv.fr) is simulated: invented communes, with
 * well-formed INSEE codes. No database: the runs are in tests/integration/import-profils.test.ts.
 */

const RACINE = path.resolve(import.meta.dir, '../..')

/** An invented commune, as the referential sends it. */
interface CommuneSimulee {
	nom: string
	code: string
	codeDepartement: string
	codesPostaux: string[]
	centre: { type: 'Point'; coordinates: [number, number] }
}

const commune = (nom: string, code: string, codesPostaux: string[], [lon, lat]: [number, number]): CommuneSimulee => ({
	nom,
	code,
	codeDepartement: code.slice(0, 2),
	codesPostaux,
	centre: { type: 'Point', coordinates: [lon, lat] },
})

const COMMUNES: CommuneSimulee[] = [
	commune('Bourg-Fictif', '74901', ['74900'], [6.11147, 45.98761]),
	commune('Saint-Exemple', '01901', ['01990'], [5.2, 46.1]),
	commune('Saint-Exemple', '26901', ['26990'], [5.0, 44.9]),
	commune('Saint-Exemple-sur-Mer', '34901', ['34990'], [3.5, 43.4]),
	commune('Val-Imaginaire', '31901', ['31990'], [1.4, 43.6]),
	commune('Val-Imaginaire', '69901', ['69990'], [4.8, 45.7]),
	commune('Cité-des-Tests', '75901', ['75901', '75902'], [2.35, 48.86]),
	commune('Nouvelle-Fusion', '44901', ['44990'], [-1.5, 47.2]),
]

/** What the simulated referential received: the address of each request, its parameters included. */
type Journal = string[]

/**
 * The referential, simulated: a name gives every commune whose name holds it (the real one ranks
 * near names too), a postal code the communes that hold it, an INSEE code its commune or a 404.
 */
function simulerLeReferentiel(communes: CommuneSimulee[] = COMMUNES): Journal {
	const journal: Journal = []
	const plier = (texte: string) => comparableName(texte)
	simuler(
		http.get(`${REFERENCE_ADDRESS}/communes`, ({ request }) => {
			journal.push(request.url)
			const parametres = new URL(request.url).searchParams
			const nom = parametres.get('nom')
			const codePostal = parametres.get('codePostal')
			if (nom) return HttpResponse.json(communes.filter(c => plier(c.nom).includes(plier(nom))))
			return HttpResponse.json(communes.filter(c => codePostal !== null && c.codesPostaux.includes(codePostal)))
		}),
		http.get(`${REFERENCE_ADDRESS}/communes/:code`, ({ request, params }) => {
			journal.push(request.url)
			const trouvee = communes.find(({ code }) => code === params.code)
			return trouvee ? HttpResponse.json(trouvee) : HttpResponse.json({ code: 404 }, { status: 404 })
		})
	)
	return journal
}

const codes = (communes: readonly Pick<ReferenceCity, 'code'>[]): string[] => communes.map(({ code }) => code)

describe('ce que l’import cherche dans une ville saisie : un nom, un code postal, jamais une rue', () => {
	test('vide : rien à chercher', () => {
		for (const ville of [null, '', '   ']) expect(citySearch(ville), String(ville)).toBeNull()
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
		const recherche = citySearch('3 impasse des Pinceaux, 74900 Bourg-Fictif')

		expect(recherche).toEqual({ nom: 'bourg-fictif', codePostal: '74900', departement: '74', adresse: true })
		expect(JSON.stringify(recherche)).not.toMatch(/impasse|pinceaux|\b3\b/i)
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
		for (const ville of ['74 bourg-fictif', '74 BOURG-FICTIF', '74 Bourg-fictif'])
			expect(citySearch(ville), ville).toEqual({
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
		simulerLeReferentiel()
		const { communes, bilan } = await profileCities(
			[{ id: 1, city: '74 Bourg-Fictif', videALaSource: false }],
			geoApiReference()
		)

		expect(communes.get(1)?.inseeCode).toBe('74901')
		expect(bilan.addresses).toEqual([])
	})

	test('le numéro de tête est un département, pas un numéro de rue : « 01 Bourg-Fictif » ne prend pas la commune du 74', async () => {
		simulerLeReferentiel()
		const { communes, bilan } = await profileCities(
			[
				{ id: 1, city: '74 Bourg-Fictif', videALaSource: false },
				{ id: 2, city: '01 Bourg-Fictif', videALaSource: false },
			],
			geoApiReference()
		)

		expect(communes.get(1)?.inseeCode).toBe('74901')
		// Ain holds no such commune: « à revoir », never the commune of another département.
		expect(communes.get(2)).toBeNull()
		expect(bilan.toReview).toEqual([2])
		expect(bilan.addresses).toEqual([])
	})

	test('ce qui n’est pas une commune ne se cherche pas : un pays, une liste, une phrase, un numéro', () => {
		for (const ville of ['France', 'Toute la France', 'Paris, Lyon et Annecy', '74'])
			expect(citySearch(ville), ville).toMatchObject({ nom: null, codePostal: null })
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
		const journal = simulerLeReferentiel()
		const referentiel = geoApiReference()

		for (const ville of ['Bourg-Fictif', '74900 Bourg-Fictif', '3 impasse des Pinceaux, 74900 Bourg-Fictif']) {
			const resolution = await resolveCity(ville, referentiel)
			expect(resolution, ville).toMatchObject({ genre: 'commune', commune: { code: '74901', nom: 'Bourg-Fictif' } })
		}
		expect(await resolveCity('3 impasse des Pinceaux, 74900 Bourg-Fictif', referentiel)).toMatchObject({
			adresse: true,
		})
		for (const adresse of journal) expect(decodeURIComponent(adresse)).not.toMatch(/impasse|pinceaux/i)
	})

	test('le département ou le code postal départagent deux communes de même nom', async () => {
		simulerLeReferentiel()
		const referentiel = geoApiReference()

		expect(await resolveCity('Val-Imaginaire (31)', referentiel)).toMatchObject({ commune: { code: '31901' } })
		expect(await resolveCity('69990 Val-Imaginaire', referentiel)).toMatchObject({ commune: { code: '69901' } })
	})

	test('un code postal seul, ou avec le nom d’une commune qui n’existe plus, donne la commune qui le porte', async () => {
		simulerLeReferentiel()
		const referentiel = geoApiReference()

		expect(await resolveCity('75901', referentiel)).toMatchObject({ commune: { code: '75901' } })
		expect(await resolveCity('Ancienne-Fusion 44990', referentiel)).toMatchObject({
			commune: { code: '44901', nom: 'Nouvelle-Fusion' },
		})
	})

	test('cas ambigu : homonymes, introuvable ou pas une commune, avec les communes possibles', async () => {
		const journal = simulerLeReferentiel()
		const referentiel = geoApiReference()

		const homonymes = await resolveCity('Saint-Exemple', referentiel)
		expect(homonymes).toMatchObject({ genre: 'a-revoir', motif: 'homonymes' })
		expect(homonymes.genre === 'a-revoir' && codes(homonymes.candidats)).toEqual(['01901', '26901'])
		expect(await resolveCity('Inconnue-sur-Rien', referentiel)).toMatchObject({
			genre: 'a-revoir',
			motif: 'introuvable',
		})
		const avant = journal.length
		expect(await resolveCity('France', referentiel)).toMatchObject({ genre: 'a-revoir', motif: 'pas-une-commune' })
		expect(journal).toHaveLength(avant)
	})

	test('la commune d’un profil : son nom, son code, son département, son centre à deux décimales', () => {
		const [bourg] = COMMUNES
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
	const profils = [
		{ id: 1, city: 'Bourg-Fictif', videALaSource: false },
		{ id: 2, city: 'Saint-Exemple', videALaSource: false },
		{ id: 3, city: 'France', videALaSource: false },
		{ id: 4, city: 'Inconnue-sur-Rien', videALaSource: true },
		{ id: 5, city: '3 impasse des Pinceaux, 74900 Bourg-Fictif', videALaSource: false },
		{ id: 6, city: null, videALaSource: true },
		{ id: 7, city: '', videALaSource: false },
	]

	test('sans décision : zone vide et profil à revoir ; la part des villes rattachées en nombres', async () => {
		simulerLeReferentiel()

		const { communes, revue, bilan, sansObjet } = await profileCities(profils, geoApiReference())

		expect([...communes.entries()].map(([id, c]) => [id, c?.inseeCode ?? null])).toEqual([
			[1, '74901'],
			[2, null],
			[3, null],
			[4, null],
			[5, '74901'],
			[6, null],
			[7, null],
		])
		expect(bilan).toEqual({
			filledCities: 5,
			attached: 2,
			part: 40,
			nonEmptyProfiles: 5,
			nonEmptyProfilesWithCity: 2,
			toReview: [2, 3, 4],
			addresses: [5],
			decided: [],
		})
		expect(sansObjet).toBe(0)
		expect(revue.map(({ profil, motif }) => [profil, motif])).toEqual([
			[2, 'homonymes'],
			[3, 'pas-une-commune'],
			[4, 'introuvable'],
		])
		expect(codes(revue[0]?.candidats ?? [])).toEqual(['01901', '26901'])
		// The private list never holds the text typed, only what was asked.
		expect(JSON.stringify(revue)).not.toMatch(/France|Inconnue-sur-Rien|Pinceaux/)
	})

	test('avec sa ligne de décision : la commune choisie, ou aucune ; une ligne sans cas est sans objet', async () => {
		const journal = simulerLeReferentiel()

		const { communes, revue, bilan, sansObjet } = await profileCities(profils, geoApiReference(), [
			{ profile: 2, inseeCode: '26901' },
			{ profile: 3, inseeCode: null },
			// Not among the candidates of 4: asked by its INSEE code.
			{ profile: 4, inseeCode: '74901' },
			// 1 is not « à revoir », 99 is no profile.
			{ profile: 1, inseeCode: '01901' },
			{ profile: 99, inseeCode: null },
		])

		expect(communes.get(2)).toEqual({
			name: 'Saint-Exemple',
			inseeCode: '26901',
			department: '26',
			latitude: 44.9,
			longitude: 5,
		})
		expect([communes.get(1)?.inseeCode, communes.get(3), communes.get(4)?.inseeCode]).toEqual(['74901', null, '74901'])
		expect(bilan).toMatchObject({ attached: 4, part: 80, toReview: [], decided: [2, 3, 4] })
		expect(revue).toEqual([])
		expect(sansObjet).toBe(2)
		expect(
			journal.some(adresse =>
				adresse.endsWith('/communes/74901?fields=nom%2Ccode%2CcodesPostaux%2CcodeDepartement%2Ccentre')
			)
		).toBe(true)
	})

	test('une ligne qui donne une commune que le référentiel ne connaît pas arrête l’import avant toute écriture', async () => {
		simulerLeReferentiel()

		const echec = profileCities(profils, geoApiReference(), [{ profile: 2, inseeCode: '74999' }])

		await expect(echec).rejects.toBeInstanceOf(ImportRefuse)
		await expect(echec).rejects.toThrow('profil 2 une commune que le référentiel ne connaît pas (code INSEE 74999)')
	})
})

describe('les réponses du référentiel sont gardées : deux passages identiques', () => {
	test('le second passage ne demande rien, même si le référentiel a changé entre-temps', async () => {
		const journal = simulerLeReferentiel()
		const profils = [
			{ id: 1, city: 'Bourg-Fictif', videALaSource: false },
			{ id: 2, city: '74900 Bourg-Fictif', videALaSource: false },
			{ id: 3, city: 'Saint-Exemple', videALaSource: false },
		]
		const premier = keptReference(new Map(), geoApiReference())
		const avant = await profileCities(profils, premier)
		expect(premier.nouvelles()).toBe(journal.length)
		expect(journal).toHaveLength(3)

		// The referential changes: Bourg-Fictif is gone. The kept answers, read back from their file, still say it.
		const nouveauJournal = simulerLeReferentiel(COMMUNES.slice(1))
		const texte = answersAsText(premier.reponses)
		const second = keptReference(readAnswers(texte), geoApiReference())
		const apres = await profileCities(profils, second)

		expect(apres).toEqual(avant)
		expect(nouveauJournal).toHaveLength(0)
		expect(second.nouvelles()).toBe(0)
		expect(answersAsText(second.reponses)).toBe(texte)
	})

	test('le fichier range ses questions dans l’ordre, et refuse ce qui n’est pas une réponse gardée', () => {
		const texte = answersAsText(
			new Map([
				['nom:bourg-fictif', []],
				['codePostal:74900', []],
			])
		)
		expect(Object.keys(JSON.parse(texte).reponses)).toEqual(['codePostal:74900', 'nom:bourg-fictif'])
		expect([...readAnswers(texte).keys()]).toEqual(['codePostal:74900', 'nom:bourg-fictif'])
		for (const faux of [
			'pas du json',
			'{}',
			'{"version":1,"source":"https://geo.api.gouv.fr","reponses":{"rue:x":[]}}',
		])
			expect(() => readAnswers(faux), faux).toThrow(ImportRefuse)
	})

	test('hors ligne, une réponse qui n’est pas gardée arrête l’import ; rien n’est demandé', async () => {
		const journal = simulerLeReferentiel()
		const horsLigne = keptReference(new Map(), null)

		await expect(resolveCity('Bourg-Fictif', horsLigne)).rejects.toThrow(
			'Hors ligne (--offline), une réponse du référentiel des communes n’est pas dans le fichier des réponses gardées'
		)
		expect(journal).toHaveLength(0)
	})

	test('les réponses du banc couvrent chaque ville de la fausse base Strapi, hors ligne', async () => {
		const { lignes } = definitionDeLaSource('http://127.0.0.1:9090/mymakeup-test')
		const reponses = readAnswers(
			readFileSync(path.join(RACINE, 'tests/fixtures/import/referentiel-du-banc.json'), 'utf8')
		)
		const profils = lignes.makeup_artistes.map(({ id, city }) => ({
			id: Number(id),
			city: typeof city === 'string' ? city : null,
			videALaSource: false,
		}))

		const { communes, bilan } = await profileCities(profils, keptReference(reponses, null))

		const parCode = Object.fromEntries([...communes.entries()].map(([id, c]) => [id, c?.inseeCode ?? null]))
		expect(parCode).toMatchObject({
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
		expect(bilan).toMatchObject({ toReview: [26, 28], addresses: [23] })
	})
})

describe('le référentiel qui ne répond pas arrête l’import avant toute écriture', () => {
	const adresse = `${REFERENCE_ADDRESS}/communes`

	test('une panne, un réseau coupé, une réponse qui n’est pas une liste de communes, un service muet', async () => {
		simuler(http.get(adresse, () => new HttpResponse(null, { status: 500 })))
		await expect(geoApiReference().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow('réponse 500')

		simuler(http.get(adresse, () => HttpResponse.error()))
		await expect(geoApiReference().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow('réseau injoignable')

		simuler(http.get(adresse, () => HttpResponse.json({ message: 'pas une liste' })))
		await expect(geoApiReference().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow(
			'sa réponse n’est pas une liste de communes'
		)

		simuler(
			http.get(adresse, async () => {
				await delay('infinite')
				return HttpResponse.json([])
			})
		)
		await expect(geoApiReference({ delaiMs: 50 }).repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow(
			'pas de réponse en 0.05 s'
		)
	})

	test('une commune inconnue par son code INSEE est une réponse vide', async () => {
		simulerLeReferentiel()
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
		for (const faux of [
			'{ "cities": [{ "profile": 28, "inseeCode": "74" }] }',
			'{ "cities": [{ "profile": 28, "inseeCode": "Annecy" }] }',
			'{ "cities": [{ "profile": 28, "inseeCode": "74010" }, { "profile": 28, "inseeCode": null }] }',
			'{ "communes": [{ "profil": 28 }] }',
			'{ "cities": [{ "profile": 28, "inseeCode": null, "ville": "x" }] }',
		])
			expect(() => readDecisions(faux), faux).toThrow(ImportRefuse)
	})

	test('--cities, --offline et --review', () => {
		expect(readArguments(['--cities', 'c.json', '--offline', '--review', 'v.json'])).toEqual({
			mode: 'dry-run',
			remoteTarget: false,
			cities: 'c.json',
			offline: true,
			review: 'v.json',
		})
		for (const ligne of [['--cities'], ['--review', '--real'], ['--offline', '--offline']])
			expect(readArguments(ligne), ligne.join(' ')).toBeNull()
	})
})
