import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	aMedia,
	completude,
	contactsMasques,
	CRITERES,
	longueurDescription,
	prixNumerique,
	villeExploitable,
} from '../../src/lib/profil/completude.js'

const DESCRIPTION = 'Maquilleuse professionnelle. '.repeat(8)

// made-up complete profile (Strapi v4, media in `{ data }`)
const complet = {
	first_name: 'Testine',
	last_name: 'Recette',
	speciality: 'Mariage',
	company_artist_name: 'Studio Test',
	city: 'Annecy',
	description: DESCRIPTION,
	main_picture: { data: { id: 1 } },
	image_gallery: { data: [{ id: 2 }] },
	skills: [{ id: 1 }],
	experiences: [{ id: 1 }],
	courses: [{ id: 1 }],
	service_offers: [{ price: 'à partir de 120 €' }],
	network: { instagram: 'studio.test' },
	language: [{ id: 1 }],
}

describe('completude (plans/02 U01-U07)', () => {
	test('U01 empty profile: 0/13, neither actif nor publiable, 13 missing in order', () => {
		const c = completude({})
		assert.equal(c.score, 0)
		assert.equal(c.sur, 13)
		assert.equal(c.actif, false)
		assert.equal(c.publiable, false)
		assert.deepEqual(c.manquants, [...CRITERES])
		assert.equal(completude(null).score, 0)
		assert.equal(completude(undefined).publiable, false)
	})

	test('U02 complete profile: 13/13, actif and publiable', () => {
		const c = completude(complet)
		assert.equal(c.score, 13)
		assert.deepEqual(c.manquants, [])
		assert.equal(c.actif, true)
		assert.equal(c.publiable, true)
	})

	test('U03 actif needs a picture, a usable city and a speciality', () => {
		for (const manque of [
			{ main_picture: { data: null } },
			{ main_picture: null },
			{ city: 'France' },
			{ city: '  ' },
			{ speciality: '' },
			{ speciality: null },
		])
			assert.equal(completude({ ...complet, ...manque }).actif, false)
	})

	test('U04 publiable needs an offer with a numeric price', () => {
		const avec = service_offers => completude({ ...complet, service_offers })
		assert.equal(avec([{ price: 'Sur devis' }]).publiable, false)
		assert.equal(avec([]).publiable, false)
		assert.equal(avec(null).publiable, false)
		assert.equal(
			avec([{ price: 'Sur devis' }, { price: '80€' }]).publiable,
			true
		)
	})

	test('U05 description of 200 characters at least, edge spaces ignored', () => {
		const avec = description => completude({ ...complet, description })
		assert.equal(avec('a'.repeat(199)).publiable, false)
		assert.equal(avec('a'.repeat(200)).publiable, true)
		assert.equal(avec(`   ${'a'.repeat(199)}   `).publiable, false)
		assert.equal(longueurDescription(`a${' '.repeat(50)}b`), 3)
	})

	test('U06 publiable needs a contact channel; the quote form counts', () => {
		const sansCanal = { ...complet, network: { instagram: '', email: null } }
		assert.equal(completude(sansCanal).publiable, false)
		assert.ok(completude(sansCanal).manquants.includes('reseaux'))
		assert.equal(
			completude(sansCanal, { formulaireDevis: true }).publiable,
			true
		)
		assert.equal(completude({ ...complet, network: null }).publiable, false)
	})

	test('U07 an internal account is never publiable', () => {
		const c = completude({ ...complet, speciality: 'CEO/CTO My Makeup' })
		assert.equal(c.interne, true)
		assert.equal(c.actif, true)
		assert.equal(c.publiable, false)
		assert.equal(
			completude({ ...complet, speciality: 'Maquillage mariée' }).interne,
			false
		)
	})

	test('U08 shared JSON cases (weekly report, v3): same results', () => {
		const { cas } = JSON.parse(
			readFileSync(
				new URL('./fixtures/completude-cas.json', import.meta.url),
				'utf8'
			)
		)
		assert.ok(cas.length >= 10)
		for (const { nom, profil, options, attendu } of cas) {
			const { score, actif, publiable, interne } = completude(profil, options)
			assert.deepEqual(
				{ score, actif, publiable, interne },
				attendu,
				`cas « ${nom} »`
			)
		}
	})
})

describe('elementary rules', () => {
	test('usable city: a town or a postcode, an address by its commune, never a country', () => {
		for (const v of [
			'Annecy',
			'74000',
			'74000 Annecy',
			'Annecy (74)',
			'Saint-Julien-en-Genevois',
			'Paris, Lyon et Annecy',
			// UI-11: a postal address counts by its commune or its postal code
			'12 rue des Lilas 74000 Annecy',
			'12, avenue des Essais, 75011 Paris',
			'3 Place des Essais Thonon-les-Bains',
			'12 rue des Essais 74000',
		])
			assert.equal(villeExploitable(v), true, v)
		for (const v of [
			'',
			'   ',
			'France',
			'FRANCE',
			'null',
			// an address without a commune nor a postal code
			'3 avenue X',
			'12 rue Victor Hugo',
			// a street glued to the commune: the commune cannot be told apart
			'Annecy,rue des Essais',
			'Annecy.rue des Essais',
			'Annecy-rue des Essais',
			null,
			42,
		])
			assert.equal(villeExploitable(v), false, String(v))
	})

	test('UI-11 a complete profile whose city is a postal address is publiable', () => {
		for (const city of [
			'12 rue des Essais Fictifs 74000 Annecy',
			'7 IMPASSE DES ESSAIS, 74200 THONON-LES-BAINS, FRANCE',
			'Annecy 74000',
		]) {
			const c = completude({ ...complet, city })
			assert.equal(c.actif, true, city)
			assert.equal(c.publiable, true, city)
			assert.equal(c.score, 13, city)
		}
		for (const city of ['3 avenue des Essais', 'Annecy,rue des Essais']) {
			const c = completude({ ...complet, city })
			assert.equal(c.actif, false, city)
			assert.equal(c.publiable, false, city)
		}
	})

	test('numeric price read in the text', () => {
		assert.equal(prixNumerique('80€'), 80)
		assert.equal(prixNumerique('à partir de 82,50 €'), 82.5)
		assert.equal(prixNumerique('1 200 €'), 1200)
		assert.equal(prixNumerique('Sur devis'), null)
		assert.equal(prixNumerique('2'), null)
		assert.equal(prixNumerique(null), null)
	})

	test('Strapi v4 and flat media', () => {
		assert.equal(aMedia({ data: null }), false)
		assert.equal(aMedia({ data: [] }), false)
		assert.equal(aMedia({ data: { id: 1 } }), true)
		assert.equal(aMedia({ data: [{ id: 1 }] }), true)
		assert.equal(aMedia([]), false)
		assert.equal(aMedia({ id: 1, url: '/x.jpg' }), true)
		assert.equal(aMedia(null), false)
		assert.equal(aMedia(undefined), false)
	})

	test('contacts hidden by a list of the API (PR #370): unknown, not missing', () => {
		assert.equal(contactsMasques({ id: 1, instagram: '' }), true)
		assert.equal(
			contactsMasques({ instagram: '', email: '', phone: '' }),
			false
		)
		assert.equal(contactsMasques({ email: null }), false)
		assert.equal(contactsMasques(null), false)
		assert.equal(contactsMasques(undefined), false)
	})
})
