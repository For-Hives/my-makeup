import { describe, expect, test } from 'bun:test'
import { DEPARTEMENTS, departementDuCodePostal, normaliserLieu } from '@/lib/departments'

// Ported from tests/unit/lieu.test.mjs of the old site (branch main), for the part of
// src/lib/lieu.js that is ported: same cases, same expected values.

describe('départements', () => {
	test('places compared without case, accents, hyphens nor « St »', () => {
		expect(normaliserLieu('Saint-Julien-en-Genevois')).toBe('saint julien en genevois')
		expect(normaliserLieu('  ANNECY  ')).toBe('annecy')
		expect(normaliserLieu('St-Étienne')).toBe('saint etienne')
		expect(normaliserLieu('Ste Foy-lès-Lyon')).toBe('sainte foy les lyon')
		expect(normaliserLieu('L’Haÿ-les-Roses')).toBe('l hay les roses')
		expect(normaliserLieu('Saint-Brieuc, Côtes-d’Armor')).toBe('saint brieuc cotes d armor')
		expect(normaliserLieu('Œuilly')).toBe('oeuilly')
		expect(normaliserLieu('Ægerta')).toBe('aegerta')
		for (const v of [null, undefined, 74, {}]) {
			expect(normaliserLieu(v)).toBe('')
		}
	})

	test('101 départements; the département of a postal code', () => {
		expect(Object.keys(DEPARTEMENTS).length).toBe(101)
		expect(DEPARTEMENTS['74']).toBe('Haute-Savoie')
		expect(DEPARTEMENTS['01']).toBe('Ain')
		expect(DEPARTEMENTS['2A']).toBe('Corse-du-Sud')
		expect(DEPARTEMENTS['974']).toBe('La Réunion')
		expect(departementDuCodePostal('74000')).toBe('74')
		expect(departementDuCodePostal('74200')).toBe('74')
		expect(departementDuCodePostal('01000')).toBe('01')
		expect(departementDuCodePostal('95000')).toBe('95')
		expect(departementDuCodePostal('20090')).toBe('2A')
		expect(departementDuCodePostal('20200')).toBe('2B')
		expect(departementDuCodePostal('97411')).toBe('974')
		expect(departementDuCodePostal('97600')).toBe('976')
		// not a département: Saint-Pierre-et-Miquelon, Monaco, nothing
		for (const code of ['97500', '98000', '96000', '00100', '7400', 74000, null]) {
			expect(departementDuCodePostal(code), String(code)).toBeNull()
		}
	})
})
