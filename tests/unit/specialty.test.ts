import { describe, expect, test } from 'bun:test'
import {
	composeSpecialty,
	parseSpecialtyBullets,
	SPECIALTY_BULLETS,
	SPECIALTY_OTHER_MAX,
	specialtyPatch,
	splitLegacySpecialty,
} from '@/lib/specialty'

/** Ticket 1010: the specialty is chosen from bullets, with « Autre » for a free text. */

describe('1010 : les puces de spécialité', () => {
	test('la liste a six puces, chacune avec une clé anglaise et un libellé français', () => {
		expect(SPECIALTY_BULLETS.map(b => b.value)).toEqual([
			'wedding',
			'event',
			'photoFashion',
			'screenStage',
			'specialEffects',
			'selfMakeupCourse',
		])
		expect(SPECIALTY_BULLETS[1]?.label).toBe('Soirée et événement')
	})

	test('le texte affiché se compose des puces dans l’ordre de la liste, puis du texte « Autre »', () => {
		expect(composeSpecialty(['specialEffects', 'wedding'], 'Body painting')).toBe(
			'Mariage, Effets spéciaux, Body painting'
		)
		expect(composeSpecialty([], '  Teint  ')).toBe('Teint')
		expect(composeSpecialty([], '')).toBe('')
	})

	test('une clé inconnue ou en double est ignorée', () => {
		expect(composeSpecialty(['wedding', 'wedding', 'nope'], '')).toBe('Mariage')
		expect(parseSpecialtyBullets('wedding,nope,wedding,event')).toEqual(['wedding', 'event'])
		expect(parseSpecialtyBullets('')).toEqual([])
	})

	test('un texte déjà saisi qui est exactement une puce, ou une liste de puces, devient ces puces', () => {
		expect(splitLegacySpecialty('Mariage')).toEqual({ bullets: ['wedding'], other: '' })
		expect(splitLegacySpecialty('Mariage, Effets spéciaux')).toEqual({
			bullets: ['wedding', 'specialEffects'],
			other: '',
		})
	})

	test('tout autre texte est gardé mot pour mot dans « Autre » : rien n’est perdu', () => {
		for (const text of ['Maquillage mariée & soirée', 'mariage', 'Mariage, Teint', 'Effets spéciaux, Mariage']) {
			const { bullets, other } = splitLegacySpecialty(text)
			expect(bullets).toEqual([])
			expect(other).toBe(text)
		}
		expect(splitLegacySpecialty(null)).toEqual({ bullets: [], other: '' })
	})

	test('recomposer le résultat redonne le texte d’origine, et un second passage ne change rien', () => {
		for (const text of ['Mariage', 'Mariage, Effets spéciaux', 'Teint lumineux', '']) {
			const first = splitLegacySpecialty(text)
			expect(composeSpecialty(first.bullets, first.other)).toBe(text)
			const second = splitLegacySpecialty(composeSpecialty(first.bullets, first.other))
			expect(second).toEqual(first)
		}
		expect(SPECIALTY_OTHER_MAX).toBe(70)
	})
})

describe('1010 : ce qu’un enregistrement de profil écrit', () => {
	test('des puces ou « Autre » dans l’enregistrement : le texte est composé', () => {
		expect(specialtyPatch({ specialtyBullets: ['event', 'wedding'] }, null)).toEqual({
			specialty: 'Mariage, Soirée et événement',
			specialtyBullets: ['wedding', 'event'],
			specialtyOther: null,
		})
		expect(specialtyPatch({ specialtyOther: 'Teint' }, { specialtyBullets: ['wedding'] }).specialty).toBe(
			'Mariage, Teint'
		)
	})

	test('le texte seul : rangé comme un texte existant, sauf s’il est déjà celui des champs', () => {
		expect(specialtyPatch({ specialty: 'Teint lumineux' }, null)).toEqual({
			specialtyBullets: [],
			specialtyOther: 'Teint lumineux',
		})
		expect(specialtyPatch({ specialty: 'Mariage' }, { specialtyBullets: ['wedding'] })).toEqual({})
		expect(specialtyPatch({}, null)).toEqual({})
	})
})
