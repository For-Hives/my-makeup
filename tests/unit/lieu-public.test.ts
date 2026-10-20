import { describe, expect, test } from 'bun:test'
import { usableCity } from '@/lib/profile/completeness'
import { publicPlace, publicCity } from '@/lib/profile/public-place'

// Ported from the « villePublique » block of tests/unit/lieu-public.test.mjs of the old site
// (branch main): same cases, same expected values.
// Made-up addresses only (« des Essais », « Fictifs »): never a real one.

type Adresse = readonly [tapee: string, publique: string, motsDeLaRue: readonly string[]]
type Lieu = readonly [tapee: string, publique: string]

const ADRESSES: readonly Adresse[] = [
	['12 rue X 74000 Annecy', 'Annecy (74)', ['12', 'rue', 'X']],
	['12, avenue Y, 75011 Paris', 'Paris (75)', ['12', 'avenue', 'Y']],
	['3 Place Z Thonon-les-Bains', 'Thonon-les-Bains', ['3', 'Place', 'Z']],
	['12 RUE DES ESSAIS 74000 ANNECY', 'Annecy (74)', ['12', 'RUE', 'ESSAIS']],
	['8 allée des Érables Fictifs 74940 Annecy-le-Vieux', 'Annecy-le-Vieux (74)', ['8', 'allée', 'Érables', 'Fictifs']],
	['5 chemin des Essais, 74100 Annemasse CEDEX', 'Annemasse (74)', ['5', 'chemin', 'Essais', 'CEDEX']],
	[
		'7 IMPASSE DES ESSAIS, 74200 THONON-LES-BAINS, FRANCE',
		'Thonon-les-Bains (74)',
		['7', 'IMPASSE', 'ESSAIS', 'FRANCE'],
	],
	['12 bis rue des Essais 73000 Chambéry', 'Chambéry (73)', ['bis', 'rue']],
	['1 cours des Essais 20090 Ajaccio', 'Ajaccio (2A)', ['1', 'cours']],
	['4 rue des Essais 97400 Saint-Denis', 'Saint-Denis (974)', ['4', 'rue']],
	['12 rue des Essais, 74 000 Annecy', 'Annecy (74)', ['rue', 'Essais']],
	['lieu-dit Les Essais 74230 Thônes', 'Thônes (74)', ['lieu-dit', 'Les Essais']],
	['12 rue des Essais, Annecy', 'Annecy', ['12', 'rue', 'Essais']],
	['12 rue des Essais Annecy 74000', '74000', ['12', 'rue', 'Essais']],
	['12 rue des Essais 74000', '74000', ['12', 'rue', 'Essais']],
	['7 impasse des Essais Fictifs Le Grand-Bornand', 'Le Grand-Bornand', ['7', 'impasse', 'Essais', 'Fictifs']],
	// Paris is a commune and a département
	['12 rue des Essais, 75011 Paris', 'Paris (75)', ['12', 'rue', 'Essais']],
	// a département after the postal code: the place before it
	['Saint Julien en Genevois 74160 Haute-Savoie', 'Saint Julien en Genevois (74)', []],
	// no type of street, but words, a postal code and a place
	['Le Bourg 74300 Cluses', 'Cluses (74)', ['Le', 'Bourg']],
	['Les Marais Fictifs 74000 Annecy', 'Annecy (74)', ['Marais', 'Fictifs']],
	['12 Les Marais 74000 Annecy', 'Annecy (74)', ['12', 'Marais']],
	['ZA des Essais 74000 Annecy', 'Annecy (74)', ['ZA', 'Essais']],
	['BP 123 74000 Annecy', 'Annecy (74)', ['BP', '123']],
	['CS 12345 74000 ANNECY CEDEX', 'Annecy (74)', ['CS', '12345', 'CEDEX']],
	// abroad: the town, without its postal code nor its country
	['12 rue des Essais, Genève, Suisse', 'Genève', ['12', 'rue', 'Suisse']],
	['12 rue des Essais, 1000 Bruxelles, Belgique', 'Bruxelles', ['12', 'rue', '1000', 'Belgique']],
	// a number then a place: the place, never the number (a street number or a département, it
	// cannot be told)
	['74 La Roche-sur-Foron', 'La Roche-sur-Foron', ['74']],
	['74 Annecy', 'Annecy', ['74']],
	['13 Marseille', 'Marseille', ['13']],
	['12 Le Bourg', 'Le Bourg', ['12']],
	// a comma between the commune and the postal code
	['12 rue des Essais, Annecy, 74000', 'Annecy (74)', ['12', 'rue', 'Essais']],
	['12 rue des Essais, 74000, Annecy', 'Annecy (74)', ['12', 'rue', 'Essais']],
	['3 place des Essais Thonon-les-Bains, 74200', 'Thonon-les-Bains (74)', ['3', 'place', 'Essais']],
	// a lieu-dit, a comma, then the postal code and the commune
	['Les Essais, 74200 Thonon', 'Thonon (74)', ['Les Essais']],
	// a number then words: a street, even without its type
	['12 Les Essais 74000', '74000', ['12', 'Essais']],
	['12 Les Essais, Annecy', 'Annecy', ['12', 'Essais']],
	['12 bis, Les Essais, Annecy', 'Annecy', ['12', 'bis', 'Essais']],
	// a street glued to its commune or to its number
	['74200 Thonon-les-Bains,chemin des Essais', 'Thonon-les-Bains (74)', ['chemin', 'Essais']],
	['74000 Annecy.rue des Essais', 'Annecy (74)', ['rue', 'Essais']],
	['74000 ANNECY;RUE DES ESSAIS', 'Annecy (74)', ['RUE', 'ESSAIS']],
	['12rue des Essais 74000 Annecy', 'Annecy (74)', ['12rue', 'rue', 'Essais']],
	["12 l'avenue des Essais, Annecy", 'Annecy', ["l'avenue", 'Essais']],
	['3 place des Essais.Thonon-les-Bains', 'Thonon-les-Bains', ['place', 'Essais']],
	// a commune named like a type of street, after the postal code
	['12 rue des Essais, 38490 Le Passage', 'Le Passage (38)', ['12', 'rue']],
	// without a commune, nothing: the end of a street is not a commune
	['3 avenue X', '', ['3', 'avenue', 'X']],
	["12 avenue des Essais d'Annecy-le-Vieux", '', ['Essais', "d'Annecy"]],
	['3 place Fictive Essai-Thonon-les-Bains', '', ['Fictive', 'Essai']],
	['12 rue Victor Hugo', '', ['Victor', 'Hugo']],
	['9 avenue Paul Vaillant-Couturier', '', ['Paul', 'Vaillant-Couturier']],
	['12 rue de la Paix', '', ['Paix']],
	['10 avenue du Général Charles-de-Gaulle', '', ['10', 'Général', 'Charles-de-Gaulle']],
]

// a code of département then the name of that département: both kept
const DEPARTEMENTS_NOMMES: readonly Lieu[] = [
	['74 Haute-Savoie', 'Haute-Savoie (74)'],
	['2A Corse-du-Sud', 'Corse-du-Sud (2A)'],
	['75 Paris', 'Paris (75)'],
]

// a street glued to the commune without a postal code: the commune cannot be told from the
// street, nothing is published, and it is not a usable city
const RUES_COLLEES: readonly string[] = [
	'Annecy,rue des Essais',
	'Annecy;rue des Essais',
	'Annecy/rue des Essais',
	'Annecy.rue des Essais',
	'Annecy:rue des Essais',
	'Annecy|rue des Essais',
	'Annecy-rue des Essais',
	'ANNECY,RUE DES ESSAIS',
	'Thonon-les-Bains,chemin des Essais',
	'Fictiville,impasse des Essais Fictifs',
	'Fictiville,9-lieu-dit Les Essais',
	'12rue des Essais',
]

// a number then free text is no street number: shown as typed, and not a usable city
const NUMERO_PUIS_TEXTE: readonly string[] = [
	'74 et alentours',
	'74 et alentours, Annecy',
	'74 partout',
	'74 Partout',
	'74 Annecy et alentours',
	'3 villes : Annecy, Thonon, Evian',
	'3 villes : Annecy 74000, Thonon 74200',
	'12',
]

// fields that are no address: shown as typed (cleaned)
const LIEUX: readonly Lieu[] = [
	['Annecy', 'Annecy'],
	['  Annecy  ', 'Annecy'],
	['Annecy 74000', 'Annecy (74)'],
	['74000 Annecy', 'Annecy (74)'],
	['74000 ANNECY CEDEX 9', 'Annecy (74)'],
	['Annecy (74000)', 'Annecy (74)'],
	['Annecy (74)', 'Annecy (74)'],
	['74000', '74000'],
	['Annecy, France', 'Annecy'],
	['Saint-Julien-en-Genevois', 'Saint-Julien-en-Genevois'],
	['Paris, Lyon et Annecy', 'Paris, Lyon et Annecy'],
	['Annecy / Genève', 'Annecy / Genève'],
	['Toute la France', 'Toute la France'],
	['France', 'France'],
	['Paris 15e', 'Paris 15e'],
	['Porte-de-Savoie', 'Porte-de-Savoie'],
	['Annecy, 74000', 'Annecy (74)'],
	['74 000 Annecy', 'Annecy (74)'],
	// words that say how far before the postal code: no address
	['Toute la Haute-Savoie, 74000 Annecy', 'Toute la Haute-Savoie, 74000 Annecy'],
	// « 74 100 » before a unit is no postal code
	['Haute-Savoie 74 100 km', 'Haute-Savoie 74 100 km'],
]

// communes named like a type of street: a type of street comes before the name of the street,
// never alone nor before a postal code
const COMMUNES_COMME_UNE_VOIE: readonly Lieu[] = [
	['Rue', 'Rue'],
	['Cours', 'Cours'],
	['Le Passage', 'Le Passage'],
	['La Chaussée 76590', 'La Chaussée (76)'],
	['47360 Cours', 'Cours (47)'],
	['Cours-la-Ville', 'Cours-la-Ville'],
	['Cosne-Cours-sur-Loire', 'Cosne-Cours-sur-Loire'],
	['Fontaine-la-Chaussée', 'Fontaine-la-Chaussée'],
	["Lagarde-d'Apt", "Lagarde-d'Apt"],
	['Apt', 'Apt'],
]

const VIDES: readonly unknown[] = [null, undefined, 42, {}, '', '   ', 'null', 'undefined', '-', '.', 'NaN']

// digits in a public place: only a postal code alone, or the département in brackets
const SANS_NUMERO_DE_RUE = /^(\d{5}|[^\d]*( \((\d{2}|2A|2B|97\d)\))?)$/

describe('villePublique: the public place of a city field', () => {
	for (const [tapee, publique] of [...ADRESSES, ...LIEUX]) {
		test(`« ${tapee} » → « ${publique} »`, () => {
			expect(publicCity(tapee)).toBe(publique)
		})
	}

	for (const [tapee, publique] of DEPARTEMENTS_NOMMES) {
		test(`« ${tapee} » → « ${publique} »`, () => {
			expect(publicCity(tapee)).toBe(publique)
			expect(usableCity(tapee)).toBe(true)
		})
	}

	for (const [tapee, publique] of COMMUNES_COMME_UNE_VOIE) {
		test(`« ${tapee} » → « ${publique} », a usable city`, () => {
			expect(publicCity(tapee)).toBe(publique)
			expect(publicPlace(tapee).adresse).toBe(false)
			expect(usableCity(tapee)).toBe(true)
		})
	}

	test('a street glued to the commune, no postal code: nothing, not a usable city', () => {
		for (const tapee of RUES_COLLEES) {
			expect(publicCity(tapee), tapee).toBe('')
			expect(publicPlace(tapee).adresse, tapee).toBe(true)
			expect(usableCity(tapee), tapee).toBe(false)
		}
	})

	test('a département code then free text: as typed, not a usable city', () => {
		for (const tapee of NUMERO_PUIS_TEXTE) {
			expect(publicCity(tapee)).toBe(tapee)
			expect(publicPlace(tapee).adresse, tapee).toBe(false)
			expect(usableCity(tapee), tapee).toBe(false)
		}
	})

	test('nothing usable: an empty text', () => {
		for (const v of VIDES) {
			expect(publicCity(v), String(v)).toBe('')
			expect(publicPlace(v), String(v)).toEqual({ texte: '', commune: '', departement: null, adresse: false })
		}
		// only separators are left once the country is dropped
		expect(publicCity(', France')).toBe('')
	})

	test('never the street number nor the street of an address', () => {
		for (const [tapee, publique, rue] of ADRESSES) {
			for (const mot of rue) {
				const present = ` ${publique} `.includes(` ${mot.trim()} `) || publique.includes(`${mot.trim()} `)
				expect(present, `« ${tapee} » → « ${publique} » holds « ${mot} »`).toBe(false)
			}
			expect(publique, tapee).toMatch(SANS_NUMERO_DE_RUE)
		}
	})

	test('the same place when read again (a public page reads what another one published)', () => {
		for (const tapee of [
			...[...ADRESSES, ...LIEUX, ...DEPARTEMENTS_NOMMES, ...COMMUNES_COMME_UNE_VOIE].map(([t]) => t),
			...NUMERO_PUIS_TEXTE,
			...RUES_COLLEES,
		]) {
			const une = publicPlace(tapee)
			expect(publicCity(une.texte), tapee).toBe(une.texte)
			expect(publicPlace(une.texte).departement, tapee).toBe(une.departement)
			// what is published and what was typed agree
			expect(usableCity(une.texte), tapee).toBe(usableCity(tapee))
		}
	})

	test('property: a generated address never gives its street, whatever glues it', () => {
		// made-up streets: each name holds a word that must never come out
		let graine = 7
		const hasard = (): number => {
			graine = (graine * 1103515245 + 12345) % 2 ** 31
			return graine / 2 ** 31
		}
		const un = (liste: readonly string[]): string => liste[Math.floor(hasard() * liste.length)] ?? ''
		const NUMEROS = ['', '12 ', '3 bis ', '7ter ', '45, ', '12', '9-']
		const VOIES = [
			'rue',
			'RUE',
			'avenue',
			'av.',
			'bd',
			'chemin',
			'allée',
			'impasse',
			'route',
			'place',
			'quai',
			'cours',
			'lieu-dit',
			'résidence',
			'ZA',
			'clos',
			'rond-point',
			"l'avenue",
		]
		const NOMS = [
			'des Zorglubs',
			'du Xyzzy',
			'Qwertz',
			'de la Plughette',
			'du Général Zorgmann',
			'Wibble-Frobnitz',
			'des Frobs-les-Gloups',
			"d'Xyzzy-la-Plugh",
			'du 8 Mai Zorgle',
			'Qwertz Zorgmann',
		]
		const MARQUES = /zorglub|xyzzy|qwertz|plugh|zorgmann|wibble|frobnitz|frobs|gloups|zorgle/i
		const COMMUNES = [
			'Annecy',
			'Thonon-les-Bains',
			'La Roche-sur-Foron',
			'Saint-Julien-en-Genevois',
			'Le Grand-Bornand',
			"L'Isle-d'Abeau",
			'Chambéry',
			'Annecy-le-Vieux',
		]
		const CODES = ['74000', '74200', '73000', '75011', '74 000', '20000']
		// with or without a space
		const SEPARATEURS = [' ', ', ', ',', ' , ', '; ', ';', '/', ' / ', '.', '. ', ':', '|', ' - ', '-', ' – ']
		const FINS = ['', ', France', ' CEDEX', ' (France)', '.']
		const FORMES: readonly ((rue: string, commune: string, codePostal: string) => string)[] = [
			(rue, c, cp) => `${rue}${un(SEPARATEURS)}${cp} ${c}`,
			(rue, c, cp) => `${rue}${un(SEPARATEURS)}${c}${un(SEPARATEURS)}${cp}`,
			(rue, c) => `${rue}${un(SEPARATEURS)}${c}`,
			(rue, _c, cp) => `${rue}${un(SEPARATEURS)}${cp}`,
			(rue, c) => `${rue} ${c}`,
			(rue, c, cp) => `${cp} ${c}${un(SEPARATEURS)}${rue}`,
			(rue, c) => `${c}${un(SEPARATEURS)}${rue}`,
		]
		for (let i = 0; i < 4000; i++) {
			const rue = `${un(NUMEROS)}${un(VOIES)} ${un(NOMS)}`
			const forme = FORMES[Math.floor(hasard() * FORMES.length)]
			if (forme === undefined) throw new Error('no form drawn')
			let tapee = `${forme(rue, un(COMMUNES), un(CODES))}${un(FINS)}`
			const casse = hasard()
			if (casse < 0.25) tapee = tapee.toUpperCase()
			else if (casse < 0.45) tapee = tapee.toLowerCase()
			const lieu = publicPlace(tapee)
			for (const sortie of [lieu.texte, lieu.commune]) {
				expect(sortie, `« ${tapee} » → « ${sortie} »`).not.toMatch(MARQUES)
			}
			expect(lieu.texte, tapee).toMatch(SANS_NUMERO_DE_RUE)
			expect(publicCity(lieu.texte), tapee).toBe(lieu.texte)
			expect(usableCity(lieu.texte), tapee).toBe(usableCity(tapee))
		}
	})

	test('commune and département apart', () => {
		expect(publicPlace('12 rue X 74000 Annecy')).toEqual({
			texte: 'Annecy (74)',
			commune: 'Annecy',
			departement: '74',
			adresse: true,
		})
		expect(publicPlace('Annecy (74)')).toEqual({
			texte: 'Annecy (74)',
			commune: 'Annecy',
			departement: '74',
			adresse: false,
		})
		expect(publicPlace('Annecy').commune).toBe('Annecy')
		expect(publicPlace('3 avenue X').adresse).toBe(true)
		expect(publicPlace('Annecy').adresse).toBe(false)
	})

	test('the département of the last postal code', () => {
		expect(publicPlace('CS 12345 74000 Annecy Cedex').departement).toBe('74')
		expect(publicPlace('1 cours des Essais 20200 Bastia').departement).toBe('2B')
		expect(publicPlace('12 bd des Essais 98000 Monaco').texte).toBe('Monaco')
		expect(publicPlace('Monaco 98000').texte).toBe('Monaco')
	})
})
