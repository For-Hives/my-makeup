import { describe, expect, test } from 'bun:test'
import { valeursInconnues } from '../../src/collections/Profils'

/** Ticket 165: a filter of the list on a status nobody holds is found before it reaches the database. */
describe('Les valeurs de statut d’un filtre de la liste des profils', () => {
	test('un statut connu, un autre champ, une comparaison à une présence : rien à refuser', () => {
		expect(valeursInconnues({ statut: { equals: 'masque' } })).toEqual([])
		expect(valeursInconnues({ slug: { equals: 'zz' }, publiable: { equals: false } })).toEqual([])
		expect(valeursInconnues({ statut: { exists: true } })).toEqual([])
		expect(valeursInconnues(undefined)).toEqual([])
	})

	test('une valeur inconnue est trouvée, dans un et, un ou, une liste', () => {
		expect(valeursInconnues({ statut: { equals: 'archive' } })).toEqual(['statut : archive'])
		expect(valeursInconnues({ and: [{ or: [{ statutChoisi: { in: ['masque', 'zz'] } }] }] })).toEqual([
			'statutChoisi : zz',
		])
		expect(valeursInconnues({ statut: { equals: 12 } })).toEqual(['statut : 12'])
	})
})
