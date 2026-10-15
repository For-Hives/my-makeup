import { describe, expect, test } from 'bun:test'
import { positionDAccueil, schemaDeLIdentiteDAccueil, schemaDeLIdentiteDAccueilStrict } from '@/lib/espace/onboarding'

/**
 * The onboarding (ticket 140; plan 02 E02): the step shown is read from the stored profile, by the
 * single rule of a profile, and the speciality, which the space leaves optional, is required.
 */

const IDENTITE = { prenom: 'Léa', nom: 'Fictive', specialite: 'Mariée' }
const COMMUNE = { nom: 'Lille', codeInsee: '59350' }

describe('la position : première étape que le profil enregistré n’a pas faite', () => {
	test('un profil vide est à l’étape 1', () => {
		expect(positionDAccueil({})).toBe(1)
		expect(positionDAccueil(null)).toBe(1)
	})

	test('sans spécialité, l’identité n’est pas faite, même avec les deux noms', () => {
		expect(positionDAccueil({ prenom: 'Léa', nom: 'Fictive' })).toBe(1)
		expect(positionDAccueil({ prenom: 'Léa', specialite: 'Mariée' })).toBe(1)
	})

	test('identité faite, sans commune : étape 2 (la reprise après un départ)', () => {
		expect(positionDAccueil(IDENTITE)).toBe(2)
		// A commune with no code is no commune the rule can read.
		expect(positionDAccueil({ ...IDENTITE, commune: { nom: 'Lille' } })).toBe(2)
	})

	test('identité et commune faites, sans photo : étape 3', () => {
		expect(positionDAccueil({ ...IDENTITE, commune: COMMUNE })).toBe(3)
	})

	test('les trois faites : terminée, et c’est exactement un profil actif', () => {
		expect(positionDAccueil({ ...IDENTITE, commune: COMMUNE, photoPrincipale: { id: 4 } })).toBe('terminee')
	})

	test('une photo sans le reste ne saute pas d’étape', () => {
		expect(positionDAccueil({ photoPrincipale: { id: 4 } })).toBe(1)
		expect(positionDAccueil({ ...IDENTITE, photoPrincipale: { id: 4 } })).toBe(2)
	})
})

describe('l’identité de l’accueil : la spécialité est obligatoire', () => {
	test('sans spécialité, le message est sous le champ', () => {
		const lue = schemaDeLIdentiteDAccueil.safeParse({ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: '  ' })
		expect(lue.success).toBe(false)
		expect(lue.error?.issues.map(i => [i.path[0], i.message])).toEqual([['specialite', 'Indique ta spécialité.']])
	})

	test('le nom d’artiste reste facultatif', () => {
		expect(
			schemaDeLIdentiteDAccueil.safeParse({ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' })
				.success
		).toBe(true)
	})

	test('la version stricte refuse un champ réservé', () => {
		const base = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }
		expect(schemaDeLIdentiteDAccueilStrict.safeParse(base).success).toBe(true)
		expect(schemaDeLIdentiteDAccueilStrict.safeParse({ ...base, statut: 'publie' }).success).toBe(false)
		expect(schemaDeLIdentiteDAccueilStrict.safeParse({ ...base, origine: 'ia' }).success).toBe(false)
	})
})
