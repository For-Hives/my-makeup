import { describe, expect, test } from 'bun:test'
import { valeursInconnues } from '../../src/collections/Profiles'

/** Ticket 165: a filter of the list on a status nobody holds is found before it reaches the database. */
describe('Les valeurs de statut d’un filtre de la liste des profils', () => {
	test('un statut connu, un autre champ, une comparaison à une présence : rien à refuser', () => {
		expect(valeursInconnues({ status: { equals: 'hidden' } })).toEqual([])
		expect(valeursInconnues({ slug: { equals: 'zz' }, publishable: { equals: false } })).toEqual([])
		expect(valeursInconnues({ status: { exists: true } })).toEqual([])
		expect(valeursInconnues(undefined)).toEqual([])
	})

	test('une valeur inconnue est trouvée, dans un et, un ou, une liste', () => {
		expect(valeursInconnues({ status: { equals: 'archive' } })).toEqual(['status : archive'])
		expect(valeursInconnues({ and: [{ or: [{ chosenStatus: { in: ['hidden', 'zz'] } }] }] })).toEqual([
			'chosenStatus : zz',
		])
		expect(valeursInconnues({ status: { equals: 12 } })).toEqual(['status : 12'])
	})
})
