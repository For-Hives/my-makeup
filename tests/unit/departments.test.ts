import { describe, expect, test } from 'bun:test'
import { DEPARTMENTS, departmentOfPostalCode, normalizePlace } from '@/lib/departments'

// Ported from tests/unit/lieu.test.mjs of the old site (branch main), for the part of
// src/lib/lieu.js that is ported: same cases, same expected values.

describe('départements', () => {
	test('places compared without case, accents, hyphens nor « St »', () => {
		expect(normalizePlace('Saint-Julien-en-Genevois')).toBe('saint julien en genevois')
		expect(normalizePlace('  ANNECY  ')).toBe('annecy')
		expect(normalizePlace('St-Étienne')).toBe('saint etienne')
		expect(normalizePlace('Ste Foy-lès-Lyon')).toBe('sainte foy les lyon')
		expect(normalizePlace('L’Haÿ-les-Roses')).toBe('l hay les roses')
		expect(normalizePlace('Saint-Brieuc, Côtes-d’Armor')).toBe('saint brieuc cotes d armor')
		expect(normalizePlace('Œuilly')).toBe('oeuilly')
		expect(normalizePlace('Ægerta')).toBe('aegerta')
		for (const v of [null, undefined, 74, {}]) {
			expect(normalizePlace(v)).toBe('')
		}
	})

	test('101 départements; the département of a postal code', () => {
		expect(Object.keys(DEPARTMENTS).length).toBe(101)
		expect(DEPARTMENTS['74']).toBe('Haute-Savoie')
		expect(DEPARTMENTS['01']).toBe('Ain')
		expect(DEPARTMENTS['2A']).toBe('Corse-du-Sud')
		expect(DEPARTMENTS['974']).toBe('La Réunion')
		expect(departmentOfPostalCode('74000')).toBe('74')
		expect(departmentOfPostalCode('74200')).toBe('74')
		expect(departmentOfPostalCode('01000')).toBe('01')
		expect(departmentOfPostalCode('95000')).toBe('95')
		expect(departmentOfPostalCode('20090')).toBe('2A')
		expect(departmentOfPostalCode('20200')).toBe('2B')
		expect(departmentOfPostalCode('97411')).toBe('974')
		expect(departmentOfPostalCode('97600')).toBe('976')
		// not a département: Saint-Pierre-et-Miquelon, Monaco, nothing
		for (const code of ['97500', '98000', '96000', '00100', '7400', 74000, null]) {
			expect(departmentOfPostalCode(code), String(code)).toBeNull()
		}
	})
})
