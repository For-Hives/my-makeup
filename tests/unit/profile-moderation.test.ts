import { describe, expect, test } from 'bun:test'
import { moderationActionOf, REASON_MAX, validReason } from '../../src/lib/profile/moderation'

describe('moderationActionOf (issue 1005)', () => {
	test('un profil qui passe à masqué est masqué, ou suspendu quand l’admin le dit', () => {
		expect(moderationActionOf({ chosenStatus: 'automatic' }, { chosenStatus: 'hidden' })).toBe('hide')
		expect(
			moderationActionOf({ chosenStatus: 'automatic' }, { chosenStatus: 'hidden', moderationAction: 'suspend' })
		).toBe('suspend')
	})
	test('un profil qui cesse d’être masqué est rétabli', () => {
		expect(moderationActionOf({ chosenStatus: 'hidden' }, { chosenStatus: 'automatic' })).toBe('restore')
		expect(moderationActionOf({ chosenStatus: 'hidden' }, { chosenStatus: 'published' })).toBe('restore')
	})
	test('passer de masqué à suspendu est une action ; ne rien changer n’en est pas une', () => {
		expect(
			moderationActionOf(
				{ chosenStatus: 'hidden', moderationAction: 'hide' },
				{ chosenStatus: 'hidden', moderationAction: 'suspend' }
			)
		).toBe('suspend')
		expect(
			moderationActionOf(
				{ chosenStatus: 'hidden', moderationAction: 'hide' },
				{ chosenStatus: 'hidden', moderationAction: 'hide' }
			)
		).toBeNull()
		expect(moderationActionOf({ chosenStatus: 'automatic' }, { chosenStatus: 'draft' })).toBeNull()
	})
})

describe('validReason', () => {
	test('un motif a de 10 à 500 caractères utiles', () => {
		expect(validReason('Photos sans rapport avec le maquillage')).toBe(true)
		expect(validReason('   court   ')).toBe(false)
		expect(validReason('')).toBe(false)
		expect(validReason(undefined)).toBe(false)
		expect(validReason('x'.repeat(REASON_MAX + 1))).toBe(false)
	})
})
