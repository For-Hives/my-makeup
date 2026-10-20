import { describe, expect, test } from 'bun:test'
import {
	aCanalDeContact,
	aMedia,
	CANAUX,
	type ChampsDuProfil,
	type ConditionsPubliable,
	CRITERES,
	completude,
	conditionsPubliable,
	DESCRIPTION_MIN,
	devientPubliable,
	estEntierementVide,
	estInterne,
	longueurDescription,
	normaliser,
	prixNumerique,
	villeExploitable,
} from '@/lib/profile/completude'
import ancienSite from './fixtures/completude-ancien-site.json'
import casPartages from './fixtures/completude-cas.json'

// Ported from tests/unit/completude.test.mjs of the old site (branch main) and from
// tests/unit/profile-conditions.test.js of the old API: same cases, same expected values.
// Fictional values only.

const DESCRIPTION = 'Maquilleuse professionnelle. '.repeat(8)

// made-up complete profile (media of the old API, in `{ data }`)
const complet: ChampsDuProfil = {
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

const AUCUNE: ConditionsPubliable = {
	photoPrincipale: false,
	villeExploitable: false,
	specialite: false,
	offreChiffree: false,
	descriptionLongue: false,
	canalDeContact: false,
}

const TOUTES: ConditionsPubliable = {
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
}): ConditionsPubliable => ({
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
	profil: ChampsDuProfil | null | undefined,
	options?: { formulaireDevis?: boolean }
): ResultatAncienFront => {
	const { score, sur, manquants, actif, publiable, interne } = completude(profil, options)
	return { score, sur, manquants, actif, publiable, interne }
}

describe('completude (plans/02 U01-U08)', () => {
	test('U01 empty profile: 0/13, neither actif nor publiable, 13 missing in display order', () => {
		const c = completude({})
		expect(c.score).toBe(0)
		expect(c.sur).toBe(13)
		expect(c.actif).toBe(false)
		expect(c.publiable).toBe(false)
		expect(c.manquants).toEqual([...CRITERES])
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
		expect(completude(null).score).toBe(0)
		expect(completude(null).entierementVide).toBe(true)
		expect(completude(undefined).publiable).toBe(false)
	})

	test('U02 complete profile: 13/13, actif and publiable', () => {
		const c = completude(complet)
		expect(c.score).toBe(13)
		expect(c.manquants).toEqual([])
		expect(c.actif).toBe(true)
		expect(c.publiable).toBe(true)
		expect(c.interne).toBe(false)
		expect(c.conditions).toEqual(TOUTES)
		expect(c.entierementVide).toBe(false)
	})

	test('U03 actif needs a picture, a usable city and a speciality', () => {
		const manques: ChampsDuProfil[] = [
			{ main_picture: { data: null } },
			{ main_picture: null },
			{ city: 'France' },
			{ city: '  ' },
			{ speciality: '' },
			{ speciality: null },
		]
		for (const manque of manques) {
			const c = completude({ ...complet, ...manque })
			expect(c.actif).toBe(false)
			expect(c.publiable).toBe(false)
		}
		// each of the three, and nothing else
		expect(completude({ ...complet, main_picture: null }).conditions).toEqual({ ...TOUTES, photoPrincipale: false })
		expect(completude({ ...complet, city: 'France' }).conditions).toEqual({ ...TOUTES, villeExploitable: false })
		expect(completude({ ...complet, speciality: '' }).conditions).toEqual({ ...TOUTES, specialite: false })
		// the three alone: actif, not publiable
		const troisSeules = completude({ main_picture: { id: 1 }, city: 'Annecy', speciality: 'Mariage' })
		expect(troisSeules.actif).toBe(true)
		expect(troisSeules.publiable).toBe(false)
	})

	test('U04 publiable needs an offer with a numeric price', () => {
		const avec = (service_offers: ChampsDuProfil['service_offers']) => completude({ ...complet, service_offers })
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
		const avec = (description: string) => completude({ ...complet, description })
		expect(DESCRIPTION_MIN).toBe(200)
		expect(avec('a'.repeat(199)).publiable).toBe(false)
		expect(avec('a'.repeat(200)).publiable).toBe(true)
		expect(avec(`   ${'a'.repeat(199)}   `).publiable).toBe(false)
		expect(avec(`   ${'a'.repeat(200)}   `).publiable).toBe(true)
		expect(longueurDescription(`a${' '.repeat(50)}b`)).toBe(3)
		expect(longueurDescription(`   ${'a'.repeat(199)}   `)).toBe(199)
		expect(longueurDescription(null)).toBe(0)
		// a short description still counts for the bar
		expect(avec('a'.repeat(199)).manquants).toEqual([])
		expect(avec('a'.repeat(199)).conditions).toEqual({ ...TOUTES, descriptionLongue: false })
	})

	test('U06 publiable needs a contact channel; the quote form is none', () => {
		const sansCanal: ChampsDuProfil = { ...complet, network: { instagram: '', email: null } }
		const c = completude(sansCanal)
		expect(c.publiable).toBe(false)
		expect(c.actif).toBe(true)
		expect(c.manquants).toEqual(['reseaux'])
		expect(c.conditions).toEqual({ ...TOUTES, canalDeContact: false })
		expect(completude({ ...complet, network: null }).publiable).toBe(false)
		// the option is off unless a caller turns it on, and no caller does
		expect(completude(sansCanal, {}).publiable).toBe(false)
		expect(completude(sansCanal, { formulaireDevis: false }).publiable).toBe(false)
		expect(completude(sansCanal, { formulaireDevis: undefined }).publiable).toBe(false)
	})

	test('the quote form option of the old site: still read, never one of the six conditions', () => {
		const sansCanal: ChampsDuProfil = { ...complet, network: { instagram: '', email: null } }
		const avecFormulaire = completude(sansCanal, { formulaireDevis: true })
		expect(avecFormulaire.publiable).toBe(true)
		expect(avecFormulaire.manquants).toEqual(['reseaux'])
		expect(avecFormulaire.conditions.canalDeContact).toBe(false)
		// a profile without anything stays entirely empty, whatever the option
		expect(completude({}, { formulaireDevis: true }).entierementVide).toBe(true)
		expect(completude({}, { formulaireDevis: true }).publiable).toBe(false)
	})

	test('U07 an internal account is never publiable', () => {
		const c = completude({ ...complet, speciality: 'CEO/CTO My Makeup' })
		expect(c.interne).toBe(true)
		expect(c.actif).toBe(true)
		expect(c.publiable).toBe(false)
		expect(c.conditions).toEqual(TOUTES)
		expect(completude({ ...complet, speciality: 'CEO/CTO My Makeup' }, { formulaireDevis: true }).publiable).toBe(false)
		expect(completude({ ...complet, speciality: 'Maquillage mariée' }).interne).toBe(false)
		for (const speciality of [
			'ceo',
			'CTO',
			'Fondatrice & CEO',
			'My Makeup',
			'my-makeup',
			'MyMakeup',
			'Équipe My Make-Up',
		]) {
			expect(estInterne({ speciality }), speciality).toBe(true)
		}
		for (const speciality of ['Maquillage', 'Octobre rose', 'Maquilleuse (makeup artist)', '', null]) {
			expect(estInterne({ speciality }), String(speciality)).toBe(false)
		}
		expect(estInterne(null)).toBe(false)
		expect(estInterne(undefined)).toBe(false)
	})

	// the steps of the progress bar: it shows Math.round(100 / 13 * score)
	test('names alone: 1/13 (both needed), a short description counts for the bar', () => {
		const noms: ChampsDuProfil = { first_name: 'Al', last_name: 'Bo' }
		expect(completude(noms).score).toBe(1)
		expect(completude(noms).manquants).toEqual(CRITERES.slice(1))
		expect(completude({ first_name: 'Al' }).score).toBe(0)
		expect(completude({ last_name: 'Bo' }).score).toBe(0)
		expect(completude({ first_name: 'Al', last_name: '  ' }).score).toBe(0)
		// under the 200 characters of `publiable`, still one criterion
		const courte = completude({ ...noms, description: 'x' })
		expect(courte.score).toBe(2)
		expect(courte.publiable).toBe(false)
		expect(completude({ ...noms, description: '   ' }).score).toBe(1)
	})

	test('everything but the gallery: 12/13, only « galerie » missing', () => {
		const galeries: ChampsDuProfil['image_gallery'][] = [{ data: [] }, { data: null }, [], null]
		for (const image_gallery of galeries) {
			const c = completude({ ...complet, image_gallery })
			expect(c.score).toBe(12)
			expect(c.manquants).toEqual(['galerie'])
			// the gallery is not a rule of `publiable`
			expect(c.publiable).toBe(true)
		}
	})

	test('U08 shared JSON cases: same score and flags as on the old site', () => {
		expect(casPartages.cas.length).toBeGreaterThanOrEqual(10)
		for (const { nom, profil, options, attendu } of casPartages.cas) {
			const { score, actif, publiable, interne } = completude(profil, options)
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
			const c = completude(profil, options)
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
			expect(conditionsPubliable(profil), `cas « ${nom} »`).toEqual(depuisAncienneApi(api))
			expect(estEntierementVide(profil), `cas « ${nom} »`).toBe(api.entirelyEmpty)
			expect(completude(profil).entierementVide, `cas « ${nom} »`).toBe(api.entirelyEmpty)
			expect(completude(profil).conditions, `cas « ${nom} »`).toEqual(depuisAncienneApi(api))
			expect(commeAncienFront(profil), `cas « ${nom} »`).toEqual(front)
		}
	})

	test('nothing at all: none of the six conditions, entirely empty', () => {
		for (const profil of [{}, null, undefined]) {
			expect(conditionsPubliable(profil)).toEqual(AUCUNE)
			expect(estEntierementVide(profil)).toBe(true)
		}
	})

	test('a name alone, or everything that is not one of the six conditions: entirely empty', () => {
		expect(estEntierementVide({ first_name: 'Prenom', last_name: 'Nom' })).toBe(true)
		const sansCondition: ChampsDuProfil = {
			first_name: 'Prenom',
			last_name: 'Nom',
			company_artist_name: 'Studio Fictif',
			image_gallery: [{ id: 2 }],
			skills: [{ id: 1 }],
			experiences: [{ id: 1 }],
			courses: [{ id: 1 }],
			language: [{ id: 1 }],
		}
		expect(completude(sansCondition).score).toBe(7)
		expect(completude(sansCondition).entierementVide).toBe(true)
	})

	test('just under each condition: entirely empty', () => {
		const presque: ChampsDuProfil = {
			speciality: '   ',
			city: 'France',
			description: 'a'.repeat(199),
			main_picture: null,
			service_offers: [{ price: 'Sur devis' }, { price: '2' }, { price: '12 000 €' }, { price: null }, null],
			network: { instagram: ' ', email: '', phone: null },
		}
		expect(conditionsPubliable(presque)).toEqual(AUCUNE)
		expect(estEntierementVide(presque)).toBe(true)
		expect(estEntierementVide({ ...presque, city: '9 impasse des Essais Fictifs' })).toBe(true)
	})

	test('one condition alone is enough not to be entirely empty', () => {
		const seules: [keyof ConditionsPubliable, ChampsDuProfil][] = [
			['offreChiffree', { service_offers: [{ price: 'Sur devis' }, { price: '80€' }] }],
			['descriptionLongue', { description: 'a'.repeat(200) }],
			['photoPrincipale', { main_picture: { id: 1, url: '/m/1.webp' } }],
			['canalDeContact', { network: { phone: '0600000000' } }],
			['villeExploitable', { city: 'Annecy' }],
			['specialite', { speciality: 'Mariage' }],
		]
		expect(Object.keys(AUCUNE).sort()).toEqual(seules.map(([condition]) => condition).sort())
		for (const [condition, donnees] of seules) {
			const profil: ChampsDuProfil = { first_name: 'Prenom', ...donnees }
			expect(conditionsPubliable(profil), condition).toEqual({ ...AUCUNE, [condition]: true })
			expect(estEntierementVide(profil), condition).toBe(false)
			const c = completude(profil)
			expect(c.entierementVide, condition).toBe(false)
			expect(c.publiable, condition).toBe(false)
		}
	})

	test('usable city: read on the public city, an address counts by its commune', () => {
		expect(conditionsPubliable({ city: '12 rue des Essais Fictifs, 74000 Annecy' }).villeExploitable).toBe(true)
		expect(conditionsPubliable({ city: '9 impasse des Essais Fictifs' }).villeExploitable).toBe(false)
		expect(conditionsPubliable({ city: '74 et alentours' }).villeExploitable).toBe(false)
	})

	test('publiable is the six conditions together, and no internal account', () => {
		const conditions = Object.keys(TOUTES) as (keyof ConditionsPubliable)[]
		const sans: Record<keyof ConditionsPubliable, ChampsDuProfil> = {
			photoPrincipale: { main_picture: null },
			villeExploitable: { city: 'France' },
			specialite: { speciality: null },
			offreChiffree: { service_offers: [{ price: 'Sur devis' }] },
			descriptionLongue: { description: 'a'.repeat(199) },
			canalDeContact: { network: null },
		}
		for (const condition of conditions) {
			const c = completude({ ...complet, ...sans[condition] })
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
			expect(villeExploitable(profil.city), nom).toBe(true)
			expect(commeAncienFront(profil), nom).toEqual(front)
			expect(conditionsPubliable(profil), nom).toEqual({ ...AUCUNE, villeExploitable: true })
			expect(estEntierementVide(profil), nom).toBe(false)
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
			expect(villeExploitable(v), v).toBe(true)
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
			expect(villeExploitable(v), String(v)).toBe(false)
		}
	})

	test('a complete profile whose city is a postal address is publiable', () => {
		for (const city of [
			'12 rue des Essais Fictifs 74000 Annecy',
			'7 IMPASSE DES ESSAIS, 74200 THONON-LES-BAINS, FRANCE',
			'Annecy 74000',
		]) {
			const c = completude({ ...complet, city })
			expect(c.actif, city).toBe(true)
			expect(c.publiable, city).toBe(true)
			expect(c.score, city).toBe(13)
		}
		for (const city of ['3 avenue des Essais', 'Annecy,rue des Essais']) {
			const c = completude({ ...complet, city })
			expect(c.actif, city).toBe(false)
			expect(c.publiable, city).toBe(false)
			// the field is filled: it still counts for the bar
			expect(c.score, city).toBe(13)
		}
	})

	test('numeric price read in the text, from 5 to 10 000', () => {
		expect(prixNumerique('80€')).toBe(80)
		expect(prixNumerique('à partir de 82,50 €')).toBe(82.5)
		expect(prixNumerique('1 200 €')).toBe(1200)
		expect(prixNumerique('1\u00a0200 €')).toBe(1200)
		expect(prixNumerique('1\u202f200 €')).toBe(1200)
		expect(prixNumerique('Sur devis')).toBeNull()
		expect(prixNumerique('2')).toBeNull()
		expect(prixNumerique(null)).toBeNull()
		expect(prixNumerique('')).toBeNull()
		// the bounds
		expect(prixNumerique('4,99')).toBeNull()
		expect(prixNumerique('5')).toBe(5)
		expect(prixNumerique('10 000 €')).toBe(10000)
		expect(prixNumerique('10 001 €')).toBeNull()
		// a number stored as such is no text price
		expect(prixNumerique(80)).toBeNull()
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
		const avecIdentifiant: ChampsDuProfil = { ...complet, main_picture: 7 }
		const c = completude(avecIdentifiant)
		expect(c.conditions.photoPrincipale).toBe(false)
		expect(c.manquants).toEqual(['photo'])
		expect(c.actif).toBe(false)
	})

	test('contact channel: one filled field of the network', () => {
		expect(aCanalDeContact({ instagram: '', email: null })).toBe(false)
		expect(aCanalDeContact({ instagram: '   ' })).toBe(false)
		expect(aCanalDeContact({})).toBe(false)
		expect(aCanalDeContact(null)).toBe(false)
		expect(aCanalDeContact(undefined)).toBe(false)
		expect(CANAUX).toEqual(['youtube', 'instagram', 'facebook', 'website', 'linkedin', 'phone', 'email'])
		for (const canal of CANAUX) {
			expect(aCanalDeContact({ [canal]: 'fictif' }), canal).toBe(true)
			expect(completude({ network: { [canal]: 'fictif' } }).manquants, canal).not.toContain('reseaux')
		}
	})

	test('a text as compared: lower case, no accents, single spaces', () => {
		expect(normaliser('  Thônes   LES  Bains ')).toBe('thones les bains')
		expect(normaliser('Évian')).toBe('evian')
		expect(normaliser(null)).toBe('')
		expect(normaliser(42)).toBe('')
	})

	test('values of another type than expected count as missing, without an error', () => {
		// what a JSON document of unknown origin may hold
		const douteux: unknown = JSON.parse(
			'{"first_name":42,"last_name":{},"speciality":7,"city":["Annecy"],"description":200,"main_picture":7,"image_gallery":"x","skills":"x","experiences":{"length":2},"courses":3,"service_offers":"x","network":"instagram","language":true}'
		)
		const c = completude(douteux as ChampsDuProfil)
		expect(c.score).toBe(0)
		expect(c.manquants).toEqual([...CRITERES])
		expect(c.entierementVide).toBe(true)
		const offres: unknown = JSON.parse('{"service_offers":["offre",12,null,{"price":80},{"price":"80 €"}]}')
		expect(conditionsPubliable(offres as ChampsDuProfil)).toEqual({ ...AUCUNE, offreChiffree: true })
	})
})

describe('devientPubliable (the « profile_publiable » event)', () => {
	// one criterion short: a description of 199 characters
	const presque: ChampsDuProfil = { ...complet, description: 'a'.repeat(199) }
	const incomplet: ChampsDuProfil = { ...complet, description: '', main_picture: null }

	test('the save that completes the last criterion: true', () => {
		expect(devientPubliable(presque, { ...presque, description: 'a'.repeat(200) })).toBe(true)
		expect(devientPubliable(presque, complet)).toBe(true)
	})

	test('complete to complete, incomplete to incomplete, complete to incomplete: false', () => {
		expect(devientPubliable(complet, { ...complet, city: 'Lyon' })).toBe(false)
		expect(devientPubliable(incomplet, { ...incomplet, description: 'Bonjour' })).toBe(false)
		expect(devientPubliable(presque, presque)).toBe(false)
		// a loss is never counted as a profile that became publiable
		expect(devientPubliable(complet, presque)).toBe(false)
		expect(devientPubliable(complet, { ...complet, service_offers: [] })).toBe(false)
		expect(devientPubliable(null, undefined)).toBe(false)
		// an internal account never becomes publiable
		const interne: ChampsDuProfil = { ...presque, speciality: 'CEO/CTO My Makeup' }
		expect(devientPubliable(interne, { ...interne, description: DESCRIPTION })).toBe(false)
	})

	test('without a contact channel she does not become publiable; the quote form option is off', () => {
		const sansCanal: ChampsDuProfil = { ...presque, network: { instagram: '' } }
		const apres: ChampsDuProfil = { ...sansCanal, description: 'a'.repeat(200) }
		expect(devientPubliable(sansCanal, apres)).toBe(false)
		expect(devientPubliable(sansCanal, apres, { formulaireDevis: false })).toBe(false)
		// as on the old site when the option is turned on
		expect(devientPubliable(sansCanal, apres, { formulaireDevis: true })).toBe(true)
	})
})
