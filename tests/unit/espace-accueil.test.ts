import { describe, expect, test } from 'bun:test'
import {
	onboardingIdentitySchema,
	onboardingPosition,
	strictOnboardingIdentitySchema,
} from '@/lib/dashboard/onboarding'

/**
 * The onboarding (ticket 140; plan 02 E02): the step shown is read from the stored profile, by the
 * single rule of a profile, and the speciality, which the space leaves optional, is required.
 */

const IDENTITE = { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée' }
const COMMUNE = { name: 'Lille', inseeCode: '59350' }

describe('la position : première étape que le profil enregistré n’a pas faite', () => {
	test('un profil vide est à l’étape 1', () => {
		expect(onboardingPosition({})).toBe(1)
		expect(onboardingPosition(null)).toBe(1)
	})

	test('sans spécialité, l’identité n’est pas faite, même avec les deux noms', () => {
		expect(onboardingPosition({ firstName: 'Léa', lastName: 'Fictive' })).toBe(1)
		expect(onboardingPosition({ firstName: 'Léa', specialty: 'Mariée' })).toBe(1)
	})

	test('identité faite, sans commune : étape 2 (la reprise après un départ)', () => {
		expect(onboardingPosition(IDENTITE)).toBe(2)
		// A commune with no code is no commune the rule can read.
		expect(onboardingPosition({ ...IDENTITE, city: { name: 'Lille' } })).toBe(2)
	})

	test('identité et commune faites, sans photo : étape 3', () => {
		expect(onboardingPosition({ ...IDENTITE, city: COMMUNE })).toBe(3)
	})

	test('les trois faites : terminée, et c’est exactement un profil actif', () => {
		expect(onboardingPosition({ ...IDENTITE, city: COMMUNE, mainPicture: { id: 4 } })).toBe('terminee')
	})

	test('une photo sans le reste ne saute pas d’étape', () => {
		expect(onboardingPosition({ mainPicture: { id: 4 } })).toBe(1)
		expect(onboardingPosition({ ...IDENTITE, mainPicture: { id: 4 } })).toBe(2)
	})
})

describe('l’identité de l’accueil : la spécialité est obligatoire', () => {
	test('sans spécialité, le message est sous le champ', () => {
		const lue = onboardingIdentitySchema.safeParse({ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: '  ' })
		expect(lue.success).toBe(false)
		expect(lue.error?.issues.map(i => [i.path[0], i.message])).toEqual([['specialite', 'Indique ta spécialité.']])
	})

	test('le nom d’artiste reste facultatif', () => {
		expect(
			onboardingIdentitySchema.safeParse({ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' })
				.success
		).toBe(true)
	})

	test('la version stricte refuse un champ réservé', () => {
		const base = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }
		expect(strictOnboardingIdentitySchema.safeParse(base).success).toBe(true)
		expect(strictOnboardingIdentitySchema.safeParse({ ...base, statut: 'publie' }).success).toBe(false)
		expect(strictOnboardingIdentitySchema.safeParse({ ...base, origine: 'ia' }).success).toBe(false)
	})
})
