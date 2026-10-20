import { describe, expect, test } from 'bun:test'
import { MESSAGE_SIRET, validerSiret } from '@/lib/profile/siret'

describe('Le SIRET d’un profil (ticket 021)', () => {
	test('vide : accepté, la plupart des profils n’en ont pas', () => {
		expect([null, undefined, ''].map(validerSiret)).toEqual([true, true, true])
	})

	test('14 chiffres : accepté', () => {
		expect(validerSiret('12345678901234')).toBe(true)
	})

	test.each([
		['13 chiffres', '1234567890123'],
		['15 chiffres', '123456789012345'],
		['des espaces', '123 456 789 01234'],
		['une lettre', '1234567890123A'],
	])('%s : refusé, en français', (_cas, valeur) => {
		expect(validerSiret(valeur)).toBe(MESSAGE_SIRET)
	})

	test('le message est en français', () => {
		expect(MESSAGE_SIRET).toBe('Le SIRET compte 14 chiffres, sans espace.')
	})
})
