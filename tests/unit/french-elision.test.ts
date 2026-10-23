import { describe, expect, test } from 'bun:test'
import { elidesBefore, ofName } from '@/lib/french-elision'

/** The elision of « de » before a first name (tickets 290 and 304). */

describe('l’élision de « de » devant un prénom', () => {
	test('dix prénoms, dont un composé et un qui commence par une consonne', () => {
		expect(
			['Inès', 'Hélène', 'Océane', 'Éloïse', 'Anne-Laure', 'Léa', 'Yvonne', 'Yasmine', 'Hugo', 'Jean-Pierre'].map(
				ofName
			)
		).toEqual([
			'd’Inès',
			'd’Hélène',
			'd’Océane',
			'd’Éloïse',
			'd’Anne-Laure',
			'de Léa',
			'd’Yvonne',
			'de Yasmine',
			'de Hugo',
			'de Jean-Pierre',
		])
	})

	test('la majuscule, l’accent et les espaces autour ne changent rien', () => {
		expect(ofName('  émilie ')).toBe('d’émilie')
		expect(ofName('ÉLISE')).toBe('d’ÉLISE')
		expect(ofName('Œdipe')).toBe('d’Œdipe')
	})

	test('un nom vide donne un texte vide, jamais « de » seul', () => {
		expect(ofName('')).toBe('')
		expect(ofName('   ')).toBe('')
		expect(elidesBefore('')).toBe(false)
	})

	test('un nom entier (prénom et nom) s’élide sur son premier mot', () => {
		expect(ofName('Inès Morel')).toBe('d’Inès Morel')
		expect(ofName('Chloé Bertin')).toBe('de Chloé Bertin')
	})
})
