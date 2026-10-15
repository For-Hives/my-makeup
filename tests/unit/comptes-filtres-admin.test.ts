import { describe, expect, test } from 'bun:test'
import { lienDuFiltre, whereDuFiltre } from '../../src/lib/compte/filtres-admin'

/** Ticket 168: the three filters of the list of accounts of the admin panel. */
describe('Les filtres de la liste des comptes', () => {
	test('« non confirmés » et « bloqués » lisent les cases stockées', () => {
		expect(whereDuFiltre('non-confirmes', [])).toEqual({ _verified: { equals: false } })
		expect(whereDuFiltre('bloques', [1])).toEqual({ bloque: { equals: true } })
		expect(lienDuFiltre('non-confirmes', [])).toBe('/admin/collections/pros?where[_verified][equals]=false')
		expect(lienDuFiltre('bloques', [])).toBe('/admin/collections/pros?where[bloque][equals]=true')
	})

	test('« sans profil » écarte les propriétaires de profils, en liste (la forme que le panneau lit)', () => {
		expect(whereDuFiltre('sans-profil', [3, 7])).toEqual({ id: { not_in: [3, 7] } })
		expect(lienDuFiltre('sans-profil', [3, 7])).toBe(
			'/admin/collections/pros?where[id][not_in][0]=3&where[id][not_in][1]=7'
		)
	})

	test('sans aucun propriétaire, tous les comptes sont sans profil', () => {
		expect(whereDuFiltre('sans-profil', [])).toEqual({ id: { exists: true } })
		expect(lienDuFiltre('sans-profil', [])).toBe('/admin/collections/pros?where[id][exists]=true')
	})
})
