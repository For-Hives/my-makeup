import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	AIDE_VILLE,
	avecVillePublique,
	departementDuCodePostal,
	lieuPublic,
	villePublique,
} from '../../src/lib/profil/lieu-public.js'
import { completude } from '../../src/lib/profil/completude.js'
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
	['74 La Roche-sur-Foron', 'La Roche-sur-Foron', ['74 ']],
	// without a commune, nothing: the end of a street is not a commune
	['3 avenue X', '', ['3', 'avenue', 'X']],
	['12 rue Victor Hugo', '', ['Victor', 'Hugo']],
	['9 avenue Paul Vaillant-Couturier', '', ['Paul', 'Vaillant-Couturier']],
	['12 rue de la Paix', '', ['Paix']],
	['12', '', ['12']],
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
		for (const [tapee] of [...ADRESSES, ...LIEUX]) {
			const une = villePublique(tapee)
			assert.equal(villePublique(une), une, tapee)
			assert.deepEqual(lieuPublic(une).texte, une, tapee)
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

	test('département of a postal code: Corse, outre-mer, none for Monaco', () => {
		assert.equal(departementDuCodePostal('74000'), '74')
		assert.equal(departementDuCodePostal('01000'), '01')
		assert.equal(departementDuCodePostal('20090'), '2A')
		assert.equal(departementDuCodePostal('20200'), '2B')
		assert.equal(departementDuCodePostal('97411'), '974')
		assert.equal(departementDuCodePostal('98000'), null)
		assert.equal(departementDuCodePostal('00100'), null)
		assert.equal(departementDuCodePostal('7400'), null)
		assert.equal(departementDuCodePostal(74000), null)
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

	test('sitemap: the profile is publiable', () => {
		const { publiables } = trierProfilsPublics([entree])
		assert.deepEqual(
			publiables.map(p => p.slug),
			['testine-adresse']
		)
	})
})
