import { describe, expect, test } from 'bun:test'
import { formatZone, rayonKm, villeAffichee } from '@/lib/format-zone'

// Ported from the « formatZone » block of tests/unit/profil-public.test.mjs of the old site
// (branch main): same cases, same expected values.

const INTERDIT = /\b(null|undefined|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

describe('formatZone (plans/02 U14)', () => {
	test('U14 no city / radius combination gives « null », « undefined » or « & km »', () => {
		const villes = ['Annecy', '  Annecy  ', '', '   ', null, undefined, 'null', 'undefined', 42, {}]
		const rayons = [30, '30', 0, '0', null, undefined, '', 'abc', -5, 1e6, 12.6, Number.NaN]
		for (const city of villes) {
			for (const radius of rayons) {
				const zone = formatZone({ city, radius })
				expect(zone, `${city} / ${radius} → ${zone}`).not.toMatch(INTERDIT)
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
		expect(villeAffichee('null')).toBe('')
		expect(rayonKm(2000)).toBeNull()
	})

	// Two guards of the port that U14 only checks as « no forbidden word »: the exact answers of the
	// old site's format-zone.js.
	test('a negative radius is dropped, a city that is not a text gives nothing', () => {
		expect(formatZone({ city: 'Annecy', radius: -5 })).toBe('Annecy')
		expect(formatZone({ city: 42, radius: 30 })).toBe('')
		expect(formatZone({ city: {}, radius: 30 })).toBe('')
		expect(rayonKm(-5)).toBeNull()
		expect(villeAffichee(42)).toBe('')
	})
})
