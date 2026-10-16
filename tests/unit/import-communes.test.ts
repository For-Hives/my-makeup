import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { lireLesArguments } from '../../scripts/migration/import/arguments'
import { ImportRefuse } from '../../scripts/migration/import/cible'
import {
	communeAttendue,
	communesDesProfils,
	nomCompare,
	rechercheDeLaVille,
	resoudreLaVille,
} from '../../scripts/migration/import/communes'
import { lireLesDecisions } from '../../scripts/migration/import/decisions'
import {
	ADRESSE_DU_REFERENTIEL,
	type CommuneDuReferentiel,
	lireLesReponses,
	referentielGarde,
	referentielGeoApi,
	reponsesEnTexte,
} from '../../scripts/migration/import/referentiel'
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
	const plier = (texte: string) => nomCompare(texte)
	simuler(
		http.get(`${ADRESSE_DU_REFERENTIEL}/communes`, ({ request }) => {
			journal.push(request.url)
			const parametres = new URL(request.url).searchParams
			const nom = parametres.get('nom')
			const codePostal = parametres.get('codePostal')
			if (nom) return HttpResponse.json(communes.filter(c => plier(c.nom).includes(plier(nom))))
			return HttpResponse.json(communes.filter(c => codePostal !== null && c.codesPostaux.includes(codePostal)))
		}),
		http.get(`${ADRESSE_DU_REFERENTIEL}/communes/:code`, ({ request, params }) => {
			journal.push(request.url)
			const trouvee = communes.find(({ code }) => code === params.code)
			return trouvee ? HttpResponse.json(trouvee) : HttpResponse.json({ code: 404 }, { status: 404 })
		})
	)
	return journal
}

const codes = (communes: readonly Pick<CommuneDuReferentiel, 'code'>[]): string[] => communes.map(({ code }) => code)

describe('ce que l’import cherche dans une ville saisie : un nom, un code postal, jamais une rue', () => {
	test('vide : rien à chercher', () => {
		for (const ville of [null, '', '   ']) expect(rechercheDeLaVille(ville), String(ville)).toBeNull()
	})

	test('une commune simple, avec son code postal, avec son département', () => {
		expect(rechercheDeLaVille('Bourg-Fictif')).toEqual({
			nom: 'bourg-fictif',
			codePostal: null,
			departement: null,
			adresse: false,
		})
		expect(rechercheDeLaVille('74900 Bourg-Fictif')).toEqual({
			nom: 'bourg-fictif',
			codePostal: '74900',
			departement: '74',
			adresse: false,
		})
		expect(rechercheDeLaVille('bourg-fictif ')?.nom).toBe('bourg-fictif')
		expect(rechercheDeLaVille('Val-Imaginaire (31)')).toMatchObject({ nom: 'val-imaginaire', departement: '31' })
		expect(rechercheDeLaVille('75901')).toMatchObject({ nom: null, codePostal: '75901' })
	})

	test('une adresse postale : la commune et le code postal, jamais la rue', () => {
		const recherche = rechercheDeLaVille('3 impasse des Pinceaux, 74900 Bourg-Fictif')

		expect(recherche).toEqual({ nom: 'bourg-fictif', codePostal: '74900', departement: '74', adresse: true })
		expect(JSON.stringify(recherche)).not.toMatch(/impasse|pinceaux|\b3\b/i)
		// Without a postal code nor a commune after the street: nothing at all is asked.
		expect(rechercheDeLaVille('12 rue des Lilas')).toMatchObject({ nom: null, codePostal: null, adresse: true })
	})

	test('un numéro de département en tête est retiré : « 74 Bourg-Fictif » est une commune, pas une adresse (ticket 226)', () => {
		expect(rechercheDeLaVille('74 Bourg-Fictif')).toEqual({
			nom: 'bourg-fictif',
			codePostal: null,
			departement: null,
			adresse: false,
		})
		expect(rechercheDeLaVille('2A Bourg-Fictif')).toMatchObject({ nom: 'bourg-fictif', adresse: false })
		expect(rechercheDeLaVille('974  Bourg-Fictif ')).toMatchObject({ nom: 'bourg-fictif', adresse: false })
		// Not a département (no such code), or not one place after it: read as before.
		expect(rechercheDeLaVille('00 Bourg-Fictif')).toMatchObject({ adresse: true })
		expect(rechercheDeLaVille('74 et alentours')).toMatchObject({ nom: null })
		expect(rechercheDeLaVille('12 Les Marais, Bourg-Fictif')).toMatchObject({ nom: 'bourg-fictif', adresse: true })
		expect(rechercheDeLaVille('3 impasse des Pinceaux')).toMatchObject({ nom: null, adresse: true })
	})

	test('une ville précédée de son département n’est plus listée sous « adresses » (ticket 226)', async () => {
		simulerLeReferentiel()
		const { communes, bilan } = await communesDesProfils(
			[{ id: 1, city: '74 Bourg-Fictif', videALaSource: false }],
			referentielGeoApi()
		)

		expect(communes.get(1)?.codeInsee).toBe('74901')
		expect(bilan.adresses).toEqual([])
	})

	test('ce qui n’est pas une commune ne se cherche pas : un pays, une liste, une phrase, un numéro', () => {
		for (const ville of ['France', 'Toute la France', 'Paris, Lyon et Annecy', '74'])
			expect(rechercheDeLaVille(ville), ville).toMatchObject({ nom: null, codePostal: null })
	})

	test('« St » s’écrit « saint », un arrondissement donne sa ville', () => {
		expect(rechercheDeLaVille('St Exemple')?.nom).toBe('saint exemple')
		expect(rechercheDeLaVille('Ste-Foy')?.nom).toBe('sainte-foy')
		expect(rechercheDeLaVille('Paris 16e')?.nom).toBe('paris')
		expect(nomCompare('Saint-Exemple')).toBe(nomCompare('st exemple'))
		expect(nomCompare('L’Œuf-d’Été')).toBe('l oeuf d ete')
	})
})

describe('la ville devient une commune du référentiel (simulé)', () => {
	test('commune simple, avec code postal, et adresse postale : la bonne commune, sans rue demandée', async () => {
		const journal = simulerLeReferentiel()
		const referentiel = referentielGeoApi()

		for (const ville of ['Bourg-Fictif', '74900 Bourg-Fictif', '3 impasse des Pinceaux, 74900 Bourg-Fictif']) {
			const resolution = await resoudreLaVille(ville, referentiel)
			expect(resolution, ville).toMatchObject({ genre: 'commune', commune: { code: '74901', nom: 'Bourg-Fictif' } })
		}
		expect(await resoudreLaVille('3 impasse des Pinceaux, 74900 Bourg-Fictif', referentiel)).toMatchObject({
			adresse: true,
		})
		for (const adresse of journal) expect(decodeURIComponent(adresse)).not.toMatch(/impasse|pinceaux/i)
	})

	test('le département ou le code postal départagent deux communes de même nom', async () => {
		simulerLeReferentiel()
		const referentiel = referentielGeoApi()

		expect(await resoudreLaVille('Val-Imaginaire (31)', referentiel)).toMatchObject({ commune: { code: '31901' } })
		expect(await resoudreLaVille('69990 Val-Imaginaire', referentiel)).toMatchObject({ commune: { code: '69901' } })
	})

	test('un code postal seul, ou avec le nom d’une commune qui n’existe plus, donne la commune qui le porte', async () => {
		simulerLeReferentiel()
		const referentiel = referentielGeoApi()

		expect(await resoudreLaVille('75901', referentiel)).toMatchObject({ commune: { code: '75901' } })
		expect(await resoudreLaVille('Ancienne-Fusion 44990', referentiel)).toMatchObject({
			commune: { code: '44901', nom: 'Nouvelle-Fusion' },
		})
	})

	test('cas ambigu : homonymes, introuvable ou pas une commune, avec les communes possibles', async () => {
		const journal = simulerLeReferentiel()
		const referentiel = referentielGeoApi()

		const homonymes = await resoudreLaVille('Saint-Exemple', referentiel)
		expect(homonymes).toMatchObject({ genre: 'a-revoir', motif: 'homonymes' })
		expect(homonymes.genre === 'a-revoir' && codes(homonymes.candidats)).toEqual(['01901', '26901'])
		expect(await resoudreLaVille('Inconnue-sur-Rien', referentiel)).toMatchObject({
			genre: 'a-revoir',
			motif: 'introuvable',
		})
		const avant = journal.length
		expect(await resoudreLaVille('France', referentiel)).toMatchObject({ genre: 'a-revoir', motif: 'pas-une-commune' })
		expect(journal).toHaveLength(avant)
	})

	test('la commune d’un profil : son nom, son code, son département, son centre à deux décimales', () => {
		const [bourg] = COMMUNES
		expect(
			communeAttendue({
				nom: bourg?.nom ?? '',
				code: bourg?.code ?? '',
				departement: '74',
				codesPostaux: [],
				latitude: 45.98761,
				longitude: 6.11147,
			})
		).toEqual({ nom: 'Bourg-Fictif', codeInsee: '74901', departement: '74', latitude: 45.99, longitude: 6.11 })
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

		const { communes, revue, bilan, sansObjet } = await communesDesProfils(profils, referentielGeoApi())

		expect([...communes.entries()].map(([id, c]) => [id, c?.codeInsee ?? null])).toEqual([
			[1, '74901'],
			[2, null],
			[3, null],
			[4, null],
			[5, '74901'],
			[6, null],
			[7, null],
		])
		expect(bilan).toEqual({
			villesRenseignees: 5,
			rattachees: 2,
			part: 40,
			profilsNonVides: 5,
			profilsNonVidesAvecCommune: 2,
			aRevoir: [2, 3, 4],
			adresses: [5],
			decidees: [],
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

		const { communes, revue, bilan, sansObjet } = await communesDesProfils(profils, referentielGeoApi(), [
			{ profil: 2, codeInsee: '26901' },
			{ profil: 3, codeInsee: null },
			// Not among the candidates of 4: asked by its INSEE code.
			{ profil: 4, codeInsee: '74901' },
			// 1 is not « à revoir », 99 is no profile.
			{ profil: 1, codeInsee: '01901' },
			{ profil: 99, codeInsee: null },
		])

		expect(communes.get(2)).toEqual({
			nom: 'Saint-Exemple',
			codeInsee: '26901',
			departement: '26',
			latitude: 44.9,
			longitude: 5,
		})
		expect([communes.get(1)?.codeInsee, communes.get(3), communes.get(4)?.codeInsee]).toEqual(['74901', null, '74901'])
		expect(bilan).toMatchObject({ rattachees: 4, part: 80, aRevoir: [], decidees: [2, 3, 4] })
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

		const echec = communesDesProfils(profils, referentielGeoApi(), [{ profil: 2, codeInsee: '74999' }])

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
		const premier = referentielGarde(new Map(), referentielGeoApi())
		const avant = await communesDesProfils(profils, premier)
		expect(premier.nouvelles()).toBe(journal.length)
		expect(journal).toHaveLength(3)

		// The referential changes: Bourg-Fictif is gone. The kept answers, read back from their file, still say it.
		const nouveauJournal = simulerLeReferentiel(COMMUNES.slice(1))
		const texte = reponsesEnTexte(premier.reponses)
		const second = referentielGarde(lireLesReponses(texte), referentielGeoApi())
		const apres = await communesDesProfils(profils, second)

		expect(apres).toEqual(avant)
		expect(nouveauJournal).toHaveLength(0)
		expect(second.nouvelles()).toBe(0)
		expect(reponsesEnTexte(second.reponses)).toBe(texte)
	})

	test('le fichier range ses questions dans l’ordre, et refuse ce qui n’est pas une réponse gardée', () => {
		const texte = reponsesEnTexte(
			new Map([
				['nom:bourg-fictif', []],
				['codePostal:74900', []],
			])
		)
		expect(Object.keys(JSON.parse(texte).reponses)).toEqual(['codePostal:74900', 'nom:bourg-fictif'])
		expect([...lireLesReponses(texte).keys()]).toEqual(['codePostal:74900', 'nom:bourg-fictif'])
		for (const faux of [
			'pas du json',
			'{}',
			'{"version":1,"source":"https://geo.api.gouv.fr","reponses":{"rue:x":[]}}',
		])
			expect(() => lireLesReponses(faux), faux).toThrow(ImportRefuse)
	})

	test('hors ligne, une réponse qui n’est pas gardée arrête l’import ; rien n’est demandé', async () => {
		const journal = simulerLeReferentiel()
		const horsLigne = referentielGarde(new Map(), null)

		await expect(resoudreLaVille('Bourg-Fictif', horsLigne)).rejects.toThrow(
			'Hors ligne (--hors-ligne), une réponse du référentiel des communes n’est pas dans le fichier des réponses gardées'
		)
		expect(journal).toHaveLength(0)
	})

	test('les réponses du banc couvrent chaque ville de la fausse base Strapi, hors ligne', async () => {
		const { lignes } = definitionDeLaSource('http://127.0.0.1:9090/mymakeup-test')
		const reponses = lireLesReponses(
			readFileSync(path.join(RACINE, 'tests/fixtures/import/referentiel-du-banc.json'), 'utf8')
		)
		const profils = lignes.makeup_artistes.map(({ id, city }) => ({
			id: Number(id),
			city: typeof city === 'string' ? city : null,
			videALaSource: false,
		}))

		const { communes, bilan } = await communesDesProfils(profils, referentielGarde(reponses, null))

		const parCode = Object.fromEntries([...communes.entries()].map(([id, c]) => [id, c?.codeInsee ?? null]))
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
		expect(bilan).toMatchObject({ aRevoir: [26, 28], adresses: [23] })
	})
})

describe('le référentiel qui ne répond pas arrête l’import avant toute écriture', () => {
	const adresse = `${ADRESSE_DU_REFERENTIEL}/communes`

	test('une panne, un réseau coupé, une réponse qui n’est pas une liste de communes, un service muet', async () => {
		simuler(http.get(adresse, () => new HttpResponse(null, { status: 500 })))
		await expect(referentielGeoApi().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow('réponse 500')

		simuler(http.get(adresse, () => HttpResponse.error()))
		await expect(referentielGeoApi().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow('réseau injoignable')

		simuler(http.get(adresse, () => HttpResponse.json({ message: 'pas une liste' })))
		await expect(referentielGeoApi().repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow(
			'sa réponse n’est pas une liste de communes'
		)

		simuler(
			http.get(adresse, async () => {
				await delay('infinite')
				return HttpResponse.json([])
			})
		)
		await expect(referentielGeoApi({ delaiMs: 50 }).repondre({ genre: 'nom', valeur: 'x' })).rejects.toThrow(
			'pas de réponse en 0.05 s'
		)
	})

	test('une commune inconnue par son code INSEE est une réponse vide', async () => {
		simulerLeReferentiel()
		expect(await referentielGeoApi().repondre({ genre: 'code', valeur: '74999' })).toEqual([])
	})
})

describe('la table de décision et la ligne de commande', () => {
	test('une ligne par profil à revoir : un code INSEE bien formé, ou aucun', () => {
		expect(
			lireLesDecisions('{ "communes": [{ "profil": 28, "codeInsee": "2A004" }, { "profil": 26, "codeInsee": null }] }')
		).toEqual({
			emailsPartages: [],
			profilsEcartes: [],
			communes: [
				{ profil: 28, codeInsee: '2A004' },
				{ profil: 26, codeInsee: null },
			],
		})
		for (const faux of [
			'{ "communes": [{ "profil": 28, "codeInsee": "74" }] }',
			'{ "communes": [{ "profil": 28, "codeInsee": "Annecy" }] }',
			'{ "communes": [{ "profil": 28, "codeInsee": "74010" }, { "profil": 28, "codeInsee": null }] }',
			'{ "communes": [{ "profil": 28 }] }',
			'{ "communes": [{ "profil": 28, "codeInsee": null, "ville": "x" }] }',
		])
			expect(() => lireLesDecisions(faux), faux).toThrow(ImportRefuse)
	})

	test('--communes, --hors-ligne et --revue', () => {
		expect(lireLesArguments(['--communes', 'c.json', '--hors-ligne', '--revue', 'v.json'])).toEqual({
			mode: 'a-blanc',
			cibleDistante: false,
			communes: 'c.json',
			horsLigne: true,
			revue: 'v.json',
		})
		for (const ligne of [['--communes'], ['--revue', '--reel'], ['--hors-ligne', '--hors-ligne']])
			expect(lireLesArguments(ligne), ligne.join(' ')).toBeNull()
	})
})
