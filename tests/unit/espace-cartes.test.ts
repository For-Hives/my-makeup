import { describe, expect, test } from 'bun:test'
import { cartesDuProfil, type ProfilDeLEspace, SECTIONS } from '@/lib/espace/cartes'

/** The cards of the page of her space (ticket 118): the value stored, or nothing — never « null ». */

const VIDE: ProfilDeLEspace = { id: 1 }

const carte = (profil: ProfilDeLEspace, section: string) => {
	const trouvee = cartesDuProfil(profil).find(c => c.section === section)
	if (!trouvee) throw new Error(`pas de carte ${section}`)
	return trouvee
}

describe('une carte par section, dans l’ordre de la page', () => {
	test('un profil vide a toutes ses cartes, et aucune valeur', () => {
		const cartes = cartesDuProfil(VIDE)
		expect(cartes.map(c => c.section)).toEqual([...SECTIONS])
		for (const { lignes } of cartes) {
			expect(lignes.length).toBeGreaterThan(0)
		}
		const valeurs = cartes.flatMap(c => c.lignes.map(l => l.valeur))
		// The coordinates line « shown on your profile » is a yes/no; an empty profile reads « Disponible » (ticket 124); the rest is empty.
		expect(valeurs.filter(v => v !== null)).toEqual(['Disponible', 'Non'])
	})
})

describe('les valeurs enregistrées', () => {
	const PROFIL: ProfilDeLEspace = {
		id: 2,
		prenom: 'Léa',
		nom: 'Fictive',
		nomArtiste: 'Studio Fictif',
		specialite: 'Maquillage mariée',
		description: 'Une ligne\nUne autre',
		commune: { nom: 'Annecy', departement: '74' },
		rayonKm: 30,
		aDomicile: true,
		disponible: false,
		competences: [{ nom: 'Teint' }, { nom: 'Regard' }],
		langues: [{ nom: 'Français' }],
		formations: [{ diplome: 'CAP esthétique', ecole: 'École fictive', obtenuLe: '2020-01-15T12:00:00.000Z' }],
		experiences: [{ poste: 'Maquilleuse', entreprise: 'Studio', debut: '2021-03-01T12:00:00.000Z' }],
		prestations: [{ nom: 'Mariée', prixTexte: 'à partir de 80 €', prixAPartirDe: 80 }],
		reseaux: { instagram: '@studio.fictif', siteWeb: 'https://studio.example.test' },
		coordonnees: { telephone: '0100000000', email: 'lea@example.test' },
		contactPublic: true,
		galerie: [1, 2, 3],
		photoPrincipale: 7,
	}

	test('chaque carte porte ce qui est stocké', () => {
		expect(carte(PROFIL, 'identite').lignes.map(l => l.valeur)).toEqual([
			'Léa',
			'Fictive',
			'Studio Fictif',
			'Maquillage mariée',
		])
		expect(carte(PROFIL, 'localisation').lignes.map(l => l.valeur)).toEqual(['Annecy (74)', '30 km', 'Oui'])
		expect(carte(PROFIL, 'disponibilite').lignes[0]?.valeur).toBe('Pas disponible en ce moment')
		expect(carte(PROFIL, 'disponibilite').lignes[1]?.valeur).toContain('n’apparaît plus')
		expect(carte(PROFIL, 'competences').lignes.map(l => l.valeur)).toEqual(['Teint', 'Regard'])
		expect(carte(PROFIL, 'formations').lignes[0]?.valeur).toBe('CAP esthétique - École fictive - janvier 2020')
		expect(carte(PROFIL, 'experiences').lignes[0]?.valeur).toBe('Maquilleuse - Studio - mars 2021 - aujourd’hui')
		expect(carte(PROFIL, 'reseaux').lignes.map(l => l.libelle)).toEqual(['Instagram', 'Site web'])
		expect(carte(PROFIL, 'portfolio').lignes[0]?.valeur).toBe('3 photos')
		expect(carte(PROFIL, 'photo').lignes[0]?.valeur).toBe('Photo ajoutée')
		expect(carte(PROFIL, 'coordonnees').lignes.map(l => l.valeur)).toEqual(['0100000000', 'lea@example.test', 'Oui'])
		expect(carte(PROFIL, 'prestations').lignes[0]?.valeur).toContain('Mariée')
	})

	test('les mots « null » et « undefined » enregistrés par erreur ne s’affichent jamais', () => {
		const sale: ProfilDeLEspace = {
			id: 3,
			prenom: 'null',
			nom: ' undefined ',
			specialite: '   ',
			description: 'null',
			competences: [{ nom: 'null' }, { nom: null }],
			reseaux: { instagram: 'undefined' },
		}
		const textes = cartesDuProfil(sale).flatMap(c => c.lignes.map(l => l.valeur))
		for (const valeur of textes) expect(valeur === null || !/null|undefined/i.test(valeur)).toBe(true)
		expect(
			carte(sale, 'identite')
				.lignes.slice(0, 2)
				.map(l => l.valeur)
		).toEqual([null, null])
		expect(carte(sale, 'competences').lignes).toEqual([{ valeur: null }])
	})
})
