import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	aMedia,
	completude,
	contactsMasques,
	CRITERES,
	devientPubliable,
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

	// the steps of the removed Cypress profile spec (8 %, 38 %, 92 %): the bar
	// shows Math.round(100 / 13 * score)
	test('names alone: 1/13 (both needed), a short description counts for the bar', () => {
		const noms = { first_name: 'Al', last_name: 'Bo' }
		assert.equal(completude(noms).score, 1)
		assert.deepEqual(completude(noms).manquants, CRITERES.slice(1))
		assert.equal(completude({ first_name: 'Al' }).score, 0)
		assert.equal(completude({ last_name: 'Bo' }).score, 0)
		assert.equal(completude({ first_name: 'Al', last_name: '  ' }).score, 0)
		// under the 200 characters of `publiable`, still one criterion
		const courte = completude({ ...noms, description: 'x' })
		assert.equal(courte.score, 2)
		assert.equal(courte.publiable, false)
		assert.equal(completude({ ...noms, description: '   ' }).score, 1)
	})

	test('everything but the gallery: 12/13, only « galerie » missing', () => {
		for (const image_gallery of [{ data: [] }, { data: null }, [], null]) {
			const c = completude({ ...complet, image_gallery })
			assert.equal(c.score, 12)
			assert.deepEqual(c.manquants, ['galerie'])
			// the gallery is not a rule of `publiable`
			assert.equal(c.publiable, true)
		}
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

describe('devientPubliable (profile_publiable, MES-12)', () => {
	// one criterion short: a description of 199 characters
	const presque = { ...complet, description: 'a'.repeat(199) }
	const incomplet = { ...complet, description: '', main_picture: null }

	test('the save that completes the last criterion: true', () => {
		assert.equal(
			devientPubliable(presque, {
				...presque,
				description: 'a'.repeat(200),
			}),
			true
		)
		assert.equal(devientPubliable(presque, complet), true)
	})

	test('complete to complete, incomplete to incomplete, complete to incomplete: false', () => {
		assert.equal(devientPubliable(complet, { ...complet, city: 'Lyon' }), false)
		assert.equal(
			devientPubliable(incomplet, { ...incomplet, description: 'Bonjour' }),
			false
		)
		assert.equal(devientPubliable(presque, presque), false)
		// a loss is never counted as a profile that became publiable
		assert.equal(devientPubliable(complet, presque), false)
		assert.equal(
			devientPubliable(complet, { ...complet, service_offers: [] }),
			false
		)
		assert.equal(devientPubliable(null, undefined), false)
		// an internal account never becomes publiable
		const interne = { ...presque, speciality: 'CEO/CTO My Makeup' }
		assert.equal(
			devientPubliable(interne, { ...interne, description: DESCRIPTION }),
			false
		)
	})

	test('the quote form counts as the contact channel she lacks', () => {
		const sansCanal = { ...presque, network: { instagram: '' } }
		const apres = { ...sansCanal, description: 'a'.repeat(200) }
		assert.equal(devientPubliable(sansCanal, apres), false)
		assert.equal(
			devientPubliable(sansCanal, apres, { formulaireDevis: false }),
			false
		)
		assert.equal(
			devientPubliable(sansCanal, apres, { formulaireDevis: true }),
			true
		)
	})
})
