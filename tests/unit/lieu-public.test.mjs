import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	AIDE_VILLE,
	avecVillePublique,
	lieuPublic,
	villePublique,
} from '../../src/lib/profil/lieu-public.js'
import {
	completude,
	villeExploitable,
} from '../../src/lib/profil/completude.js'
import {
	sectionsVisibles,
	zoneProfil,
} from '../../src/lib/profil/vue-publique.js'
import { seoProfil, serialiserJsonLd } from '../../src/lib/seo/meta.js'
import { trierProfilsPublics } from '../../src/lib/profil/publiables.js'

// Made-up addresses only (« des Essais », « Fictifs »): never a real one.
// [typed, public, words of the street that must never come out]
const ADRESSES = [
	['12 rue X 74000 Annecy', 'Annecy (74)', ['12', 'rue', 'X']],
	['12, avenue Y, 75011 Paris', 'Paris (75)', ['12', 'avenue', 'Y']],
	['3 Place Z Thonon-les-Bains', 'Thonon-les-Bains', ['3', 'Place', 'Z']],
	['12 RUE DES ESSAIS 74000 ANNECY', 'Annecy (74)', ['12', 'RUE', 'ESSAIS']],
	[
		'8 allée des Érables Fictifs 74940 Annecy-le-Vieux',
		'Annecy-le-Vieux (74)',
		['8', 'allée', 'Érables', 'Fictifs'],
	],
	[
		'5 chemin des Essais, 74100 Annemasse CEDEX',
		'Annemasse (74)',
		['5', 'chemin', 'Essais', 'CEDEX'],
	],
	[
		'7 IMPASSE DES ESSAIS, 74200 THONON-LES-BAINS, FRANCE',
		'Thonon-les-Bains (74)',
		['7', 'IMPASSE', 'ESSAIS', 'FRANCE'],
	],
	['12 bis rue des Essais 73000 Chambéry', 'Chambéry (73)', ['bis', 'rue']],
	['1 cours des Essais 20090 Ajaccio', 'Ajaccio (2A)', ['1', 'cours']],
	['4 rue des Essais 97400 Saint-Denis', 'Saint-Denis (974)', ['4', 'rue']],
	['12 rue des Essais, 74 000 Annecy', 'Annecy (74)', ['rue', 'Essais']],
	[
		'lieu-dit Les Essais 74230 Thônes',
		'Thônes (74)',
		['lieu-dit', 'Les Essais'],
	],
	['12 rue des Essais, Annecy', 'Annecy', ['12', 'rue', 'Essais']],
	['12 rue des Essais Annecy 74000', '74000', ['12', 'rue', 'Essais']],
	['12 rue des Essais 74000', '74000', ['12', 'rue', 'Essais']],
	[
		'7 impasse des Essais Fictifs Le Grand-Bornand',
		'Le Grand-Bornand',
		['7', 'impasse', 'Essais', 'Fictifs'],
	],
	// Paris is a commune and a département
	['12 rue des Essais, 75011 Paris', 'Paris (75)', ['12', 'rue', 'Essais']],
	// a département after the postal code: the place before it
	[
		'Saint Julien en Genevois 74160 Haute-Savoie',
		'Saint Julien en Genevois (74)',
		[],
	],
	// no type of street, but words, a postal code and a place
	['Le Bourg 74300 Cluses', 'Cluses (74)', ['Le', 'Bourg']],
	['Les Marais Fictifs 74000 Annecy', 'Annecy (74)', ['Marais', 'Fictifs']],
	['12 Les Marais 74000 Annecy', 'Annecy (74)', ['12', 'Marais']],
	['ZA des Essais 74000 Annecy', 'Annecy (74)', ['ZA', 'Essais']],
	['BP 123 74000 Annecy', 'Annecy (74)', ['BP', '123']],
	['CS 12345 74000 ANNECY CEDEX', 'Annecy (74)', ['CS', '12345', 'CEDEX']],
	// abroad: the town, without its postal code nor its country
	['12 rue des Essais, Genève, Suisse', 'Genève', ['12', 'rue', 'Suisse']],
	[
		'12 rue des Essais, 1000 Bruxelles, Belgique',
		'Bruxelles',
		['12', 'rue', '1000', 'Belgique'],
	],
	// a number then a place: the place, never the number (a street number
	// or a département, it cannot be told)
	['74 La Roche-sur-Foron', 'La Roche-sur-Foron', ['74']],
	['74 Annecy', 'Annecy', ['74']],
	['13 Marseille', 'Marseille', ['13']],
	['12 Le Bourg', 'Le Bourg', ['12']],
	// a comma between the commune and the postal code
	['12 rue des Essais, Annecy, 74000', 'Annecy (74)', ['12', 'rue', 'Essais']],
	['12 rue des Essais, 74000, Annecy', 'Annecy (74)', ['12', 'rue', 'Essais']],
	[
		'3 place des Essais Thonon-les-Bains, 74200',
		'Thonon-les-Bains (74)',
		['3', 'place', 'Essais'],
	],
	// a lieu-dit, a comma, then the postal code and the commune
	['Les Essais, 74200 Thonon', 'Thonon (74)', ['Les Essais']],
	// a number then words: a street, even without its type
	['12 Les Essais 74000', '74000', ['12', 'Essais']],
	['12 Les Essais, Annecy', 'Annecy', ['12', 'Essais']],
	['12 bis, Les Essais, Annecy', 'Annecy', ['12', 'bis', 'Essais']],
	// a street glued to its commune or to its number
	[
		'74200 Thonon-les-Bains,chemin des Essais',
		'Thonon-les-Bains (74)',
		['chemin', 'Essais'],
	],
	['74000 Annecy.rue des Essais', 'Annecy (74)', ['rue', 'Essais']],
	['74000 ANNECY;RUE DES ESSAIS', 'Annecy (74)', ['RUE', 'ESSAIS']],
	['12rue des Essais 74000 Annecy', 'Annecy (74)', ['12rue', 'rue', 'Essais']],
	["12 l'avenue des Essais, Annecy", 'Annecy', ["l'avenue", 'Essais']],
	[
		'3 place des Essais.Thonon-les-Bains',
		'Thonon-les-Bains',
		['place', 'Essais'],
	],
	// a commune named like a type of street, after the postal code
	['12 rue des Essais, 38490 Le Passage', 'Le Passage (38)', ['12', 'rue']],
	// without a commune, nothing: the end of a street is not a commune
	['3 avenue X', '', ['3', 'avenue', 'X']],
	["12 avenue des Essais d'Annecy-le-Vieux", '', ['Essais', "d'Annecy"]],
	['3 place Fictive Essai-Thonon-les-Bains', '', ['Fictive', 'Essai']],
	['12 rue Victor Hugo', '', ['Victor', 'Hugo']],
	['9 avenue Paul Vaillant-Couturier', '', ['Paul', 'Vaillant-Couturier']],
	['12 rue de la Paix', '', ['Paix']],
	[
		'10 avenue du Général Charles-de-Gaulle',
		'',
		['10', 'Général', 'Charles-de-Gaulle'],
	],
]

// a code of département then the name of that département: both kept
const DEPARTEMENTS_NOMMES = [
	['74 Haute-Savoie', 'Haute-Savoie (74)'],
	['2A Corse-du-Sud', 'Corse-du-Sud (2A)'],
	['75 Paris', 'Paris (75)'],
]

// a street glued to the commune without a postal code: the commune cannot
// be told from the street, nothing is published, and it is not a usable
// city (as before UI-11)
const RUES_COLLEES = [
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

// a number then free text is no street number: shown as typed, and not a
// usable city (as before UI-11)
const NUMERO_PUIS_TEXTE = [
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
const LIEUX = [
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
	[
		'Toute la Haute-Savoie, 74000 Annecy',
		'Toute la Haute-Savoie, 74000 Annecy',
	],
	// « 74 100 » before a unit is no postal code
	['Haute-Savoie 74 100 km', 'Haute-Savoie 74 100 km'],
]

// communes named like a type of street: a type of street comes before the
// name of the street, never alone nor before a postal code
const COMMUNES_COMME_UNE_VOIE = [
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

const VIDES = [null, undefined, 42, {}, '', '   ', 'null', 'undefined', '-']

describe('villePublique (UI-11)', () => {
	for (const [tapee, publique] of [...ADRESSES, ...LIEUX])
		test(`« ${tapee} » → « ${publique} »`, () => {
			assert.equal(villePublique(tapee), publique)
		})

	for (const [tapee, publique] of DEPARTEMENTS_NOMMES)
		test(`« ${tapee} » → « ${publique} »`, () => {
			assert.equal(villePublique(tapee), publique)
			assert.equal(villeExploitable(tapee), true)
		})

	for (const [tapee, publique] of COMMUNES_COMME_UNE_VOIE)
		test(`« ${tapee} » → « ${publique} », a usable city`, () => {
			assert.equal(villePublique(tapee), publique)
			assert.equal(lieuPublic(tapee).adresse, false)
			assert.equal(villeExploitable(tapee), true)
		})

	test('a street glued to the commune, no postal code: nothing, not a usable city', () => {
		for (const tapee of RUES_COLLEES) {
			assert.equal(villePublique(tapee), '', tapee)
			assert.equal(lieuPublic(tapee).adresse, true, tapee)
			assert.equal(villeExploitable(tapee), false, tapee)
		}
	})

	test('a département code then free text: as typed, not a usable city', () => {
		for (const tapee of NUMERO_PUIS_TEXTE) {
			assert.equal(villePublique(tapee), tapee)
			assert.equal(lieuPublic(tapee).adresse, false, tapee)
			assert.equal(villeExploitable(tapee), false, tapee)
		}
	})

	test('nothing usable: an empty text', () => {
		for (const v of VIDES) assert.equal(villePublique(v), '', String(v))
	})

	test('never the street number nor the street of an address', () => {
		for (const [tapee, publique, rue] of ADRESSES) {
			for (const mot of rue)
				assert.ok(
					!` ${publique} `.includes(` ${mot.trim()} `) &&
						!publique.includes(`${mot.trim()} `),
					`« ${tapee} » → « ${publique} » holds « ${mot} »`
				)
			// digits: only the postal code alone or the département
			assert.match(
				publique,
				/^(\d{5}|[^\d]*( \((\d{2}|2A|2B|97\d)\))?)$/,
				tapee
			)
		}
	})

	test('the same place when read again (the public page reads its props)', () => {
		for (const tapee of [
			...[
				...ADRESSES,
				...LIEUX,
				...DEPARTEMENTS_NOMMES,
				...COMMUNES_COMME_UNE_VOIE,
			].map(([t]) => t),
			...NUMERO_PUIS_TEXTE,
			...RUES_COLLEES,
		]) {
			const une = lieuPublic(tapee)
			assert.equal(villePublique(une.texte), une.texte, tapee)
			assert.equal(lieuPublic(une.texte).departement, une.departement, tapee)
			// the page (props) and the sitemap (typed value) agree
			assert.equal(villeExploitable(une.texte), villeExploitable(tapee), tapee)
		}
	})

	test('property: a generated address never gives its street, whatever glues it', () => {
		// made-up streets: each name holds a word that must never come out
		let graine = 7
		const hasard = () =>
			(graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
		const un = liste => liste[Math.floor(hasard() * liste.length)]
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
		const MARQUES =
			/zorglub|xyzzy|qwertz|plugh|zorgmann|wibble|frobnitz|frobs|gloups|zorgle/i
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
		const SEPARATEURS = [
			' ',
			', ',
			',',
			' , ',
			'; ',
			';',
			'/',
			' / ',
			'.',
			'. ',
			':',
			'|',
			' - ',
			'-',
			' – ',
		]
		const FINS = ['', ', France', ' CEDEX', ' (France)', '.']
		const FORMES = [
			(rue, c, cp) => `${rue}${un(SEPARATEURS)}${cp} ${c}`,
			(rue, c, cp) => `${rue}${un(SEPARATEURS)}${c}${un(SEPARATEURS)}${cp}`,
			(rue, c) => `${rue}${un(SEPARATEURS)}${c}`,
			(rue, c, cp) => `${rue}${un(SEPARATEURS)}${cp}`,
			(rue, c) => `${rue} ${c}`,
			(rue, c, cp) => `${cp} ${c}${un(SEPARATEURS)}${rue}`,
			(rue, c) => `${c}${un(SEPARATEURS)}${rue}`,
		]
		for (let i = 0; i < 4000; i++) {
			const rue = `${un(NUMEROS)}${un(VOIES)} ${un(NOMS)}`
			let tapee = `${un(FORMES)(rue, un(COMMUNES), un(CODES))}${un(FINS)}`
			const casse = hasard()
			if (casse < 0.25) tapee = tapee.toUpperCase()
			else if (casse < 0.45) tapee = tapee.toLowerCase()
			const lieu = lieuPublic(tapee)
			const props = avecVillePublique({ attributes: { city: tapee } })
			for (const sortie of [lieu.texte, lieu.commune, JSON.stringify(props)])
				assert.doesNotMatch(sortie, MARQUES, `« ${tapee} » → « ${sortie} »`)
			assert.match(
				lieu.texte,
				/^(\d{5}|[^\d]*( \((\d{2}|2A|2B|97\d)\))?)$/,
				tapee
			)
			assert.equal(villePublique(lieu.texte), lieu.texte, tapee)
			assert.equal(villeExploitable(lieu.texte), villeExploitable(tapee), tapee)
		}
	})

	test('commune and département apart, for the JSON-LD', () => {
		assert.deepEqual(lieuPublic('12 rue X 74000 Annecy'), {
			texte: 'Annecy (74)',
			commune: 'Annecy',
			departement: '74',
			adresse: true,
		})
		assert.deepEqual(lieuPublic('Annecy (74)'), {
			texte: 'Annecy (74)',
			commune: 'Annecy',
			departement: '74',
			adresse: false,
		})
		assert.equal(lieuPublic('Annecy').commune, 'Annecy')
		assert.equal(lieuPublic('3 avenue X').adresse, true)
		assert.equal(lieuPublic('Annecy').adresse, false)
	})

	test('the département of the last postal code (lieu.js)', () => {
		assert.equal(lieuPublic('CS 12345 74000 Annecy Cedex').departement, '74')
		assert.equal(
			lieuPublic('1 cours des Essais 20200 Bastia').departement,
			'2B'
		)
		assert.equal(lieuPublic('12 bd des Essais 98000 Monaco').texte, 'Monaco')
		assert.equal(lieuPublic('Monaco 98000').texte, 'Monaco')
	})

	test('the help of the artist’s space', () => {
		assert.equal(
			AIDE_VILLE,
			'Indique ta ville (et ton code postal), pas ton adresse : elle est publique.'
		)
	})
})

describe('the public pages show the public city only (UI-11)', () => {
	const DESCRIPTION = 'Maquilleuse professionnelle fictive. '.repeat(8)
	const ADRESSE = '7 impasse des Essais Fictifs, 74200 Thonon-les-Bains'
	const attributs = {
		username: 'testine-adresse',
		first_name: 'Testine',
		last_name: 'Adresse',
		speciality: 'Maquillage mariée',
		city: ADRESSE,
		action_radius: 30,
		description: DESCRIPTION,
		main_picture: {
			data: { id: 1, attributes: { url: 'https://r2.example.test/t.webp' } },
		},
		service_offers: [
			{ name: 'Mariée', description: '', price: '180 €', options: [] },
		],
		network: { instagram: '@studio.fictif', email: '', phone: '' },
	}
	const entree = { id: 9, attributes: attributs }

	test('props: the city replaced, everything else kept', () => {
		const publique = avecVillePublique(entree)
		assert.equal(publique.attributes.city, 'Thonon-les-Bains (74)')
		assert.equal(publique.id, 9)
		assert.deepEqual(
			{ ...publique.attributes, city: ADRESSE },
			entree.attributes
		)
		// not changed in place
		assert.equal(entree.attributes.city, ADRESSE)
		assert.doesNotMatch(JSON.stringify(publique), /Essais|impasse|\b7\b/)
		// flat shape (search), empty city, no city
		assert.equal(
			avecVillePublique({ city: '12 rue X 74000 Annecy' }).city,
			'Annecy (74)'
		)
		assert.equal(
			avecVillePublique({ attributes: { city: '3 avenue X' } }).attributes.city,
			null
		)
		assert.deepEqual(avecVillePublique({ id: 1 }), { id: 1 })
		assert.equal(avecVillePublique(null), null)
	})

	test('zone and sections of the page', () => {
		assert.equal(zoneProfil(entree), 'Thonon-les-Bains (74) et 30 km autour')
		assert.equal(
			zoneProfil(avecVillePublique(entree)),
			'Thonon-les-Bains (74) et 30 km autour'
		)
		assert.equal(sectionsVisibles(entree).localisation, true)
		assert.equal(sectionsVisibles({ city: '3 avenue X' }).localisation, false)
	})

	test('publiable, indexed, the commune in the title and the JSON-LD, never the street', () => {
		assert.equal(completude(attributs).publiable, true)
		for (const profil of [entree, avecVillePublique(entree)]) {
			const seo = seoProfil({
				profil,
				slug: 'testine-adresse',
				site: 'https://my-makeup.fr',
			})
			assert.equal(seo.indexable, true)
			assert.match(seo.titre, /Thonon-les-Bains \(74\)/)
			const [personne] = seo.jsonLd
			assert.equal(personne['@type'], 'Person')
			assert.deepEqual(personne.workLocation, {
				'@type': 'Place',
				name: 'Thonon-les-Bains',
			})
			assert.deepEqual(personne.makesOffer[0].itemOffered.areaServed, {
				'@type': 'City',
				name: 'Thonon-les-Bains',
			})
			const tout = `${JSON.stringify(seo)}${serialiserJsonLd(seo.jsonLd)}`
			assert.doesNotMatch(tout, /Essais|impasse|Fictifs/)
		}
	})

	test('a département code then free text: noindex and no nonsense place, as before', () => {
		const profil = { ...attributs, city: '74 et alentours' }
		assert.equal(completude(profil).publiable, false)
		const seo = seoProfil({
			profil,
			slug: 'testine-adresse',
			site: 'https://my-makeup.fr',
		})
		assert.equal(seo.indexable, false)
		assert.match(seo.titre, /à 74 et alentours/)
		assert.equal(zoneProfil(profil), '74 et alentours et 30 km autour')
	})

	test('a street glued to the commune (« Annecy,rue … »): noindex, out of the sitemap, the street nowhere', () => {
		for (const city of [
			'Annecy,rue des Essais Fictifs',
			'Annecy.rue des Essais Fictifs',
			'Annecy-rue des Essais Fictifs',
		]) {
			const profil = { ...attributs, city }
			assert.equal(completude(profil).publiable, false, city)
			const publique = avecVillePublique({ id: 9, attributes: profil })
			assert.equal(publique.attributes.city, null, city)
			for (const p of [profil, publique]) {
				const seo = seoProfil({
					profil: p,
					slug: 'testine-adresse',
					site: 'https://my-makeup.fr',
				})
				assert.equal(seo.indexable, false, city)
				const tout = `${JSON.stringify(seo)}${serialiserJsonLd(seo.jsonLd)}`
				assert.doesNotMatch(tout, /rue des|Essais|Fictifs/, city)
			}
			assert.deepEqual(
				trierProfilsPublics([{ id: 9, attributes: profil }]).publiables,
				[],
				city
			)
		}
	})

	test('a postal code alone names no City in the JSON-LD', () => {
		for (const city of ['7 impasse des Essais Fictifs, 74200', '74200']) {
			const seo = seoProfil({
				profil: { ...attributs, city },
				slug: 'testine-adresse',
				site: 'https://my-makeup.fr',
			})
			assert.equal(seo.indexable, true, city)
			const [personne] = seo.jsonLd
			assert.equal(personne.workLocation, null, city)
			assert.equal(personne.makesOffer[0].itemOffered.areaServed, null, city)
			assert.doesNotMatch(JSON.stringify(seo), /Essais|impasse|Fictifs/)
		}
	})

	test('sitemap: the profile is publiable', () => {
		const { publiables } = trierProfilsPublics([entree])
		assert.deepEqual(
			publiables.map(p => p.slug),
			['testine-adresse']
		)
	})
})
