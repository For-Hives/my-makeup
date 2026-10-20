import { describe, expect, test } from 'bun:test'
import { filterLink, filterWhere } from '../../src/lib/account/admin-filters'

/** Ticket 168: the three filters of the list of accounts of the admin panel. */
describe('Les filtres de la liste des comptes', () => {
	test('« non confirmés » et « bloqués » lisent les cases stockées', () => {
		expect(filterWhere('non-confirmes', [])).toEqual({ _verified: { equals: false } })
		expect(filterWhere('bloques', [1])).toEqual({ blocked: { equals: true } })
		expect(filterLink('non-confirmes', [])).toBe('/admin/collections/pros?where[_verified][equals]=false')
		expect(filterLink('bloques', [])).toBe('/admin/collections/pros?where[blocked][equals]=true')
	})

	test('« sans profil » écarte les propriétaires de profils, en une valeur à virgules (la forme que le panneau lit)', () => {
		expect(filterWhere('sans-profil', [3, 7])).toEqual({ id: { not_in: [3, 7] } })
		expect(filterLink('sans-profil', [3, 7])).toBe('/admin/collections/pros?where[id][not_in]=3,7')
	})

	test('au-delà de 20 propriétaires, le lien les garde tous : le panneau lit une liste d’adresse de 21 entrées ou plus comme un objet (ticket 225)', () => {
		const proprietaires = Array.from({ length: 190 }, (_, i) => i + 1)
		const lien = filterLink('sans-profil', proprietaires)
		const valeurs = new URLSearchParams(lien.split('?')[1]).getAll('where[id][not_in]')

		// A single parameter, no `[0]`, `[21]`… indices: nothing for `qs` to cut at 20 entries.
		expect(valeurs).toHaveLength(1)
		expect(valeurs[0]?.split(',')).toEqual(proprietaires.map(String))
		expect(lien).not.toMatch(/\]\[\d+\]/)
	})

	test('sans aucun propriétaire, tous les comptes sont sans profil', () => {
		expect(filterWhere('sans-profil', [])).toEqual({ id: { exists: true } })
		expect(filterLink('sans-profil', [])).toBe('/admin/collections/pros?where[id][exists]=true')
	})
})
