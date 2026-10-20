import { describe, expect, test } from 'bun:test'
import {
	aMedia,
	becomesPublishable,
	CHANNELS,
	CRITERIA,
	completeness,
	DESCRIPTION_MIN,
	descriptionLength,
	hasContactChannel,
	isFullyEmpty,
	isInternal,
	normalize,
	numericPrice,
	type ProfileFields,
	type PublishableConditions,
	publishableConditions,
	usableCity,
} from '@/lib/profile/completeness'
import casPartages from './fixtures/completeness-cases.json'
import ancienSite from './fixtures/completeness-old-site.json'

// Ported from tests/unit/completude.test.mjs of the old site (branch main) and from
// tests/unit/profile-conditions.test.js of the old API: same cases, same expected values.
// Fictional values only.

const DESCRIPTION = 'Maquilleuse professionnelle. '.repeat(8)

// made-up complete profile (media of the old API, in `{ data }`)
const full: ProfileFields = {
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

const NONE: PublishableConditions = {
	photoPrincipale: false,
	villeExploitable: false,
	specialite: false,
	offreChiffree: false,
	descriptionLongue: false,
	canalDeContact: false,
}

const ALL: PublishableConditions = {
	photoPrincipale: true,
	villeExploitable: true,
	specialite: true,
	offreChiffree: true,
	descriptionLongue: true,
	canalDeContact: true,
}

/** The six conditions as the old API names them, under the names of the v3 */
const sinceOldApi = (api: {
	mainPicture: boolean
	usableCity: boolean
	speciality: boolean
	pricedOffer: boolean
	description: boolean
	contactChannel: boolean
}): PublishableConditions => ({
	photoPrincipale: api.mainPicture,
	villeExploitable: api.usableCity,
	specialite: api.speciality,
	offreChiffree: api.pricedOffer,
	descriptionLongue: api.description,
	canalDeContact: api.contactChannel,
})

/** What the old front returned, as the reference file holds it */
interface ResultOldFront {
	score: number
	sur: number
	manquants: string[]
	actif: boolean
	publiable: boolean
	interne: boolean
}

/** The result without what the v3 adds, to compare with the old front */
const asOldFront = (
	profil: ProfileFields | null | undefined,
	options?: { formulaireDevis?: boolean }
): ResultOldFront => {
	const {
		score,
		sur: onValue,
		manquants: missing,
		actif: active,
		publiable: publishable,
		interne: internal,
	} = completeness(profil, options)
	return { score, sur: onValue, manquants: missing, actif: active, publiable: publishable, interne: internal }
}

describe('completude (plans/02 U01-U08)', () => {
	test('U01 empty profile: 0/13, neither actif nor publiable, 13 missing in display order', () => {
		const c = completeness({})
		expect(c.score).toBe(0)
		expect(c.sur).toBe(13)
		expect(c.actif).toBe(false)
		expect(c.publiable).toBe(false)
		expect(c.manquants).toEqual([...CRITERIA])
		expect(c.manquants).toEqual([
			'nom',
			'specialite',
			'nom_artiste',
			'ville',
			'description',
			'photo',
			'competences',
			'experiences',
			'formations',
			'offres',
			'reseaux',
			'langues',
			'galerie',
		])
		expect(c.conditions).toEqual(NONE)
		expect(c.entierementVide).toBe(true)
		expect(completeness(null).score).toBe(0)
		expect(completeness(null).entierementVide).toBe(true)
		expect(completeness(undefined).publiable).toBe(false)
	})

	test('U02 complete profile: 13/13, actif and publiable', () => {
		const c = completeness(full)
		expect(c.score).toBe(13)
		expect(c.manquants).toEqual([])
		expect(c.actif).toBe(true)
		expect(c.publiable).toBe(true)
		expect(c.interne).toBe(false)
		expect(c.conditions).toEqual(ALL)
		expect(c.entierementVide).toBe(false)
	})

	test('U03 actif needs a picture, a usable city and a speciality', () => {
		const gaps: ProfileFields[] = [
			{ main_picture: { data: null } },
			{ main_picture: null },
			{ city: 'France' },
			{ city: '  ' },
			{ speciality: '' },
			{ speciality: null },
		]
		for (const gap of gaps) {
			const c = completeness({ ...full, ...gap })
			expect(c.actif).toBe(false)
			expect(c.publiable).toBe(false)
		}
		// each of the three, and nothing else
		expect(completeness({ ...full, main_picture: null }).conditions).toEqual({ ...ALL, photoPrincipale: false })
		expect(completeness({ ...full, city: 'France' }).conditions).toEqual({ ...ALL, villeExploitable: false })
		expect(completeness({ ...full, speciality: '' }).conditions).toEqual({ ...ALL, specialite: false })
		// the three alone: actif, not publiable
		const threeOnly = completeness({ main_picture: { id: 1 }, city: 'Annecy', speciality: 'Mariage' })
		expect(threeOnly.actif).toBe(true)
		expect(threeOnly.publiable).toBe(false)
	})

	test('U04 publiable needs an offer with a numeric price', () => {
		const withValue = (service_offers: ProfileFields['service_offers']) => completeness({ ...full, service_offers })
		expect(withValue([{ price: 'Sur devis' }]).publiable).toBe(false)
		expect(withValue([{ price: 'Sur devis' }]).actif).toBe(true)
		expect(withValue([{ price: 'Sur devis' }]).manquants).toEqual([])
		expect(withValue([]).publiable).toBe(false)
		expect(withValue(null).publiable).toBe(false)
		expect(withValue([null, { price: null }, {}]).publiable).toBe(false)
		expect(withValue([{ price: 'Sur devis' }, { price: '80€' }]).publiable).toBe(true)
		expect(withValue([{ price: 'Sur devis' }]).conditions).toEqual({ ...ALL, offreChiffree: false })
	})

	test('U05 description of 200 characters at least, edge spaces ignored', () => {
		const withValue = (description: string) => completeness({ ...full, description })
		expect(DESCRIPTION_MIN).toBe(200)
		expect(withValue('a'.repeat(199)).publiable).toBe(false)
		expect(withValue('a'.repeat(200)).publiable).toBe(true)
		expect(withValue(`   ${'a'.repeat(199)}   `).publiable).toBe(false)
		expect(withValue(`   ${'a'.repeat(200)}   `).publiable).toBe(true)
		expect(descriptionLength(`a${' '.repeat(50)}b`)).toBe(3)
		expect(descriptionLength(`   ${'a'.repeat(199)}   `)).toBe(199)
		expect(descriptionLength(null)).toBe(0)
		// a short description still counts for the bar
		expect(withValue('a'.repeat(199)).manquants).toEqual([])
		expect(withValue('a'.repeat(199)).conditions).toEqual({ ...ALL, descriptionLongue: false })
	})

	test('U06 publiable needs a contact channel; the quote form is none', () => {
		const withoutChannel: ProfileFields = { ...full, network: { instagram: '', email: null } }
		const c = completeness(withoutChannel)
		expect(c.publiable).toBe(false)
		expect(c.actif).toBe(true)
		expect(c.manquants).toEqual(['reseaux'])
		expect(c.conditions).toEqual({ ...ALL, canalDeContact: false })
		expect(completeness({ ...full, network: null }).publiable).toBe(false)
		// the option is off unless a caller turns it on, and no caller does
		expect(completeness(withoutChannel, {}).publiable).toBe(false)
		expect(completeness(withoutChannel, { formulaireDevis: false }).publiable).toBe(false)
		expect(completeness(withoutChannel, { formulaireDevis: undefined }).publiable).toBe(false)
	})

	test('the quote form option of the old site: still read, never one of the six conditions', () => {
		const withoutChannel: ProfileFields = { ...full, network: { instagram: '', email: null } }
		const withForm = completeness(withoutChannel, { formulaireDevis: true })
		expect(withForm.publiable).toBe(true)
		expect(withForm.manquants).toEqual(['reseaux'])
		expect(withForm.conditions.canalDeContact).toBe(false)
		// a profile without anything stays entirely empty, whatever the option
		expect(completeness({}, { formulaireDevis: true }).entierementVide).toBe(true)
		expect(completeness({}, { formulaireDevis: true }).publiable).toBe(false)
	})

	test('U07 an internal account is never publiable', () => {
		const c = completeness({ ...full, speciality: 'CEO/CTO My Makeup' })
		expect(c.interne).toBe(true)
		expect(c.actif).toBe(true)
		expect(c.publiable).toBe(false)
		expect(c.conditions).toEqual(ALL)
		expect(completeness({ ...full, speciality: 'CEO/CTO My Makeup' }, { formulaireDevis: true }).publiable).toBe(false)
		expect(completeness({ ...full, speciality: 'Maquillage mariée' }).interne).toBe(false)
		for (const speciality of [
			'ceo',
			'CTO',
			'Fondatrice & CEO',
			'My Makeup',
			'my-makeup',
			'MyMakeup',
			'Équipe My Make-Up',
		]) {
			expect(isInternal({ speciality }), speciality).toBe(true)
		}
		for (const speciality of ['Maquillage', 'Octobre rose', 'Maquilleuse (makeup artist)', '', null]) {
			expect(isInternal({ speciality }), String(speciality)).toBe(false)
		}
		expect(isInternal(null)).toBe(false)
		expect(isInternal(undefined)).toBe(false)
	})

	// the steps of the progress bar: it shows Math.round(100 / 13 * score)
	test('names alone: 1/13 (both needed), a short description counts for the bar', () => {
		const names: ProfileFields = { first_name: 'Al', last_name: 'Bo' }
		expect(completeness(names).score).toBe(1)
		expect(completeness(names).manquants).toEqual(CRITERIA.slice(1))
		expect(completeness({ first_name: 'Al' }).score).toBe(0)
		expect(completeness({ last_name: 'Bo' }).score).toBe(0)
		expect(completeness({ first_name: 'Al', last_name: '  ' }).score).toBe(0)
		// under the 200 characters of `publiable`, still one criterion
		const short = completeness({ ...names, description: 'x' })
		expect(short.score).toBe(2)
		expect(short.publiable).toBe(false)
		expect(completeness({ ...names, description: '   ' }).score).toBe(1)
	})

	test('everything but the gallery: 12/13, only « galerie » missing', () => {
		const galleries: ProfileFields['image_gallery'][] = [{ data: [] }, { data: null }, [], null]
		for (const image_gallery of galleries) {
			const c = completeness({ ...full, image_gallery })
			expect(c.score).toBe(12)
			expect(c.manquants).toEqual(['galerie'])
			// the gallery is not a rule of `publiable`
			expect(c.publiable).toBe(true)
		}
	})

	test('U08 shared JSON cases: same score and flags as on the old site', () => {
		expect(casPartages.cas.length).toBeGreaterThanOrEqual(10)
		for (const { nom: name, profil: profile, options, attendu: expected } of casPartages.cas) {
			const { score, actif: active, publiable: publishable, interne: internal } = completeness(profile, options)
			expect({ score, actif: active, publiable: publishable, interne: internal }, `cas « ${name} »`).toEqual(expected)
		}
	})

	test('U08 shared JSON cases: same missing criteria as the code of the old site computed', () => {
		const reference = ancienSite.partages.cas
		expect(reference.map(cas => cas.nom)).toEqual(casPartages.cas.map(cas => cas.nom))
		for (const [i, { nom: name, profil: profile, options }] of casPartages.cas.entries()) {
			const front = reference[i]?.front
			if (front === undefined) throw new Error(`no reference for « ${name} »`)
			expect(asOldFront(profile, options), `cas « ${name} »`).toEqual(front)
		}
	})

	test('U08 shared JSON cases: the six conditions the old API read, entirely empty or not', () => {
		for (const [i, { nom: name, profil: profile, options }] of casPartages.cas.entries()) {
			const api = ancienSite.partages.cas[i]?.api
			if (api === undefined) throw new Error(`no reference for « ${name} »`)
			const c = completeness(profile, options)
			expect(c.conditions, `cas « ${name} »`).toEqual(sinceOldApi(api))
			expect(c.entierementVide, `cas « ${name} »`).toBe(api.entirelyEmpty)
		}
	})
})

describe('the six conditions and the entirely empty profile (cases of the old API)', () => {
	const testCase = ancienSite.api.cas

	test('each case: same conditions, same « entirely empty », same score and flags as the old site', () => {
		expect(testCase.length).toBeGreaterThanOrEqual(15)
		for (const { nom: name, profil: profile, front, api } of testCase) {
			expect(publishableConditions(profile), `cas « ${name} »`).toEqual(sinceOldApi(api))
			expect(isFullyEmpty(profile), `cas « ${name} »`).toBe(api.entirelyEmpty)
			expect(completeness(profile).entierementVide, `cas « ${name} »`).toBe(api.entirelyEmpty)
			expect(completeness(profile).conditions, `cas « ${name} »`).toEqual(sinceOldApi(api))
			expect(asOldFront(profile), `cas « ${name} »`).toEqual(front)
		}
	})

	test('nothing at all: none of the six conditions, entirely empty', () => {
		for (const profile of [{}, null, undefined]) {
			expect(publishableConditions(profile)).toEqual(NONE)
			expect(isFullyEmpty(profile)).toBe(true)
		}
	})

	test('a name alone, or everything that is not one of the six conditions: entirely empty', () => {
		expect(isFullyEmpty({ first_name: 'Prenom', last_name: 'Nom' })).toBe(true)
		const withoutCondition: ProfileFields = {
			first_name: 'Prenom',
			last_name: 'Nom',
			company_artist_name: 'Studio Fictif',
			image_gallery: [{ id: 2 }],
			skills: [{ id: 1 }],
			experiences: [{ id: 1 }],
			courses: [{ id: 1 }],
			language: [{ id: 1 }],
		}
		expect(completeness(withoutCondition).score).toBe(7)
		expect(completeness(withoutCondition).entierementVide).toBe(true)
	})

	test('just under each condition: entirely empty', () => {
		const almost: ProfileFields = {
			speciality: '   ',
			city: 'France',
			description: 'a'.repeat(199),
			main_picture: null,
			service_offers: [{ price: 'Sur devis' }, { price: '2' }, { price: '12 000 €' }, { price: null }, null],
			network: { instagram: ' ', email: '', phone: null },
		}
		expect(publishableConditions(almost)).toEqual(NONE)
		expect(isFullyEmpty(almost)).toBe(true)
		expect(isFullyEmpty({ ...almost, city: '9 impasse des Essais Fictifs' })).toBe(true)
	})

	test('one condition alone is enough not to be entirely empty', () => {
		const only: [keyof PublishableConditions, ProfileFields][] = [
			['offreChiffree', { service_offers: [{ price: 'Sur devis' }, { price: '80€' }] }],
			['descriptionLongue', { description: 'a'.repeat(200) }],
			['photoPrincipale', { main_picture: { id: 1, url: '/m/1.webp' } }],
			['canalDeContact', { network: { phone: '0600000000' } }],
			['villeExploitable', { city: 'Annecy' }],
			['specialite', { speciality: 'Mariage' }],
		]
		expect(Object.keys(NONE).sort()).toEqual(only.map(([condition]) => condition).sort())
		for (const [condition, data] of only) {
			const profile: ProfileFields = { first_name: 'Prenom', ...data }
			expect(publishableConditions(profile), condition).toEqual({ ...NONE, [condition]: true })
			expect(isFullyEmpty(profile), condition).toBe(false)
			const c = completeness(profile)
			expect(c.entierementVide, condition).toBe(false)
			expect(c.publiable, condition).toBe(false)
		}
	})

	test('usable city: read on the public city, an address counts by its commune', () => {
		expect(publishableConditions({ city: '12 rue des Essais Fictifs, 74000 Annecy' }).villeExploitable).toBe(true)
		expect(publishableConditions({ city: '9 impasse des Essais Fictifs' }).villeExploitable).toBe(false)
		expect(publishableConditions({ city: '74 et alentours' }).villeExploitable).toBe(false)
	})

	test('publiable is the six conditions together, and no internal account', () => {
		const conditions = Object.keys(ALL) as (keyof PublishableConditions)[]
		const without: Record<keyof PublishableConditions, ProfileFields> = {
			photoPrincipale: { main_picture: null },
			villeExploitable: { city: 'France' },
			specialite: { speciality: null },
			offreChiffree: { service_offers: [{ price: 'Sur devis' }] },
			descriptionLongue: { description: 'a'.repeat(199) },
			canalDeContact: { network: null },
		}
		for (const condition of conditions) {
			const c = completeness({ ...full, ...without[condition] })
			expect(c.conditions, condition).toEqual({ ...ALL, [condition]: false })
			expect(c.publiable, condition).toBe(false)
			expect(c.entierementVide, condition).toBe(false)
		}
	})

	test('a commune named like a type of street is a usable city, as on the old front (the old API refused it)', () => {
		expect(ancienSite.ecarts.cas.length).toBeGreaterThanOrEqual(5)
		for (const { nom: name, profil: profile, front, api, villeExploitableFront: usableCityFront } of ancienSite.ecarts
			.cas) {
			expect(usableCityFront, name).toBe(true)
			expect(api.usableCity, name).toBe(false)
			expect(usableCity(profile.city), name).toBe(true)
			expect(asOldFront(profile), name).toEqual(front)
			expect(publishableConditions(profile), name).toEqual({ ...NONE, villeExploitable: true })
			expect(isFullyEmpty(profile), name).toBe(false)
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
			// a postal address counts by its commune or its postal code
			'12 rue des Lilas 74000 Annecy',
			'12, avenue des Essais, 75011 Paris',
			'3 Place des Essais Thonon-les-Bains',
			'12 rue des Essais 74000',
		]) {
			expect(usableCity(v), v).toBe(true)
		}
		for (const v of [
			'',
			'   ',
			'France',
			'FRANCE',
			'null',
			'fr',
			'Toute la France',
			'Partout en France',
			'Europe',
			// an address without a commune nor a postal code
			'3 avenue X',
			'12 rue Victor Hugo',
			// a street glued to the commune: the commune cannot be told apart
			'Annecy,rue des Essais',
			'Annecy.rue des Essais',
			'Annecy-rue des Essais',
			// a number that is no postal code, then text
			'74 et alentours',
			'12',
			// more than six words: a sentence
			'Annecy et toutes les communes des alentours proches',
			null,
			undefined,
			42,
		]) {
			expect(usableCity(v), String(v)).toBe(false)
		}
	})

	test('a complete profile whose city is a postal address is publiable', () => {
		for (const city of [
			'12 rue des Essais Fictifs 74000 Annecy',
			'7 IMPASSE DES ESSAIS, 74200 THONON-LES-BAINS, FRANCE',
			'Annecy 74000',
		]) {
			const c = completeness({ ...full, city })
			expect(c.actif, city).toBe(true)
			expect(c.publiable, city).toBe(true)
			expect(c.score, city).toBe(13)
		}
		for (const city of ['3 avenue des Essais', 'Annecy,rue des Essais']) {
			const c = completeness({ ...full, city })
			expect(c.actif, city).toBe(false)
			expect(c.publiable, city).toBe(false)
			// the field is filled: it still counts for the bar
			expect(c.score, city).toBe(13)
		}
	})

	test('numeric price read in the text, from 5 to 10 000', () => {
		expect(numericPrice('80€')).toBe(80)
		expect(numericPrice('à partir de 82,50 €')).toBe(82.5)
		expect(numericPrice('1 200 €')).toBe(1200)
		expect(numericPrice('1\u00a0200 €')).toBe(1200)
		expect(numericPrice('1\u202f200 €')).toBe(1200)
		expect(numericPrice('Sur devis')).toBeNull()
		expect(numericPrice('2')).toBeNull()
		expect(numericPrice(null)).toBeNull()
		expect(numericPrice('')).toBeNull()
		// the bounds
		expect(numericPrice('4,99')).toBeNull()
		expect(numericPrice('5')).toBe(5)
		expect(numericPrice('10 000 €')).toBe(10000)
		expect(numericPrice('10 001 €')).toBeNull()
		// a number stored as such is no text price
		expect(numericPrice(80)).toBeNull()
	})

	test('a media of the old API and a flat one', () => {
		expect(aMedia({ data: null })).toBe(false)
		expect(aMedia({ data: [] })).toBe(false)
		expect(aMedia({ data: { id: 1 } })).toBe(true)
		expect(aMedia({ data: [{ id: 1 }] })).toBe(true)
		expect(aMedia([])).toBe(false)
		expect(aMedia([{ id: 1 }])).toBe(true)
		expect(aMedia({ id: 1, url: '/x.jpg' })).toBe(true)
		expect(aMedia(null)).toBe(false)
		expect(aMedia(undefined)).toBe(false)
	})

	test('a bare id is no picture: the caller gives the document or a list', () => {
		expect(aMedia(7)).toBe(false)
		expect(aMedia('7')).toBe(false)
		expect(aMedia(true)).toBe(false)
		// @ts-expect-error the type refuses a bare id as a picture
		const withIdentifier: ProfileFields = { ...full, main_picture: 7 }
		const c = completeness(withIdentifier)
		expect(c.conditions.photoPrincipale).toBe(false)
		expect(c.manquants).toEqual(['photo'])
		expect(c.actif).toBe(false)
	})

	test('contact channel: one filled field of the network', () => {
		expect(hasContactChannel({ instagram: '', email: null })).toBe(false)
		expect(hasContactChannel({ instagram: '   ' })).toBe(false)
		expect(hasContactChannel({})).toBe(false)
		expect(hasContactChannel(null)).toBe(false)
		expect(hasContactChannel(undefined)).toBe(false)
		expect(CHANNELS).toEqual(['youtube', 'instagram', 'facebook', 'website', 'linkedin', 'phone', 'email'])
		for (const channel of CHANNELS) {
			expect(hasContactChannel({ [channel]: 'fictif' }), channel).toBe(true)
			expect(completeness({ network: { [channel]: 'fictif' } }).manquants, channel).not.toContain('reseaux')
		}
	})

	test('a text as compared: lower case, no accents, single spaces', () => {
		expect(normalize('  Thônes   LES  Bains ')).toBe('thones les bains')
		expect(normalize('Évian')).toBe('evian')
		expect(normalize(null)).toBe('')
		expect(normalize(42)).toBe('')
	})

	test('values of another type than expected count as missing, without an error', () => {
		// what a JSON document of unknown origin may hold
		const doubtful: unknown = JSON.parse(
			'{"first_name":42,"last_name":{},"speciality":7,"city":["Annecy"],"description":200,"main_picture":7,"image_gallery":"x","skills":"x","experiences":{"length":2},"courses":3,"service_offers":"x","network":"instagram","language":true}'
		)
		const c = completeness(doubtful as ProfileFields)
		expect(c.score).toBe(0)
		expect(c.manquants).toEqual([...CRITERIA])
		expect(c.entierementVide).toBe(true)
		const offers: unknown = JSON.parse('{"service_offers":["offre",12,null,{"price":80},{"price":"80 €"}]}')
		expect(publishableConditions(offers as ProfileFields)).toEqual({ ...NONE, offreChiffree: true })
	})
})

describe('devientPubliable (the « profile_publiable » event)', () => {
	// one criterion short: a description of 199 characters
	const almost: ProfileFields = { ...full, description: 'a'.repeat(199) }
	const incomplete: ProfileFields = { ...full, description: '', main_picture: null }

	test('the save that completes the last criterion: true', () => {
		expect(becomesPublishable(almost, { ...almost, description: 'a'.repeat(200) })).toBe(true)
		expect(becomesPublishable(almost, full)).toBe(true)
	})

	test('complete to complete, incomplete to incomplete, complete to incomplete: false', () => {
		expect(becomesPublishable(full, { ...full, city: 'Lyon' })).toBe(false)
		expect(becomesPublishable(incomplete, { ...incomplete, description: 'Bonjour' })).toBe(false)
		expect(becomesPublishable(almost, almost)).toBe(false)
		// a loss is never counted as a profile that became publiable
		expect(becomesPublishable(full, almost)).toBe(false)
		expect(becomesPublishable(full, { ...full, service_offers: [] })).toBe(false)
		expect(becomesPublishable(null, undefined)).toBe(false)
		// an internal account never becomes publiable
		const internal: ProfileFields = { ...almost, speciality: 'CEO/CTO My Makeup' }
		expect(becomesPublishable(internal, { ...internal, description: DESCRIPTION })).toBe(false)
	})

	test('without a contact channel she does not become publiable; the quote form option is off', () => {
		const withoutChannel: ProfileFields = { ...almost, network: { instagram: '' } }
		const after: ProfileFields = { ...withoutChannel, description: 'a'.repeat(200) }
		expect(becomesPublishable(withoutChannel, after)).toBe(false)
		expect(becomesPublishable(withoutChannel, after, { formulaireDevis: false })).toBe(false)
		// as on the old site when the option is turned on
		expect(becomesPublishable(withoutChannel, after, { formulaireDevis: true })).toBe(true)
	})
})
