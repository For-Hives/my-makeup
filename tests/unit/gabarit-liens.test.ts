import { describe, expect, test } from 'bun:test'
import { FOOTER_COLUMNS, internalPaths, NAVIGATION, NETWORKS } from '../../src/components/layout/links'
import { anonymousStatus, familiesFor, SITE_ORIGIN } from '../../src/lib/frozen-urls'

describe('liens du gabarit (068)', () => {
	test('chaque lien interne est une adresse gelée qui répond 200 (aucun lien mort)', () => {
		for (const chemin of internalPaths()) {
			const familles = familiesFor(`${SITE_ORIGIN}${chemin}`)
			expect(familles.length, chemin).toBeGreaterThan(0)
			expect(familles.map(anonymousStatus), chemin).toEqual(familles.map(() => 200))
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
		for (const reseau of NETWORKS) expect(reseau.href).toMatch(/^(https:\/\/|mailto:)/)
	})

	test('la Nav a les 3 menus et le blog de la prod', () => {
		expect(NAVIGATION.map(entree => entree.nom)).toEqual(['Particulier', 'Maquilleuse', 'Solutions', 'Blog'])
	})
})
