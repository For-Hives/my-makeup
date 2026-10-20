import { describe, expect, test } from 'bun:test'
import {
	COUNTRIES,
	countryByCode,
	countryByName,
	FRANCE_CODE,
	flag,
	inCountry,
	isCountryCode,
	normalizedCountryCode,
	OVERSEAS_CODES,
	UNINHABITED_CODES,
} from '@/lib/countries'
import { usableCity } from '@/lib/profile/completeness'
import { hasNameCharacters, looksLikeAnAddress } from '@/lib/profile/zone'

/** The countries a zone may name (ticket 258): ISO 3166-1 less the twelve overseas codes. */

describe('la liste des pays', () => {
	test('232 pays, sans doublon de code ni de nom', () => {
		expect(COUNTRIES).toHaveLength(232)
		expect(new Set(COUNTRIES.map(country => country.code)).size).toBe(232)
		expect(new Set(COUNTRIES.map(country => country.name)).size).toBe(232)
		for (const { code } of COUNTRIES) expect(code).toMatch(/^[A-Z]{2}$/)
	})

	test('aucun des douze codes d’outre-mer ni des cinq territoires sans habitants, la France y est', () => {
		expect(OVERSEAS_CODES).toHaveLength(12)
		for (const code of OVERSEAS_CODES) expect(isCountryCode(code), code).toBe(false)
		expect(UNINHABITED_CODES).toEqual(['AQ', 'BV', 'GS', 'HM', 'UM'])
		for (const code of UNINHABITED_CODES) expect(isCountryCode(code), code).toBe(false)
		expect(isCountryCode(FRANCE_CODE)).toBe(true)
		expect(countryByCode('FR')?.name).toBe('France')
	})

	test('aucun autre nom ni nom voisin ne double un nom de pays', () => {
		const seen = new Map<string, string>()
		for (const { code, name, aliases = [] } of COUNTRIES) {
			for (const text of [name, ...aliases]) {
				const owner = countryByName(text)
				expect(owner?.code, text).toBe(code)
				expect(seen.get(text) ?? code, text).toBe(code)
				seen.set(text, code)
			}
		}
	})

	test('chaque nom de pays, sauf France, est une ville exploitable pour l’ancien site ; France ne l’est pas', () => {
		for (const { code, name } of COUNTRIES) {
			if (code === 'FR') expect(usableCity(name), name).toBe(false)
			else expect(usableCity(name), name).toBe(true)
		}
	})

	test('un nom de pays n’est ni une adresse ni fait d’autres caractères que ceux d’un nom', () => {
		for (const { name } of COUNTRIES) {
			expect(looksLikeAnAddress(name), name).toBe(false)
			expect(hasNameCharacters(name), name).toBe(true)
		}
	})

	test('les prépositions', () => {
		const expected: Record<string, string> = {
			BE: 'en Belgique',
			CH: 'en Suisse',
			LU: 'au Luxembourg',
			MC: 'à Monaco',
			IT: 'en Italie',
			ES: 'en Espagne',
			DE: 'en Allemagne',
			GB: 'au Royaume-Uni',
			NL: 'aux Pays-Bas',
			PT: 'au Portugal',
			CA: 'au Canada',
			US: 'aux États-Unis',
			MA: 'au Maroc',
			TN: 'en Tunisie',
			DZ: 'en Algérie',
			SN: 'au Sénégal',
			MT: 'à Malte',
			CY: 'à Chypre',
			AD: 'en Andorre',
			FR: 'en France',
		}
		expect(inCountry('DJ')).toBe('à Djibouti')
		for (const [code, phrase] of Object.entries(expected)) expect(inCountry(code), code).toBe(phrase)
		for (const { preposition } of COUNTRIES) expect(['en', 'au', 'aux', 'à']).toContain(preposition)
	})

	test('le drapeau se calcule depuis le code', () => {
		expect(flag('BE')).toBe('🇧🇪')
		expect(flag('fr')).toBe('🇫🇷')
		expect(flag('IT')).toBe('🇮🇹')
	})

	test('un code se lit en capitales, un nom aussi sous un autre nom', () => {
		expect(normalizedCountryCode(' be ')).toBe('BE')
		expect(normalizedCountryCode(42)).toBe(42)
		expect(countryByName('Hollande')?.code).toBe('NL')
		expect(countryByName('angleterre')?.code).toBe('GB')
		expect(countryByName(' USA ')?.code).toBe('US')
		expect(countryByName('Pays-Bas')?.code).toBe('NL')
		expect(countryByName('pays bas')?.code).toBe('NL')
		expect(countryByName('Atlantide')).toBeUndefined()
		expect(inCountry('ZZ')).toBe('ZZ')
	})
})
