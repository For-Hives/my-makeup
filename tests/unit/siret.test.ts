import { describe, expect, test } from 'bun:test'
import { MESSAGE_SIRET, MESSAGE_SIRET_CHECK, normalizeSiret, validateSiret } from '@/lib/profile/siret'

describe('Le SIRET d’un profil (ticket 021)', () => {
	test('vide : accepté, la plupart des profils n’en ont pas', () => {
		expect([null, undefined, ''].map(validateSiret)).toEqual([true, true, true])
	})

	test('14 chiffres : accepté', () => {
		expect(validateSiret('12345678901237')).toBe(true)
	})

	test.each([
		['13 chiffres', '1234567890123'],
		['15 chiffres', '123456789012345'],
		['des espaces', '123 456 789 01234'],
		['une lettre', '1234567890123A'],
	])('%s : refusé, en français', (_cas, valeur) => {
		expect(validateSiret(valeur)).toBe(MESSAGE_SIRET)
	})

	test('la clé de contrôle (Luhn) est vérifiée : une faute de frappe est refusée', () => {
		expect(validateSiret('12345678901234')).toBe(MESSAGE_SIRET_CHECK)
		expect(validateSiret('00000000100017')).toBe(MESSAGE_SIRET_CHECK)
		expect(validateSiret('00000000100016')).toBe(true)
	})

	test('l’exception de La Poste (SIREN 356000000, somme des chiffres multiple de 5) est acceptée', () => {
		expect(validateSiret('35600000000065')).toBe(true)
		expect(validateSiret('35600000000066')).toBe(MESSAGE_SIRET_CHECK)
	})

	test('la saisie perd ses espaces et ses séparateurs avant le contrôle', () => {
		expect(normalizeSiret(' 123 456 789 01237 ')).toBe('12345678901237')
		expect(normalizeSiret('123\u00a0456\u202f789.01237')).toBe('12345678901237')
		expect(normalizeSiret('12-34')).toBe('1234')
		expect(normalizeSiret('abc')).toBe('abc')
	})

	test('le message est en français', () => {
		expect(MESSAGE_SIRET).toBe('Le SIRET compte 14 chiffres, sans espace.')
	})
})
