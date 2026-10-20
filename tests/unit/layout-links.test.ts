import { describe, expect, test } from 'bun:test'
import { FOOTER_COLUMNS, internalPaths, NAVIGATION, NETWORKS } from '../../src/components/layout/links'
import { anonymousStatus, familiesFor, SITE_ORIGIN } from '../../src/lib/frozen-urls'

describe('liens du gabarit (068)', () => {
	test('chaque lien interne est une adresse gelée qui répond 200 (aucun lien mort)', () => {
		for (const filePath of internalPaths()) {
			const families = familiesFor(`${SITE_ORIGIN}${filePath}`)
			expect(families.length, filePath).toBeGreaterThan(0)
			expect(families.map(anonymousStatus), filePath).toEqual(families.map(() => 200))
		}
	})

	test('le pied de page garde les 4 colonnes et les 4 réseaux de la prod', () => {
		expect(FOOTER_COLUMNS.map(colonne => colonne.titre)).toEqual([
			'Particuliers',
			'Maquilleuses',
			'Ressources',
			'My-Makeup',
		])
		expect(FOOTER_COLUMNS.flatMap(colonne => colonne.liens)).toHaveLength(15)
		expect(NETWORKS).toHaveLength(4)
		for (const network of NETWORKS) expect(network.href).toMatch(/^(https:\/\/|mailto:)/)
	})

	test('la Nav a les 3 menus et le blog de la prod', () => {
		expect(NAVIGATION.map(entree => entree.nom)).toEqual(['Particulier', 'Maquilleuse', 'Solutions', 'Blog'])
	})
})
