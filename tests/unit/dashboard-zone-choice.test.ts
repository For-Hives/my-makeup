import { describe, expect, test } from 'bun:test'
import { matchingCountries } from '@/lib/dashboard/country-search'
import type { LocationValues } from '@/lib/dashboard/location'
import { locationValues } from '@/lib/dashboard/location'
import { choiceChanged, initialChoice, radiusAsked, zoneRequest } from '@/lib/dashboard/zone-choice'
import { reviewButtons, reviewMessage, zoneReviewView } from '@/lib/dashboard/zone-review'

/**
 * The zone of her space as a choice (tickets 265 and 266): the countries the field proposes, the
 * request a choice makes, the zone a stored profile starts from, and the review the import left.
 * No component, no network.
 */

const CITY: LocationValues = {
	kind: 'city',
	codeInsee: '74010',
	libelle: 'Annecy (74)',
	countries: [],
	town: '',
	rayonKm: 30,
	aDomicile: false,
}
const BELGIUM: LocationValues = {
	kind: 'countries',
	codeInsee: '',
	libelle: '',
	countries: ['BE'],
	town: 'Bruxelles',
	rayonKm: 30,
	aDomicile: true,
}
const ANNECY = { codeInsee: '74010', libelle: 'Annecy (74)', nom: 'Annecy' }

describe('les pays que propose le champ, filtrés dans le navigateur', () => {
	test('« Belg » propose la Belgique ; accents, casse et tirets ne comptent pas', () => {
		expect(matchingCountries('Belg').map(c => c.code)).toEqual(['BE'])
		expect(matchingCountries('belg').map(c => c.code)).toEqual(['BE'])
		expect(matchingCountries('pays-b').map(c => c.code)).toContain('NL')
		expect(matchingCountries('Pays Bas').map(c => c.code)).toContain('NL')
		expect(matchingCountries('Equateur').map(c => c.name)).toContain('Équateur')
	})

	test('un autre nom que la liste connaît propose le pays', () => {
		expect(matchingCountries('Holl').map(c => c.code)).toEqual(['NL'])
	})

	test('ce qui commence autrement ne propose rien : on filtre par le début', () => {
		expect(matchingCountries('gique')).toEqual([])
	})

	test('moins de deux lettres, des chiffres, un code postal : rien', () => {
		expect(matchingCountries('')).toEqual([])
		expect(matchingCountries('B')).toEqual([])
		expect(matchingCountries('62149')).toEqual([])
		expect(matchingCountries('Be1')).toEqual([])
	})

	test('la France ne se propose pas dans le champ unique (une commune la dit), mais dans une liste de pays', () => {
		expect(matchingCountries('Fran').map(c => c.code)).not.toContain('FR')
		expect(matchingCountries('Fran', { avecFrance: true }).map(c => c.code)).toContain('FR')
	})

	test('un pays déjà choisi ne se propose plus ; la liste est bornée', () => {
		expect(matchingCountries('Belg', { sans: ['BE'] })).toEqual([])
		expect(matchingCountries('Sa').length).toBeLessThanOrEqual(6)
	})
})

describe('la zone d’un profil enregistré, telle que le formulaire la lit', () => {
	test('une commune', () => {
		expect(
			locationValues({
				city: { name: 'Annecy', inseeCode: '74010', department: '74' },
				radiusKm: 30,
				homeService: false,
				zoneKind: 'city',
			})
		).toEqual(CITY)
	})

	test('des pays, avec leur ville ; une commune d’avant les pays n’a ni pays ni ville', () => {
		expect(
			locationValues({ zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles', radiusKm: 30, homeService: true })
		).toEqual(BELGIUM)
		expect(
			locationValues({ city: { name: 'Annecy', inseeCode: '74010', department: '74' }, radiusKm: 30 })
		).toMatchObject({
			kind: 'city',
			countries: [],
			town: '',
		})
	})

	test('un profil sans zone : une commune vide', () => {
		expect(locationValues({})).toEqual({ ...CITY, codeInsee: '', libelle: '', rayonKm: null })
	})
})

describe('la requête que fait un choix', () => {
	test('une commune choisie : son code seul', () => {
		expect(zoneRequest({ kind: 'city', city: ANNECY }, '30', true)).toEqual({
			ok: true,
			saisie: { kind: 'city', codeInsee: '74010', rayonKm: 30, aDomicile: true },
		})
	})

	test('sans commune choisie : rien n’est envoyé, la phrase est celle du champ', () => {
		expect(zoneRequest({ kind: 'city', city: null }, '', false)).toEqual({
			ok: false,
			message: 'Choisis ta commune dans la liste qui s’affiche quand tu écris son nom.',
			champ: 'zone',
		})
	})

	test('un pays et sa ville ; la ville vide devient null', () => {
		expect(zoneRequest({ kind: 'countries', countries: ['BE'], town: ' Bruxelles ' }, '30', false)).toEqual({
			ok: true,
			saisie: { kind: 'countries', countries: ['BE'], town: 'Bruxelles', rayonKm: 30, aDomicile: false },
		})
		expect(zoneRequest({ kind: 'countries', countries: ['BE'], town: '  ' }, '', false)).toMatchObject({
			saisie: { town: null, rayonKm: null },
		})
	})

	test('plusieurs pays : le rayon tapé avant n’est pas envoyé', () => {
		expect(zoneRequest({ kind: 'countries', countries: ['FR', 'IT'], town: '' }, '30', true)).toEqual({
			ok: true,
			saisie: { kind: 'countries', countries: ['FR', 'IT'], town: null, rayonKm: null, aDomicile: true },
		})
	})

	test('[FR] seul, aucun pays, six pays, une adresse : les phrases du serveur', () => {
		const countries = (list: string[], town = '') =>
			zoneRequest({ kind: 'countries', countries: list, town }, '', false)
		const franceOnly = 'Choisis au moins un pays étranger : pour la France, écris ta commune.'
		expect(countries(['FR'])).toEqual({ ok: false, message: franceOnly, champ: 'zone' })
		expect(countries([])).toEqual({ ok: false, message: franceOnly, champ: 'zone' })
		expect(countries(['BE', 'IT', 'ES', 'DE', 'CH', 'LU'])).toEqual({
			ok: false,
			message: '5 pays au plus.',
			champ: 'zone',
		})
		expect(countries(['BE'], '12 rue des Lilas')).toEqual({
			ok: false,
			message: 'Écris le nom de ta ville, pas ton adresse : elle ne s’enregistre jamais.',
			champ: 'ville',
		})
	})

	test('le rayon se demande autour d’une commune ou d’un seul pays', () => {
		expect(radiusAsked({ kind: 'city', city: null })).toBe(true)
		expect(radiusAsked({ kind: 'countries', countries: ['BE'], town: '' })).toBe(true)
		expect(radiusAsked({ kind: 'countries', countries: ['BE', 'IT'], town: '' })).toBe(false)
		expect(radiusAsked({ kind: 'countries', countries: [], town: '' })).toBe(false)
	})
})

describe('le choix de départ, et ce qui l’a changé', () => {
	test('il reprend la zone enregistrée', () => {
		expect(initialChoice(CITY)).toEqual({
			kind: 'city',
			city: { codeInsee: '74010', libelle: 'Annecy (74)', nom: 'Annecy (74)' },
		})
		expect(initialChoice({ ...CITY, codeInsee: '', libelle: '' })).toEqual({ kind: 'city', city: null })
		expect(initialChoice(BELGIUM)).toEqual({ kind: 'countries', countries: ['BE'], town: 'Bruxelles' })
	})

	test('changer de commune, de pays, de ville, de forme', () => {
		expect(choiceChanged(initialChoice(CITY), CITY)).toBe(false)
		expect(choiceChanged({ kind: 'city', city: { ...ANNECY, codeInsee: '69123' } }, CITY)).toBe(true)
		expect(choiceChanged(initialChoice(BELGIUM), BELGIUM)).toBe(false)
		expect(choiceChanged({ kind: 'countries', countries: ['BE', 'IT'], town: '' }, BELGIUM)).toBe(true)
		expect(choiceChanged({ kind: 'countries', countries: ['BE'], town: 'Gand' }, BELGIUM)).toBe(true)
		expect(choiceChanged({ kind: 'countries', countries: [], town: '' }, CITY)).toBe(false)
		expect(choiceChanged({ kind: 'countries', countries: ['BE'], town: '' }, CITY)).toBe(true)
		expect(choiceChanged({ kind: 'city', city: null }, BELGIUM)).toBe(true)
	})
})

describe('265 : la revue de la zone que l’import a laissée', () => {
	const REVIEW = {
		reason: 'sharedPostalCode',
		postalCode: '74990',
		candidates: [
			{ inseeCode: '74990', name: 'Valbrume', department: '74' },
			{ inseeCode: '74991', name: 'Hautcombe', department: '74' },
		],
	}

	test('le code postal et les communes en boutons, avec « Valbrume (74) »', () => {
		const view = zoneReviewView(REVIEW)
		expect(view).toEqual({
			codePostal: '74990',
			communes: [
				{ codeInsee: '74990', libelle: 'Valbrume (74)' },
				{ codeInsee: '74991', libelle: 'Hautcombe (74)' },
			],
		})
		if (!view) throw new Error('attendu : une revue')
		expect(reviewMessage(view)).toBe(
			'Ta commune reste à préciser : le code postal 74990 couvre 2 communes. Choisis la tienne.'
		)
		expect(reviewButtons(view)).toHaveLength(2)
	})

	test('sans code postal : la phrase de la zone non reprise, et pas de bouton', () => {
		const view = zoneReviewView({ reason: 'notFound', postalCode: null, candidates: null })
		expect(view).toEqual({ codePostal: null, communes: [] })
		if (!view) throw new Error('attendu : une revue')
		expect(reviewMessage(view)).toBe(
			'Ta zone n’a pas pu être reprise de l’ancien site : écris ta commune, ou indique le pays où tu travailles.'
		)
		expect(reviewButtons(view)).toEqual([])
	})

	test('un code postal sans commune lisible : la même phrase, pas « couvre 0 commune »', () => {
		const view = zoneReviewView({ ...REVIEW, candidates: [{ inseeCode: '99999', name: 'Fictive' }, 'x', null, 42] })
		if (!view) throw new Error('attendu : une revue')
		expect(view.communes).toEqual([])
		expect(reviewMessage(view)).toContain('Ta zone n’a pas pu être reprise')
	})

	test('une revue vidée par un enregistrement, ou absente : pas de bandeau', () => {
		expect(zoneReviewView({ reason: null, postalCode: null, candidates: null })).toBeNull()
		expect(zoneReviewView(undefined)).toBeNull()
		expect(zoneReviewView(null)).toBeNull()
		expect(zoneReviewView('texte')).toBeNull()
	})

	test('le JSON n’est pas cru : codes refusés, doublons, noms vides, département recalculé du code', () => {
		const view = zoneReviewView({
			reason: 'sharedPostalCode',
			postalCode: '62 149',
			candidates: [
				{ inseeCode: '74990', name: 'Valbrume', department: 'ZZ' },
				{ inseeCode: '74990', name: 'Valbrume' },
				{ inseeCode: '74991', name: '  ' },
				{ inseeCode: '7499', name: 'Court' },
			],
		})
		expect(view).toEqual({ codePostal: null, communes: [{ codeInsee: '74990', libelle: 'Valbrume (74)' }] })
	})
})
