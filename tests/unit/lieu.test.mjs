import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	correspondanceLieu,
	DEPARTEMENTS,
	departementDuCodePostal,
	lireLieu,
	normaliserLieu,
	separerParLieu,
} from '../../src/lib/lieu.js'

// made-up profiles, only their city matters here
const profil = (id, city) => ({ id, username: `profil-${id}`, city })
const correspond = (villeProfil, villeCherchee) =>
	correspondanceLieu(lireLieu(villeProfil), lireLieu(villeCherchee))

describe('place of a search by city (UI-10)', () => {
	test('places compared without case, accents, hyphens nor « St »', () => {
		assert.equal(
			normaliserLieu('Saint-Julien-en-Genevois'),
			'saint julien en genevois'
		)
		assert.equal(normaliserLieu('  ANNECY  '), 'annecy')
		assert.equal(normaliserLieu('St-Étienne'), 'saint etienne')
		assert.equal(normaliserLieu('Ste Foy-lès-Lyon'), 'sainte foy les lyon')
		assert.equal(normaliserLieu('L’Haÿ-les-Roses'), 'l hay les roses')
		assert.equal(
			normaliserLieu('Saint-Brieuc, Côtes-d’Armor'),
			'saint brieuc cotes d armor'
		)
		assert.equal(normaliserLieu('Œuilly'), 'oeuilly')
		for (const v of [null, undefined, 74, {}])
			assert.equal(normaliserLieu(v), '')
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
		for (const code of [
			'97500',
			'98000',
			'96000',
			'00100',
			'7400',
			74000,
			null,
		])
			assert.equal(departementDuCodePostal(code), null, String(code))
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
		for (const v of [
			'',
			'   ',
			'-',
			null,
			undefined,
			12,
			'France',
			'Toute la France',
		])
			assert.deepEqual(
				lireLieu(v),
				{ segments: [], departements: [] },
				String(v)
			)
	})

	test('a city: the words typed, whole, in the city of the profile', () => {
		assert.equal(correspond('Annecy', 'Annecy'), 'ville')
		assert.equal(correspond('ANNECY', 'annecy'), 'ville')
		assert.equal(correspond('Annecy-le-Vieux', 'Annecy'), 'ville')
		assert.equal(correspond('Grand Annecy', 'Annecy'), 'ville')
		assert.equal(correspond('Annecy 74000', 'Annecy'), 'ville')
		assert.equal(correspond('Annecy / Chambéry', 'Chambery'), 'ville')
		assert.equal(
			correspond('Saint-Julien-en-Genevois', 'St Julien en Genevois'),
			'ville'
		)
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
		assert.equal(
			correspond('Thonon-les-Bains 74200', 'Haute-Savoie'),
			'departement'
		)
		assert.equal(correspond('Annecy (74)', '74'), 'departement')
		assert.equal(
			correspond('Thonon-les-Bains 74200', 'Annecy 74000'),
			'departement'
		)
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
		assert.deepEqual(
			ids(separerParLieu(resultats, 'Annecy, France').locaux),
			[3]
		)
		assert.deepEqual(
			ids(separerParLieu(resultats, 'Annecy (Suisse)').locaux),
			[3]
		)
		assert.deepEqual(
			ids(separerParLieu(resultats, 'Annecy, Auvergne-Rhône-Alpes').locaux),
			[3]
		)
		// alone, a country or a region is what was typed
		assert.deepEqual(ids(separerParLieu(resultats, 'Suisse').locaux), [4])
		assert.deepEqual(
			ids(separerParLieu(resultats, 'Auvergne-Rhône-Alpes').locaux),
			[6]
		)
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
		for (const city of ['', '  ', '-'])
			assert.deepEqual(separerParLieu(resultats, city), {
				locaux: resultats,
				autres: [],
				parLieu: false,
			})
		assert.deepEqual(separerParLieu(null, 'Annecy'), {
			locaux: [],
			autres: [],
			parLieu: true,
		})
	})
})
