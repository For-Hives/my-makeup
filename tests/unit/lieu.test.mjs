import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
	codeDepartementEcrit,
	correspondanceLieu,
	DEPARTEMENTS,
	departementDuCodePostal,
	departementsDeLaRecherche,
	duDepartement,
	lieuUtilisable,
	lireLieu,
	normaliserLieu,
	sectionsParLieu,
	separerParLieu,
} from '../../src/lib/lieu.js'

// made-up profiles, only their city matters here
const profil = (id, city) => ({ id, username: `profil-${id}`, city })
const correspond = (villeProfil, villeCherchee) => correspondanceLieu(lireLieu(villeProfil), lireLieu(villeCherchee))

describe('place of a search by city (UI-10)', () => {
	test('places compared without case, accents, hyphens nor « St »', () => {
		assert.equal(normaliserLieu('Saint-Julien-en-Genevois'), 'saint julien en genevois')
		assert.equal(normaliserLieu('  ANNECY  '), 'annecy')
		assert.equal(normaliserLieu('St-Étienne'), 'saint etienne')
		assert.equal(normaliserLieu('Ste Foy-lès-Lyon'), 'sainte foy les lyon')
		assert.equal(normaliserLieu('L’Haÿ-les-Roses'), 'l hay les roses')
		assert.equal(normaliserLieu('Saint-Brieuc, Côtes-d’Armor'), 'saint brieuc cotes d armor')
		assert.equal(normaliserLieu('Œuilly'), 'oeuilly')
		for (const v of [null, undefined, 74, {}]) {
			assert.equal(normaliserLieu(v), '')
		}
	})

	test('101 départements; the département of a postal code', () => {
		assert.equal(Object.keys(DEPARTEMENTS).length, 101)
		assert.equal(DEPARTEMENTS['74'], 'Haute-Savoie')
		assert.equal(departementDuCodePostal('74000'), '74')
		assert.equal(departementDuCodePostal('74200'), '74')
		assert.equal(departementDuCodePostal('01000'), '01')
		assert.equal(departementDuCodePostal('95000'), '95')
		assert.equal(departementDuCodePostal('20090'), '2A')
		assert.equal(departementDuCodePostal('20200'), '2B')
		assert.equal(departementDuCodePostal('97411'), '974')
		assert.equal(departementDuCodePostal('97600'), '976')
		// not a département: Saint-Pierre-et-Miquelon, Monaco, nothing
		for (const code of ['97500', '98000', '96000', '00100', '7400', 74000, null]) {
			assert.equal(departementDuCodePostal(code), null, String(code))
		}
	})

	test('what a city field says: places and départements', () => {
		assert.deepEqual(lireLieu('Annecy (74)'), {
			segments: [{ mots: 'annecy', departement: false, large: false }],
			departements: ['74'],
		})
		assert.deepEqual(lireLieu('Lyon 69003'), {
			segments: [{ mots: 'lyon', departement: false, large: false }],
			departements: ['69'],
		})
		assert.deepEqual(lireLieu('HAUTE-SAVOIE'), {
			segments: [{ mots: 'haute savoie', departement: true, large: false }],
			departements: ['74'],
		})
		assert.deepEqual(lireLieu('Paris 15e'), {
			segments: [{ mots: 'paris', departement: true, large: false }],
			departements: ['75'],
		})
		assert.deepEqual(lireLieu('Annecy / Genève - Lyon'), {
			segments: [
				{ mots: 'annecy', departement: false, large: false },
				{ mots: 'geneve', departement: false, large: false },
				{ mots: 'lyon', departement: false, large: false },
			],
			departements: [],
		})
		assert.deepEqual(lireLieu('74').departements, ['74'])
		assert.deepEqual(lireLieu('2a').departements, ['2A'])
		assert.deepEqual(lireLieu('Corse').departements, ['2A', '2B'])
		assert.deepEqual(lireLieu('974').departements, ['974'])
		// a number after a city is not a département: « Paris 15 » is not the
		// Cantal, « Annecy 74 » says nothing more than Annecy
		assert.deepEqual(lireLieu('Paris 15').departements, ['75'])
		assert.deepEqual(lireLieu('Annecy 74').departements, [])
		assert.deepEqual(lireLieu('Indre-et-Loire').departements, ['37'])
		// « France » is no place; a country or a region is a wide one
		assert.deepEqual(lireLieu('Paris, France'), {
			segments: [{ mots: 'paris', departement: true, large: false }],
			departements: ['75'],
		})
		assert.deepEqual(lireLieu('Genève (Suisse)').segments, [
			{ mots: 'geneve', departement: false, large: false },
			{ mots: 'suisse', departement: false, large: true },
		])
		assert.deepEqual(lireLieu('Auvergne-Rhône-Alpes').segments, [
			{ mots: 'auvergne rhone alpes', departement: false, large: true },
		])
		for (const v of ['', '   ', '-', null, undefined, 12, 'France', 'Toute la France']) {
			assert.deepEqual(lireLieu(v), { segments: [], departements: [] }, String(v))
		}
	})

	test('a city: the words typed, whole, in the city of the profile', () => {
		assert.equal(correspond('Annecy', 'Annecy'), 'ville')
		assert.equal(correspond('ANNECY', 'annecy'), 'ville')
		assert.equal(correspond('Annecy-le-Vieux', 'Annecy'), 'ville')
		assert.equal(correspond('Grand Annecy', 'Annecy'), 'ville')
		assert.equal(correspond('Annecy 74000', 'Annecy'), 'ville')
		assert.equal(correspond('Annecy / Chambéry', 'Chambery'), 'ville')
		assert.equal(correspond('Saint-Julien-en-Genevois', 'St Julien en Genevois'), 'ville')
		assert.equal(correspond('Lyon 3e', 'Lyon 7e'), 'ville')
		// another city that starts the same, or no city at all
		assert.equal(correspond('Annemasse', 'Annecy'), null)
		assert.equal(correspond('Nantes', 'Annecy'), null)
		assert.equal(correspond('', 'Annecy'), null)
		assert.equal(correspond(null, 'Annecy'), null)
		// no geocoding: Annecy is not known to be in Haute-Savoie
		assert.equal(correspond('Haute-Savoie', 'Annecy'), null)
	})

	test('a département: by code, postal code or name, never inside another name', () => {
		assert.equal(correspond('Thonon-les-Bains 74200', 'Haute-Savoie'), 'departement')
		assert.equal(correspond('Annecy (74)', '74'), 'departement')
		assert.equal(correspond('Thonon-les-Bains 74200', 'Annecy 74000'), 'departement')
		assert.equal(correspond('Annecy', 'Annecy 74000'), 'ville')
		assert.equal(correspond('Chambéry (73)', 'Savoie'), 'departement')
		assert.equal(correspond('Savoie', 'Savoie'), 'ville')
		assert.equal(correspond('Haute-Savoie', 'Savoie'), null)
		assert.equal(correspond('Haute-Savoie', 'Haute-Savoie'), 'ville')
		assert.equal(correspond('Annecy, Haute-Savoie', 'Haute-Savoie'), 'ville')
		assert.equal(correspond('Paris 15e', 'Paris'), 'ville')
		assert.equal(correspond('75011', 'Paris'), 'departement')
		assert.equal(correspond('Ajaccio 20000', 'Corse'), 'departement')
		assert.equal(correspond('Lyon', '74'), null)
	})

	test('a name of département is not the longer one that begins the same', () => {
		for (const [nom, plusLong] of [
			['Loire', 'Loire-Atlantique'],
			['Charente', 'Charente-Maritime'],
			['Eure', 'Eure-et-Loir'],
			['Indre', 'Indre-et-Loire'],
			['Lot', 'Lot-et-Garonne'],
			['Tarn', 'Tarn-et-Garonne'],
			['Savoie', 'Haute-Savoie'],
		]) {
			assert.equal(correspond(plusLong, nom), null, `${plusLong} / ${nom}`)
			assert.equal(correspond(nom, plusLong), null, `${nom} / ${plusLong}`)
			assert.equal(correspond(nom, nom), 'ville', nom)
			assert.equal(correspond(plusLong, plusLong), 'ville', plusLong)
		}
		assert.equal(correspond('Loire-Atlantique Nantes', 'Loire'), null)
		assert.equal(correspond('Loire Saint-Étienne', 'Loire'), 'ville')
		assert.equal(correspond('LOT (46)', 'Lot'), 'ville')
		// by its code, Corse-du-Sud is still in Corse
		assert.equal(correspond('Corse-du-Sud', 'Corse'), 'departement')
		// the Loire (42) by its postal code comes before the Loire-Atlantique
		const { locaux, autres } = separerParLieu(
			[
				profil(1, 'Loire-Atlantique'),
				profil(2, 'Saint-Étienne 42000'),
				profil(3, 'Nantes 44000'),
				profil(4, 'Roanne, Loire'),
			],
			'Loire'
		)
		assert.deepEqual(
			locaux.map(r => r.id),
			[4, 2]
		)
		assert.deepEqual(
			autres.map(r => r.id),
			[1, 3]
		)
	})

	test('« France », a country or a region: never next to a city', () => {
		const resultats = [
			profil(1, 'Paris, France'),
			profil(2, 'Lyon (France)'),
			profil(3, 'Annecy'),
			profil(4, 'Genève, Suisse'),
			profil(5, 'Toute la France'),
			profil(6, 'Chambéry, Auvergne-Rhône-Alpes'),
		]
		const ids = liste => liste.map(r => r.id)
		assert.deepEqual(ids(separerParLieu(resultats, 'Annecy, France').locaux), [3])
		assert.deepEqual(ids(separerParLieu(resultats, 'Annecy (Suisse)').locaux), [3])
		assert.deepEqual(ids(separerParLieu(resultats, 'Annecy, Auvergne-Rhône-Alpes').locaux), [3])
		// alone, a country or a region is what was typed
		assert.deepEqual(ids(separerParLieu(resultats, 'Suisse').locaux), [4])
		assert.deepEqual(ids(separerParLieu(resultats, 'Auvergne-Rhône-Alpes').locaux), [6])
		// « France » alone: the whole country, nothing set apart
		assert.deepEqual(separerParLieu(resultats, 'France'), {
			locaux: resultats,
			autres: [],
			parLieu: false,
		})
	})

	test('the profiles of the city, then of the département, then the others, each in the order of the API', () => {
		const resultats = [
			profil(1, 'Lyon'),
			profil(2, 'Thonon-les-Bains 74200'),
			profil(3, 'ANNECY'),
			profil(4, ''),
			profil(5, 'Annecy-le-Vieux'),
			profil(6, 'null'),
			profil(7, 'Annemasse'),
			{ id: 8, username: 'sans-ville' },
		]
		const { locaux, autres, parLieu } = separerParLieu(resultats, 'Annecy (74)')
		assert.equal(parLieu, true)
		assert.deepEqual(
			locaux.map(r => r.id),
			[3, 5, 2]
		)
		assert.deepEqual(
			autres.map(r => r.id),
			[1, 4, 6, 7, 8]
		)
		assert.deepEqual(
			separerParLieu(resultats, 'Annecy').locaux.map(r => r.id),
			[3, 5]
		)
	})

	test('without a usable place, nothing is set apart', () => {
		const resultats = [profil(1, 'Lyon'), profil(2, 'Annecy')]
		for (const city of ['', '  ', '-']) {
			assert.deepEqual(separerParLieu(resultats, city), {
				locaux: resultats,
				autres: [],
				parLieu: false,
			})
		}
		assert.deepEqual(separerParLieu(null, 'Annecy'), {
			locaux: [],
			autres: [],
			parLieu: true,
		})
	})
})

describe('the others of a search by city in a sparse directory (UI-10)', () => {
	// made-up result cards: their city and action radius matter here
	const carte = (id, city, action_radius = null) => ({
		id,
		username: `profil-${id}`,
		city,
		action_radius,
	})
	const ids = liste => liste.map(r => r.id)
	const resume = ({ locaux, departements, sections, parLieu }) => ({
		locaux: ids(locaux),
		parLieu,
		departements,
		sections: sections.map(({ cle, titre, profils }) => [cle, titre, ids(profils)]),
	})

	test('a département written as a code by a profile: postal code or « (74) », never a name', () => {
		assert.equal(codeDepartementEcrit('Annecy (74)'), '74')
		assert.equal(codeDepartementEcrit('Annecy 74000'), '74')
		assert.equal(codeDepartementEcrit('Thonon-les-Bains 74200'), '74')
		assert.equal(codeDepartementEcrit('Ajaccio (2A)'), '2A')
		assert.equal(codeDepartementEcrit('Saint-Denis (974)'), '974')
		assert.equal(codeDepartementEcrit('Annecy (74), 74000'), '74')
		// a name may be another place of the field
		assert.equal(codeDepartementEcrit('Paris, Lyon et Annecy'), null)
		assert.equal(codeDepartementEcrit('Annecy, Haute-Savoie'), null)
		// a code in a field of two places: of which one?
		assert.equal(codeDepartementEcrit('Paris (75), Lyon'), null)
		assert.equal(codeDepartementEcrit('Lyon, Annecy 74000'), null)
		// a country is no other place
		assert.equal(codeDepartementEcrit('Annecy (74), Suisse'), '74')
		assert.equal(codeDepartementEcrit('Annecy (74), France'), '74')
		// two départements, or a number that is no code
		assert.equal(codeDepartementEcrit('Lyon 69003, Paris 75011'), null)
		assert.equal(codeDepartementEcrit('Corse (20)'), null)
		assert.equal(codeDepartementEcrit('Annecy 74'), null)
		assert.equal(codeDepartementEcrit('74 et alentours'), null)
		for (const v of ['', 'Annecy', null, undefined, 74000]) {
			assert.equal(codeDepartementEcrit(v), null, String(v))
		}
	})

	test('the département of the search: typed, else the most frequent code of the profiles of the city', () => {
		const annecy = [
			carte(1, 'Annecy (74)'),
			carte(2, 'Annecy'),
			carte(3, 'Annecy 74000'),
			carte(4, 'Annecy, Savoie (73)'),
		]
		assert.deepEqual(departementsDeLaRecherche(annecy, 'Annecy'), ['74'])
		// what was typed wins: a postal code, a code, a name
		assert.deepEqual(departementsDeLaRecherche(annecy, 'Annecy 73000'), ['73'])
		assert.deepEqual(departementsDeLaRecherche([], '74000'), ['74'])
		assert.deepEqual(departementsDeLaRecherche([], 'Annecy (74)'), ['74'])
		assert.deepEqual(departementsDeLaRecherche([], 'Haute-Savoie'), ['74'])
		assert.deepEqual(departementsDeLaRecherche([], 'Corse'), ['2A', '2B'])
		// a tie: the first profile, in the order of the API
		assert.deepEqual(
			departementsDeLaRecherche([carte(1, 'Saint-Denis (93)'), carte(2, 'Saint-Denis (974)')], 'Saint-Denis'),
			['93']
		)
		// no code written: no département (« Paris » is another place here)
		assert.deepEqual(departementsDeLaRecherche([carte(1, 'Annecy'), carte(2, 'Paris, Lyon et Annecy')], 'Annecy'), [])
		assert.deepEqual(departementsDeLaRecherche(null, 'Annecy'), [])
		assert.equal(duDepartement(['74']), 'du 74 (Haute-Savoie)')
		assert.equal(duDepartement(['2A', '2B']), 'du 2A (Corse-du-Sud) et du 2B (Haute-Corse)')
	})

	test('/search?city=Annecy: the city, then its département, those that travel, then the rest, each profile once', () => {
		// the directory, as the search page places it for a city alone: every
		// searchable profile, the last updated first
		const annuaire = [
			carte(2, 'Annecy'),
			carte(4, 'Thonon-les-Bains (74)'),
			carte(5, 'Chambéry (73)', 15),
			carte(6, '', 30),
			carte(7, 'Grenoble'),
			carte(1, 'Annecy (74)', 20),
			carte(3, 'Lyon', 30),
			carte(8, 'Annecy-le-Vieux', 10),
			carte(9, 'Nantes', 0),
			carte(10, 'Marseille'),
			carte(11, 'Cluses 74300', 5),
		]
		const sections = sectionsParLieu(annuaire, 'Annecy')
		assert.deepEqual(resume(sections), {
			// the title counts these only
			locaux: [2, 1, 8],
			parLieu: true,
			departements: ['74'],
			sections: [
				['departement', 'Autres maquilleuses du 74 (Haute-Savoie)', [4, 11]],
				['deplacent', 'Autres maquilleuses qui se déplacent', [5, 3]],
				// no city (6), no radius (7, 10), a radius of 0 (9)
				['autres', 'Autres maquilleuses', [6, 7, 9, 10]],
			],
		})
		const montres = [...sections.locaux, ...sections.sections.flatMap(s => s.profils)]
		assert.deepEqual(
			ids(montres).sort((a, b) => a - b),
			ids(annuaire).sort((a, b) => a - b)
		)
	})

	test('a directory cut by the API: the search answer first, then the directory, each profile once', () => {
		const resultats = [carte(1, 'Annecy (74)', 20), carte(12, 'Annecy')]
		const annuaire = [carte(3, 'Lyon', 30), carte(1, 'Annecy (74)', 20)]
		const sections = sectionsParLieu(resultats, 'Annecy', annuaire)
		assert.deepEqual(resume(sections), {
			locaux: [1, 12],
			parLieu: true,
			departements: ['74'],
			sections: [['deplacent', 'Autres maquilleuses qui se déplacent', [3]]],
		})
	})

	test('a postal code typed: its département is the place searched, counted in the title', () => {
		const annuaire = [
			carte(1, 'Annecy (74)'),
			carte(2, 'Lyon', 30),
			carte(3, 'Thonon-les-Bains 74200'),
			carte(4, 'Annecy', 10),
			carte(5, ''),
		]
		assert.deepEqual(resume(sectionsParLieu(annuaire, '74000')), {
			locaux: [1, 3],
			parLieu: true,
			departements: ['74'],
			// no geocoding: « Annecy » alone is not known to be in the 74
			sections: [
				['deplacent', 'Autres maquilleuses qui se déplacent', [2, 4]],
				['autres', 'Autres maquilleuses', [5]],
			],
		})
	})

	test('no département known: the same sections without the département, nobody left out', () => {
		const annuaire = [carte(1, 'Annecy'), carte(3, 'Nantes'), carte(4, '', 30), carte(5, 'Paris', 20), carte(2, 'Lyon')]
		assert.deepEqual(resume(sectionsParLieu(annuaire, 'Annecy')), {
			locaux: [1],
			parLieu: true,
			departements: [],
			sections: [
				['deplacent', 'Autres maquilleuses qui se déplacent', [5]],
				['autres', 'Autres maquilleuses', [3, 4, 2]],
			],
		})
		// a city nobody names: the title at zero, the others all there
		assert.deepEqual(resume(sectionsParLieu(annuaire, 'Grenoble')), {
			locaux: [],
			parLieu: true,
			departements: [],
			sections: [
				['deplacent', 'Autres maquilleuses qui se déplacent', [5]],
				['autres', 'Autres maquilleuses', [1, 3, 4, 2]],
			],
		})
	})

	test('a département inferred or not, the same profiles shown', () => {
		// « Toulouse (31) » tells the 31, « Toulouse » nothing: only the
		// sections change, never who is shown
		const annuaire = ville => [
			carte(1, ville),
			carte(2, 'Grenoble'),
			carte(3, ''),
			carte(4, 'Lyon', 30),
			carte(5, 'Muret (31)'),
		]
		const montres = city => {
			const { locaux, sections } = sectionsParLieu(annuaire(city), 'Toulouse')
			return ids([...locaux, ...sections.flatMap(s => s.profils)]).sort()
		}
		assert.deepEqual(montres('Toulouse (31)'), [1, 2, 3, 4, 5])
		assert.deepEqual(montres('Toulouse'), [1, 2, 3, 4, 5])
		assert.deepEqual(resume(sectionsParLieu(annuaire('Toulouse (31)'), 'Toulouse')).sections, [
			['departement', 'Autres maquilleuses du 31 (Haute-Garonne)', [5]],
			['deplacent', 'Autres maquilleuses qui se déplacent', [4]],
			['autres', 'Autres maquilleuses', [2, 3]],
		])
	})

	test('a search by term with a city: the API answer only, split the same way', () => {
		const resultats = [carte(1, 'Lyon'), carte(2, 'Annecy (74)'), carte(3, 'Cluses (74)')]
		assert.deepEqual(resume(sectionsParLieu(resultats, 'Annecy')), {
			locaux: [2],
			parLieu: true,
			departements: ['74'],
			sections: [
				['departement', 'Autres maquilleuses du 74 (Haute-Savoie)', [3]],
				['autres', 'Autres maquilleuses', [1]],
			],
		})
	})

	test('a place the page can rank by', () => {
		for (const city of ['Annecy', '74000', 'Haute-Savoie', 'Corse', 'Suisse']) {
			assert.equal(lieuUtilisable(city), true, city)
		}
		for (const city of ['', '-', 'France', 'Toute la France', null]) {
			assert.equal(lieuUtilisable(city), false, String(city))
		}
	})

	test('without a usable place, one list: the directory is not added', () => {
		const resultats = [carte(1, 'Lyon'), carte(2, 'Annecy')]
		for (const city of ['', '-', 'France']) {
			assert.deepEqual(sectionsParLieu(resultats, city, [carte(3, 'Paris', 10)]), {
				locaux: resultats,
				parLieu: false,
				departements: [],
				sections: [],
			})
		}
		assert.deepEqual(resume(sectionsParLieu(null, 'Annecy', null)), {
			locaux: [],
			parLieu: true,
			departements: [],
			sections: [],
		})
	})
})
