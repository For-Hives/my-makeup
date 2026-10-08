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
	// without a commune, nothing: the end of a street is not a commune
	['3 avenue X', '', ['3', 'avenue', 'X']],
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

// a number then free text is no street number: shown as typed, and not a
// usable city (as before UI-11)
const NUMERO_PUIS_TEXTE = [
	'74 et alentours',
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
			...[...ADRESSES, ...LIEUX, ...DEPARTEMENTS_NOMMES].map(([t]) => t),
			...NUMERO_PUIS_TEXTE,
		]) {
			const une = lieuPublic(tapee)
			assert.equal(villePublique(une.texte), une.texte, tapee)
			assert.equal(lieuPublic(une.texte).departement, une.departement, tapee)
			// the page (props) and the sitemap (typed value) agree
			assert.equal(villeExploitable(une.texte), villeExploitable(tapee), tapee)
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
