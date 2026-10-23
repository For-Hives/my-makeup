import { describe, expect, test } from 'bun:test'
import { unknownValues } from '../../src/collections/Profiles'

/** Ticket 165: a filter of the list on a status nobody holds is found before it reaches the database. */
describe('Les valeurs de statut d’un filtre de la liste des profils', () => {
	test('un statut connu, un autre champ, une comparaison à une présence : rien à refuser', () => {
		expect(unknownValues({ status: { equals: 'hidden' } })).toEqual([])
		expect(unknownValues({ slug: { equals: 'zz' }, publishable: { equals: false } })).toEqual([])
		expect(unknownValues({ status: { exists: true } })).toEqual([])
		expect(unknownValues(undefined)).toEqual([])
	})

	test('une valeur inconnue est trouvée, dans un et, un ou, une liste', () => {
		expect(unknownValues({ status: { equals: 'archive' } })).toEqual(['status : archive'])
		expect(unknownValues({ and: [{ or: [{ chosenStatus: { in: ['hidden', 'zz'] } }] }] })).toEqual([
			'chosenStatus : zz',
		])
		expect(unknownValues({ status: { equals: 12 } })).toEqual(['status : 12'])
	})
})

describe('les filtres sur les énumérations de la zone (ticket 259)', () => {
	test('un type de zone ou un motif de revue connus passent, les autres sont nommés', () => {
		expect(unknownValues({ zoneKind: { equals: 'countries' } })).toEqual([])
		expect(unknownValues({ 'zoneReview.reason': { in: ['notFound', 'homonyms'] } })).toEqual([])
		expect(unknownValues({ 'zoneReview.reason': { exists: true } })).toEqual([])
		expect(unknownValues({ zoneKind: { equals: 'region' } })).toEqual(['zoneKind : region'])
		expect(unknownValues({ 'zoneReview.reason': { equals: 'zz' } })).toEqual(['zoneReview.reason : zz'])
	})
})
