import { describe, expect, test } from 'bun:test'
import { lireLesArguments } from '../../scripts/migration/import/arguments'
import { dateDeBascule } from '../../scripts/migration/import/profils'

/**
 * Ticket 064: the date of the switch, the consent date of the contact details shown on the old
 * site, is a parameter of the run. The runs themselves are in tests/integration/import-contact.test.ts.
 */

describe('la date de bascule (--consentement-le)', () => {
	test('un jour vaut minuit UTC ; un instant garde son fuseau', () => {
		expect(dateDeBascule('2026-11-02')).toBe('2026-11-02T00:00:00.000Z')
		expect(dateDeBascule('2026-11-02T08:00:00Z')).toBe('2026-11-02T08:00:00.000Z')
		expect(dateDeBascule('2026-11-02T10:00:00+02:00')).toBe('2026-11-02T08:00:00.000Z')
	})

	test('ce qui n’est pas une date réelle est refusé, sans repli sur l’horloge', () => {
		for (const texte of [
			'',
			'demain',
			'02/11/2026',
			'2026-13-01',
			'2026-02-30',
			'2026-11-02T08:00:00',
			'2026-11-02 08:00',
		])
			expect(dateDeBascule(texte), texte).toBeNull()
	})

	test('la ligne de commande la lit comme un fichier : une valeur est obligatoire', () => {
		expect(lireLesArguments(['--reel', '--consentement-le', '2026-11-02'])).toEqual({
			mode: 'reel',
			cibleDistante: false,
			consentiLe: '2026-11-02',
		})
		expect(lireLesArguments(['--consentement-le'])).toBeNull()
		expect(lireLesArguments(['--consentement-le', '--reel'])).toBeNull()
	})
})
