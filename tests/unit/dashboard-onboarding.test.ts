import { describe, expect, test } from 'bun:test'
import {
	onboardingIdentitySchema,
	onboardingPosition,
	remainingSteps,
	strictOnboardingIdentitySchema,
} from '@/lib/dashboard/onboarding'

/**
 * The onboarding (ticket 140; plan 02 E02): the step shown is read from the stored profile, by the
 * single rule of a profile, and the speciality, which the space leaves optional, is required.
 */

const IDENTITY = { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée' }
const CITY = { name: 'Lille', inseeCode: '59350' }

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
		expect(onboardingPosition(IDENTITY)).toBe(2)
		// A commune with no code is no commune the rule can read.
		expect(onboardingPosition({ ...IDENTITY, city: { name: 'Lille' } })).toBe(2)
	})

	test('identité et commune faites, sans photo : étape 3', () => {
		expect(onboardingPosition({ ...IDENTITY, city: CITY })).toBe(3)
	})

	test('les trois faites : terminée, et c’est exactement un profil actif', () => {
		expect(onboardingPosition({ ...IDENTITY, city: CITY, mainPicture: { id: 4 } })).toBe('terminee')
	})

	test('une photo sans le reste ne saute pas d’étape', () => {
		expect(onboardingPosition({ mainPicture: { id: 4 } })).toBe(1)
		expect(onboardingPosition({ ...IDENTITY, mainPicture: { id: 4 } })).toBe(2)
	})
})

describe('les étapes qui restent (ticket 296)', () => {
	test('un profil vide a les trois étapes à faire, la première est la 1', () => {
		expect(remainingSteps({})).toEqual({ reste: 3, premiere: 1 })
		expect(remainingSteps(null)).toEqual({ reste: 3, premiere: 1 })
	})

	test('chaque étape faite en retire une, la première non faite est celle où mène « Reprendre »', () => {
		expect(remainingSteps(IDENTITY)).toEqual({ reste: 2, premiere: 2 })
		expect(remainingSteps({ ...IDENTITY, city: CITY })).toEqual({ reste: 1, premiere: 3 })
	})

	test('une photo sans le reste compte pour une étape faite : il en reste deux, la première est la 1', () => {
		expect(remainingSteps({ mainPicture: { id: 4 } })).toEqual({ reste: 2, premiere: 1 })
	})

	test('les trois faites : plus rien, et c’est exactement la position « terminée »', () => {
		const done = { ...IDENTITY, city: CITY, mainPicture: { id: 4 } }
		expect(remainingSteps(done)).toEqual({ reste: 0, premiere: null })
		expect(onboardingPosition(done)).toBe('terminee')
	})
})

describe('l’identité de l’accueil : la spécialité est obligatoire', () => {
	test('sans spécialité, le message est sous le champ', () => {
		const read = onboardingIdentitySchema.safeParse({
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialtyBullets: '',
			specialtyOther: '  ',
		})
		expect(read.success).toBe(false)
		expect(read.error?.issues.map(i => [i.path[0], i.message])).toEqual([
			['specialtyBullets', 'Indique ta spécialité.'],
		])
	})

	test('une puce seule suffit, une clé inconnue est refusée', () => {
		const base = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialtyOther: '' }
		expect(onboardingIdentitySchema.safeParse({ ...base, specialtyBullets: 'wedding,event' }).success).toBe(true)
		expect(onboardingIdentitySchema.safeParse({ ...base, specialtyBullets: 'wedding,nope' }).success).toBe(false)
	})

	test('le nom d’artiste reste facultatif', () => {
		expect(
			onboardingIdentitySchema.safeParse({
				prenom: 'Léa',
				nom: 'Fictive',
				nomArtiste: '',
				specialtyBullets: '',
				specialtyOther: 'Mariée',
			}).success
		).toBe(true)
	})

	test('la version stricte refuse un champ réservé', () => {
		const base = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialtyBullets: '', specialtyOther: 'Mariée' }
		expect(strictOnboardingIdentitySchema.safeParse(base).success).toBe(true)
		expect(strictOnboardingIdentitySchema.safeParse({ ...base, statut: 'publie' }).success).toBe(false)
		expect(strictOnboardingIdentitySchema.safeParse({ ...base, origine: 'ia' }).success).toBe(false)
	})
})
