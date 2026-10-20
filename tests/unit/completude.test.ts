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
import ancienSite from './fixtures/completude-ancien-site.json'
import casPartages from './fixtures/completude-cas.json'

// Ported from tests/unit/completude.test.mjs of the old site (branch main) and from
// tests/unit/profile-conditions.test.js of the old API: same cases, same expected values.
// Fictional values only.

const DESCRIPTION = 'Maquilleuse professionnelle. '.repeat(8)

// made-up complete profile (media of the old API, in `{ data }`)
const complet: ProfileFields = {
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

const AUCUNE: PublishableConditions = {
	photoPrincipale: false,
	villeExploitable: false,
	specialite: false,
	offreChiffree: false,
	descriptionLongue: false,
	canalDeContact: false,
}

const TOUTES: PublishableConditions = {
	photoPrincipale: true,
	villeExploitable: true,
	specialite: true,
	offreChiffree: true,
	descriptionLongue: true,
	canalDeContact: true,
}

/** The six conditions as the old API names them, under the names of the v3 */
const depuisAncienneApi = (api: {
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
interface ResultatAncienFront {
	score: number
	sur: number
	manquants: string[]
	actif: boolean
	publiable: boolean
	interne: boolean
}

/** The result without what the v3 adds, to compare with the old front */
const commeAncienFront = (
	profil: ProfileFields | null | undefined,
	options?: { formulaireDevis?: boolean }
): ResultatAncienFront => {
	const { score, sur, manquants, actif, publiable, interne } = completeness(profil, options)
	return { score, sur, manquants, actif, publiable, interne }
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
		expect(c.conditions).toEqual(AUCUNE)
		expect(c.entierementVide).toBe(true)
		expect(completeness(null).score).toBe(0)
		expect(completeness(null).entierementVide).toBe(true)
		expect(completeness(undefined).publiable).toBe(false)
	})

	test('U02 complete profile: 13/13, actif and publiable', () => {
		const c = completeness(complet)
		expect(c.score).toBe(13)
		expect(c.manquants).toEqual([])
		expect(c.actif).toBe(true)
		expect(c.publiable).toBe(true)
		expect(c.interne).toBe(false)
		expect(c.conditions).toEqual(TOUTES)
		expect(c.entierementVide).toBe(false)
	})

	test('U03 actif needs a picture, a usable city and a speciality', () => {
		const manques: ProfileFields[] = [
			{ main_picture: { data: null } },
			{ main_picture: null },
			{ city: 'France' },
			{ city: '  ' },
			{ speciality: '' },
			{ speciality: null },
		]
		for (const manque of manques) {
			const c = completeness({ ...complet, ...manque })
			expect(c.actif).toBe(false)
			expect(c.publiable).toBe(false)
		}
		// each of the three, and nothing else
		expect(completeness({ ...complet, main_picture: null }).conditions).toEqual({ ...TOUTES, photoPrincipale: false })
		expect(completeness({ ...complet, city: 'France' }).conditions).toEqual({ ...TOUTES, villeExploitable: false })
		expect(completeness({ ...complet, speciality: '' }).conditions).toEqual({ ...TOUTES, specialite: false })
		// the three alone: actif, not publiable
		const troisSeules = completeness({ main_picture: { id: 1 }, city: 'Annecy', speciality: 'Mariage' })
		expect(troisSeules.actif).toBe(true)
		expect(troisSeules.publiable).toBe(false)
	})

	test('U04 publiable needs an offer with a numeric price', () => {
		const avec = (service_offers: ProfileFields['service_offers']) => completeness({ ...complet, service_offers })
		expect(avec([{ price: 'Sur devis' }]).publiable).toBe(false)
		expect(avec([{ price: 'Sur devis' }]).actif).toBe(true)
		expect(avec([{ price: 'Sur devis' }]).manquants).toEqual([])
		expect(avec([]).publiable).toBe(false)
		expect(avec(null).publiable).toBe(false)
		expect(avec([null, { price: null }, {}]).publiable).toBe(false)
		expect(avec([{ price: 'Sur devis' }, { price: '80€' }]).publiable).toBe(true)
		expect(avec([{ price: 'Sur devis' }]).conditions).toEqual({ ...TOUTES, offreChiffree: false })
	})

	test('U05 description of 200 characters at least, edge spaces ignored', () => {
		const avec = (description: string) => completeness({ ...complet, description })
		expect(DESCRIPTION_MIN).toBe(200)
		expect(avec('a'.repeat(199)).publiable).toBe(false)
		expect(avec('a'.repeat(200)).publiable).toBe(true)
		expect(avec(`   ${'a'.repeat(199)}   `).publiable).toBe(false)
		expect(avec(`   ${'a'.repeat(200)}   `).publiable).toBe(true)
		expect(descriptionLength(`a${' '.repeat(50)}b`)).toBe(3)
		expect(descriptionLength(`   ${'a'.repeat(199)}   `)).toBe(199)
		expect(descriptionLength(null)).toBe(0)
		// a short description still counts for the bar
		expect(avec('a'.repeat(199)).manquants).toEqual([])
		expect(avec('a'.repeat(199)).conditions).toEqual({ ...TOUTES, descriptionLongue: false })
	})

	test('U06 publiable needs a contact channel; the quote form is none', () => {
		const sansCanal: ProfileFields = { ...complet, network: { instagram: '', email: null } }
		const c = completeness(sansCanal)
		expect(c.publiable).toBe(false)
		expect(c.actif).toBe(true)
		expect(c.manquants).toEqual(['reseaux'])
		expect(c.conditions).toEqual({ ...TOUTES, canalDeContact: false })
		expect(completeness({ ...complet, network: null }).publiable).toBe(false)
		// the option is off unless a caller turns it on, and no caller does
		expect(completeness(sansCanal, {}).publiable).toBe(false)
		expect(completeness(sansCanal, { formulaireDevis: false }).publiable).toBe(false)
		expect(completeness(sansCanal, { formulaireDevis: undefined }).publiable).toBe(false)
	})

	test('the quote form option of the old site: still read, never one of the six conditions', () => {
		const sansCanal: ProfileFields = { ...complet, network: { instagram: '', email: null } }
		const avecFormulaire = completeness(sansCanal, { formulaireDevis: true })
		expect(avecFormulaire.publiable).toBe(true)
		expect(avecFormulaire.manquants).toEqual(['reseaux'])
		expect(avecFormulaire.conditions.canalDeContact).toBe(false)
		// a profile without anything stays entirely empty, whatever the option
		expect(completeness({}, { formulaireDevis: true }).entierementVide).toBe(true)
		expect(completeness({}, { formulaireDevis: true }).publiable).toBe(false)
	})

	test('U07 an internal account is never publiable', () => {
		const c = completeness({ ...complet, speciality: 'CEO/CTO My Makeup' })
		expect(c.interne).toBe(true)
		expect(c.actif).toBe(true)
		expect(c.publiable).toBe(false)
		expect(c.conditions).toEqual(TOUTES)
		expect(completeness({ ...complet, speciality: 'CEO/CTO My Makeup' }, { formulaireDevis: true }).publiable).toBe(
			false
		)
		expect(completeness({ ...complet, speciality: 'Maquillage mariée' }).interne).toBe(false)
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
		const noms: ProfileFields = { first_name: 'Al', last_name: 'Bo' }
		expect(completeness(noms).score).toBe(1)
		expect(completeness(noms).manquants).toEqual(CRITERIA.slice(1))
		expect(completeness({ first_name: 'Al' }).score).toBe(0)
		expect(completeness({ last_name: 'Bo' }).score).toBe(0)
		expect(completeness({ first_name: 'Al', last_name: '  ' }).score).toBe(0)
		// under the 200 characters of `publiable`, still one criterion
		const courte = completeness({ ...noms, description: 'x' })
		expect(courte.score).toBe(2)
		expect(courte.publiable).toBe(false)
		expect(completeness({ ...noms, description: '   ' }).score).toBe(1)
	})

	test('everything but the gallery: 12/13, only « galerie » missing', () => {
		const galeries: ProfileFields['image_gallery'][] = [{ data: [] }, { data: null }, [], null]
		for (const image_gallery of galeries) {
			const c = completeness({ ...complet, image_gallery })
			expect(c.score).toBe(12)
			expect(c.manquants).toEqual(['galerie'])
			// the gallery is not a rule of `publiable`
			expect(c.publiable).toBe(true)
		}
	})

	test('U08 shared JSON cases: same score and flags as on the old site', () => {
		expect(casPartages.cas.length).toBeGreaterThanOrEqual(10)
		for (const { nom, profil, options, attendu } of casPartages.cas) {
			const { score, actif, publiable, interne } = completeness(profil, options)
			expect({ score, actif, publiable, interne }, `cas « ${nom} »`).toEqual(attendu)
		}
	})

	test('U08 shared JSON cases: same missing criteria as the code of the old site computed', () => {
		const reference = ancienSite.partages.cas
		expect(reference.map(cas => cas.nom)).toEqual(casPartages.cas.map(cas => cas.nom))
		for (const [i, { nom, profil, options }] of casPartages.cas.entries()) {
			const front = reference[i]?.front
			if (front === undefined) throw new Error(`no reference for « ${nom} »`)
			expect(commeAncienFront(profil, options), `cas « ${nom} »`).toEqual(front)
		}
	})

	test('U08 shared JSON cases: the six conditions the old API read, entirely empty or not', () => {
		for (const [i, { nom, profil, options }] of casPartages.cas.entries()) {
			const api = ancienSite.partages.cas[i]?.api
			if (api === undefined) throw new Error(`no reference for « ${nom} »`)
			const c = completeness(profil, options)
			expect(c.conditions, `cas « ${nom} »`).toEqual(depuisAncienneApi(api))
			expect(c.entierementVide, `cas « ${nom} »`).toBe(api.entirelyEmpty)
		}
	})
})

describe('the six conditions and the entirely empty profile (cases of the old API)', () => {
	const cas = ancienSite.api.cas

	test('each case: same conditions, same « entirely empty », same score and flags as the old site', () => {
		expect(cas.length).toBeGreaterThanOrEqual(15)
		for (const { nom, profil, front, api } of cas) {
			expect(publishableConditions(profil), `cas « ${nom} »`).toEqual(depuisAncienneApi(api))
			expect(isFullyEmpty(profil), `cas « ${nom} »`).toBe(api.entirelyEmpty)
			expect(completeness(profil).entierementVide, `cas « ${nom} »`).toBe(api.entirelyEmpty)
			expect(completeness(profil).conditions, `cas « ${nom} »`).toEqual(depuisAncienneApi(api))
			expect(commeAncienFront(profil), `cas « ${nom} »`).toEqual(front)
		}
	})

	test('nothing at all: none of the six conditions, entirely empty', () => {
		for (const profil of [{}, null, undefined]) {
			expect(publishableConditions(profil)).toEqual(AUCUNE)
			expect(isFullyEmpty(profil)).toBe(true)
		}
	})

	test('a name alone, or everything that is not one of the six conditions: entirely empty', () => {
		expect(isFullyEmpty({ first_name: 'Prenom', last_name: 'Nom' })).toBe(true)
		const sansCondition: ProfileFields = {
			first_name: 'Prenom',
			last_name: 'Nom',
			company_artist_name: 'Studio Fictif',
			image_gallery: [{ id: 2 }],
			skills: [{ id: 1 }],
			experiences: [{ id: 1 }],
			courses: [{ id: 1 }],
			language: [{ id: 1 }],
		}
		expect(completeness(sansCondition).score).toBe(7)
		expect(completeness(sansCondition).entierementVide).toBe(true)
	})

	test('just under each condition: entirely empty', () => {
		const presque: ProfileFields = {
			speciality: '   ',
			city: 'France',
			description: 'a'.repeat(199),
			main_picture: null,
			service_offers: [{ price: 'Sur devis' }, { price: '2' }, { price: '12 000 €' }, { price: null }, null],
			network: { instagram: ' ', email: '', phone: null },
		}
		expect(publishableConditions(presque)).toEqual(AUCUNE)
		expect(isFullyEmpty(presque)).toBe(true)
		expect(isFullyEmpty({ ...presque, city: '9 impasse des Essais Fictifs' })).toBe(true)
	})

	test('one condition alone is enough not to be entirely empty', () => {
		const seules: [keyof PublishableConditions, ProfileFields][] = [
			['offreChiffree', { service_offers: [{ price: 'Sur devis' }, { price: '80€' }] }],
			['descriptionLongue', { description: 'a'.repeat(200) }],
			['photoPrincipale', { main_picture: { id: 1, url: '/m/1.webp' } }],
			['canalDeContact', { network: { phone: '0600000000' } }],
			['villeExploitable', { city: 'Annecy' }],
			['specialite', { speciality: 'Mariage' }],
		]
		expect(Object.keys(AUCUNE).sort()).toEqual(seules.map(([condition]) => condition).sort())
		for (const [condition, donnees] of seules) {
			const profil: ProfileFields = { first_name: 'Prenom', ...donnees }
			expect(publishableConditions(profil), condition).toEqual({ ...AUCUNE, [condition]: true })
			expect(isFullyEmpty(profil), condition).toBe(false)
			const c = completeness(profil)
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
		const conditions = Object.keys(TOUTES) as (keyof PublishableConditions)[]
		const sans: Record<keyof PublishableConditions, ProfileFields> = {
			photoPrincipale: { main_picture: null },
			villeExploitable: { city: 'France' },
			specialite: { speciality: null },
			offreChiffree: { service_offers: [{ price: 'Sur devis' }] },
			descriptionLongue: { description: 'a'.repeat(199) },
			canalDeContact: { network: null },
		}
		for (const condition of conditions) {
			const c = completeness({ ...complet, ...sans[condition] })
			expect(c.conditions, condition).toEqual({ ...TOUTES, [condition]: false })
			expect(c.publiable, condition).toBe(false)
			expect(c.entierementVide, condition).toBe(false)
		}
	})

	test('a commune named like a type of street is a usable city, as on the old front (the old API refused it)', () => {
		expect(ancienSite.ecarts.cas.length).toBeGreaterThanOrEqual(5)
		for (const { nom, profil, front, api, villeExploitableFront } of ancienSite.ecarts.cas) {
			expect(villeExploitableFront, nom).toBe(true)
			expect(api.usableCity, nom).toBe(false)
			expect(usableCity(profil.city), nom).toBe(true)
			expect(commeAncienFront(profil), nom).toEqual(front)
			expect(publishableConditions(profil), nom).toEqual({ ...AUCUNE, villeExploitable: true })
			expect(isFullyEmpty(profil), nom).toBe(false)
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
			const c = completeness({ ...complet, city })
			expect(c.actif, city).toBe(true)
			expect(c.publiable, city).toBe(true)
			expect(c.score, city).toBe(13)
		}
		for (const city of ['3 avenue des Essais', 'Annecy,rue des Essais']) {
			const c = completeness({ ...complet, city })
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
		const avecIdentifiant: ProfileFields = { ...complet, main_picture: 7 }
		const c = completeness(avecIdentifiant)
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
		for (const canal of CHANNELS) {
			expect(hasContactChannel({ [canal]: 'fictif' }), canal).toBe(true)
			expect(completeness({ network: { [canal]: 'fictif' } }).manquants, canal).not.toContain('reseaux')
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
		const douteux: unknown = JSON.parse(
			'{"first_name":42,"last_name":{},"speciality":7,"city":["Annecy"],"description":200,"main_picture":7,"image_gallery":"x","skills":"x","experiences":{"length":2},"courses":3,"service_offers":"x","network":"instagram","language":true}'
		)
		const c = completeness(douteux as ProfileFields)
		expect(c.score).toBe(0)
		expect(c.manquants).toEqual([...CRITERIA])
		expect(c.entierementVide).toBe(true)
		const offres: unknown = JSON.parse('{"service_offers":["offre",12,null,{"price":80},{"price":"80 €"}]}')
		expect(publishableConditions(offres as ProfileFields)).toEqual({ ...AUCUNE, offreChiffree: true })
	})
})

describe('devientPubliable (the « profile_publiable » event)', () => {
	// one criterion short: a description of 199 characters
	const presque: ProfileFields = { ...complet, description: 'a'.repeat(199) }
	const incomplet: ProfileFields = { ...complet, description: '', main_picture: null }

	test('the save that completes the last criterion: true', () => {
		expect(becomesPublishable(presque, { ...presque, description: 'a'.repeat(200) })).toBe(true)
		expect(becomesPublishable(presque, complet)).toBe(true)
	})

	test('complete to complete, incomplete to incomplete, complete to incomplete: false', () => {
		expect(becomesPublishable(complet, { ...complet, city: 'Lyon' })).toBe(false)
		expect(becomesPublishable(incomplet, { ...incomplet, description: 'Bonjour' })).toBe(false)
		expect(becomesPublishable(presque, presque)).toBe(false)
		// a loss is never counted as a profile that became publiable
		expect(becomesPublishable(complet, presque)).toBe(false)
		expect(becomesPublishable(complet, { ...complet, service_offers: [] })).toBe(false)
		expect(becomesPublishable(null, undefined)).toBe(false)
		// an internal account never becomes publiable
		const interne: ProfileFields = { ...presque, speciality: 'CEO/CTO My Makeup' }
		expect(becomesPublishable(interne, { ...interne, description: DESCRIPTION })).toBe(false)
	})

	test('without a contact channel she does not become publiable; the quote form option is off', () => {
		const sansCanal: ProfileFields = { ...presque, network: { instagram: '' } }
		const apres: ProfileFields = { ...sansCanal, description: 'a'.repeat(200) }
		expect(becomesPublishable(sansCanal, apres)).toBe(false)
		expect(becomesPublishable(sansCanal, apres, { formulaireDevis: false })).toBe(false)
		// as on the old site when the option is turned on
		expect(becomesPublishable(sansCanal, apres, { formulaireDevis: true })).toBe(true)
	})
})
