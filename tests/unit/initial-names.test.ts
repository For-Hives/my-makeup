import { describe, expect, test } from 'bun:test'
import { INITIAL_NAME_MAX, INITIAL_NAMES_KEY, initialNamesOf } from '@/lib/profile/initial-names'

/** The names a profile starts with (issue 1009). Made-up names only. */

describe('les noms de départ du profil', () => {
	test('le contexte de la création porte le prénom et le nom, nettoyés', () => {
		expect(initialNamesOf({ [INITIAL_NAMES_KEY]: { firstName: '  Léa ', lastName: ' Fictive  Test ' } })).toEqual({
			firstName: 'Léa',
			lastName: 'Fictive Test',
		})
	})

	test('un seul des deux suffit, l’autre reste vide', () => {
		expect(initialNamesOf({ [INITIAL_NAMES_KEY]: { firstName: 'Léa' } })).toEqual({ firstName: 'Léa', lastName: '' })
	})

	test('rien d’utilisable : aucun nom, le profil reste vide comme avant', () => {
		expect(initialNamesOf(undefined)).toBeNull()
		expect(initialNamesOf({})).toBeNull()
		expect(initialNamesOf({ [INITIAL_NAMES_KEY]: { firstName: 3, lastName: '  ' } })).toBeNull()
		expect(initialNamesOf({ [INITIAL_NAMES_KEY]: 'Léa Fictive' })).toBeNull()
	})

	test('un nom trop long est coupé à la borne du formulaire', () => {
		const read = initialNamesOf({ [INITIAL_NAMES_KEY]: { firstName: 'é'.repeat(300), lastName: 'x' } })
		expect(Array.from(read?.firstName ?? '')).toHaveLength(INITIAL_NAME_MAX)
	})
})
