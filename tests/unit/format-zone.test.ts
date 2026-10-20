import { describe, expect, test } from 'bun:test'
import { COUNTRIES } from '@/lib/countries'
import { displayedCity, formatZone, radiusKm, zoneFlags, zoneSentence } from '@/lib/format-zone'
import { publicPlace } from '@/lib/profile/public-place'

// Ported from the « formatZone » block of tests/unit/profil-public.test.mjs of the old site
// (branch main): same cases, same expected values.

const FORBIDDEN = /\b(null|undefined|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

describe('formatZone (plans/02 U14)', () => {
	test('U14 no city / radius combination gives « null », « undefined » or « & km »', () => {
		const cities = ['Annecy', '  Annecy  ', '', '   ', null, undefined, 'null', 'undefined', 42, {}]
		const radii = [30, '30', 0, '0', null, undefined, '', 'abc', -5, 1e6, 12.6, Number.NaN]
		for (const city of cities) {
			for (const radius of radii) {
				const zone = formatZone({ city, radius })
				expect(zone, `${city} / ${radius} → ${zone}`).not.toMatch(FORBIDDEN)
			}
		}
		expect(formatZone()).toBe('')
	})

	test('city and radius', () => {
		expect(formatZone({ city: 'Annecy', radius: 30 })).toBe('Annecy et 30 km autour')
		expect(formatZone({ city: ' Annecy ', radius: '12.6' })).toBe('Annecy et 13 km autour')
		expect(formatZone({ city: 'Annecy', radius: 0 })).toBe('Annecy')
		expect(formatZone({ city: 'Annecy', radius: null })).toBe('Annecy')
		expect(formatZone({ city: '', radius: 30 })).toBe('')
		expect(displayedCity('null')).toBe('')
		expect(radiusKm(2000)).toBeNull()
	})

	// Two guards of the port that U14 only checks as « no forbidden word »: the exact answers of the
	// old site's format-zone.js.
	test('a negative radius is dropped, a city that is not a text gives nothing', () => {
		expect(formatZone({ city: 'Annecy', radius: -5 })).toBe('Annecy')
		expect(formatZone({ city: 42, radius: 30 })).toBe('')
		expect(formatZone({ city: {}, radius: 30 })).toBe('')
		expect(radiusKm(-5)).toBeNull()
		expect(displayedCity(42)).toBe('')
	})
})

describe('formatZone et une zone de pays (ticket 260)', () => {
	test('un pays et sa ville, avec ou sans rayon ; un pays seul ; plusieurs pays', () => {
		const countries = (...codes: string[]) => ({ zoneKind: 'countries', countries: codes })
		expect(formatZone({ ...countries('BE'), town: 'Bruxelles', radius: 30 })).toBe(
			'Bruxelles (Belgique) et 30 km autour'
		)
		expect(formatZone({ ...countries('BE'), town: 'Bruxelles' })).toBe('Bruxelles (Belgique)')
		expect(formatZone({ ...countries('BE') })).toBe('Belgique')
		expect(formatZone({ ...countries('FR', 'IT') })).toBe('France et Italie')
		expect(formatZone({ ...countries('FR', 'IT', 'ES') })).toBe('France, Italie et Espagne')
		expect(formatZone({ ...countries('NL') })).toBe('Pays-Bas')
	})

	test('le rayon est ignoré pour plusieurs pays et pour un pays sans ville', () => {
		expect(formatZone({ zoneKind: 'countries', countries: ['FR', 'IT'], radius: 50, town: 'Rome' })).toBe(
			'France et Italie'
		)
		expect(formatZone({ zoneKind: 'countries', countries: ['BE'], radius: 50 })).toBe('Belgique')
	})

	test('des codes en minuscules, répétés ou inconnus sont lus comme le serveur les écrit', () => {
		expect(formatZone({ zoneKind: 'countries', countries: ['be', 'BE', 'XX'] })).toBe('Belgique')
		expect(formatZone({ zoneKind: 'countries', countries: ['XX'], city: 'Annecy' })).toBe('Annecy')
		expect(formatZone({ zoneKind: 'countries', countries: [] })).toBe('')
		expect(formatZone({ zoneKind: 'countries', countries: 'BE' })).toBe('')
	})

	test('une zone de communes ne lit jamais les pays, même s’il en reste', () => {
		expect(formatZone({ zoneKind: 'city', city: 'Annecy', radius: 30, countries: ['BE'], town: 'Bruxelles' })).toBe(
			'Annecy et 30 km autour'
		)
		expect(formatZone({ city: 'Annecy', radius: 30, countries: [] })).toBe('Annecy et 30 km autour')
	})

	test('la phrase : à Annecy, à Bruxelles (Belgique), en Belgique, aux Pays-Bas, en France et en Italie', () => {
		expect(zoneSentence({ city: 'Annecy' })).toBe('à Annecy')
		expect(zoneSentence({ zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles' })).toBe('à Bruxelles (Belgique)')
		expect(zoneSentence({ zoneKind: 'countries', countries: ['BE'] })).toBe('en Belgique')
		expect(zoneSentence({ zoneKind: 'countries', countries: ['NL'] })).toBe('aux Pays-Bas')
		expect(zoneSentence({ zoneKind: 'countries', countries: ['MT'] })).toBe('à Malte')
		expect(zoneSentence({ zoneKind: 'countries', countries: ['FR', 'IT'] })).toBe('en France et en Italie')
		expect(zoneSentence({ zoneKind: 'countries', countries: ['FR', 'LU', 'NL'] })).toBe(
			'en France, au Luxembourg et aux Pays-Bas'
		)
		expect(zoneSentence({})).toBe('')
		expect(zoneSentence({ zoneKind: 'countries', countries: [] })).toBe('')
	})

	test('les drapeaux, dans l’ordre, sans doublon ; aucun pour une commune', () => {
		expect(zoneFlags({ zoneKind: 'countries', countries: ['FR', 'IT'] })).toEqual(['🇫🇷', '🇮🇹'])
		expect(zoneFlags({ zoneKind: 'countries', countries: ['be', 'BE'] })).toEqual(['🇧🇪'])
		expect(zoneFlags({ zoneKind: 'city', countries: ['BE'] })).toEqual([])
		expect(zoneFlags({})).toEqual([])
	})

	test('chaque libellé nouveau est relu à l’identique par la lecture du lieu : la page publique le relit', () => {
		const labels: string[] = []
		for (const { code } of COUNTRIES) {
			labels.push(formatZone({ zoneKind: 'countries', countries: [code] }))
			labels.push(formatZone({ zoneKind: 'countries', countries: [code], town: 'Bruxelles', radius: 30 }))
		}
		labels.push(
			formatZone({ zoneKind: 'countries', countries: ['FR', 'IT'] }),
			formatZone({ zoneKind: 'countries', countries: ['FR', 'IT', 'ES'] }),
			formatZone({ zoneKind: 'countries', countries: ['BE', 'NL'], radius: 20 })
		)
		for (const label of labels) {
			if (label === 'France') continue
			expect(publicPlace(label).texte, label).toBe(label)
		}
		expect(labels.length).toBe(COUNTRIES.length * 2 + 3)
	})
})
