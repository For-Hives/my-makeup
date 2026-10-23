import { describe, expect, test } from 'bun:test'
import {
	ESSENTIAL_STEPS,
	OPTIONAL_STEPS,
	onboardingIdentitySchema,
	onboardingPosition,
	remainingSteps,
	STEPS,
	STEPS_NAMES,
	STEPS_TITLES,
	stepsDone,
	strictOnboardingIdentitySchema,
} from '@/lib/dashboard/onboarding'

/**
 * The onboarding (ticket 140; plan 02 E02): the step shown is read from the stored profile, by the
 * single rule of a profile, and the speciality, which the space leaves optional, is required.
 */

const IDENTITY = { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée' }
const CITY = { name: 'Lille', inseeCode: '59350' }
const ACTIVE = { ...IDENTITY, city: CITY, mainPicture: { id: 4 } }
const PRICED = { serviceOffers: [{ priceFrom: 150 }] }

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

	test('les trois premières faites : étape 4 (te joindre), et c’est exactement un profil actif', () => {
		expect(onboardingPosition(ACTIVE)).toBe(4)
	})

	test('un lien Instagram fait l’étape 4 ; un téléphone caché ne la fait pas (un canal que personne ne voit n’en est pas un)', () => {
		expect(onboardingPosition({ ...ACTIVE, networks: { instagram: 'https://www.instagram.com/studio.fictif' } })).toBe(
			5
		)
		expect(onboardingPosition({ ...ACTIVE, contactDetails: { phone: '0600000000' }, publicContact: false })).toBe(4)
		expect(onboardingPosition({ ...ACTIVE, contactDetails: { phone: '0600000000' }, publicContact: true })).toBe(5)
	})

	test('une prestation sans montant ne fait pas l’étape 5 ; avec un montant, tout est fait', () => {
		const contact = { ...ACTIVE, networks: { instagram: 'https://www.instagram.com/studio.fictif' } }
		expect(onboardingPosition({ ...contact, serviceOffers: [{ priceFrom: null }] })).toBe(5)
		expect(onboardingPosition({ ...contact, ...PRICED })).toBe('terminee')
	})

	test('un profil importé qui a déjà un prix saute l’étape 5 mais reste à l’étape 4 s’il n’a pas de contact', () => {
		expect(onboardingPosition({ ...ACTIVE, ...PRICED })).toBe(4)
		expect(stepsDone({ ...ACTIVE, ...PRICED })).toEqual({ 1: true, 2: true, 3: true, 4: false, 5: true })
	})

	test('une photo sans le reste ne saute pas d’étape', () => {
		expect(onboardingPosition({ mainPicture: { id: 4 } })).toBe(1)
		expect(onboardingPosition({ ...IDENTITY, mainPicture: { id: 4 } })).toBe(2)
	})
})

describe('les cinq étapes', () => {
	test('cinq étapes, trois essentielles (elles rendent le profil actif), deux qu’on peut remettre à plus tard', () => {
		expect(STEPS).toEqual([1, 2, 3, 4, 5])
		expect(ESSENTIAL_STEPS).toEqual([1, 2, 3])
		expect(OPTIONAL_STEPS).toEqual([4, 5])
	})

	test('chaque étape a un titre et un nom court', () => {
		expect(STEPS_NAMES).toEqual({ 1: 'Toi', 2: 'Où', 3: 'Photo', 4: 'Contact', 5: 'Prestation' })
		expect(STEPS_TITLES[4]).toBe('Comment te joindre')
		expect(STEPS_TITLES[5]).toBe('Ta prestation phare')
	})

	test('les étapes faites se lisent sur le profil enregistré, pas ailleurs', () => {
		expect(stepsDone(null)).toEqual({ 1: false, 2: false, 3: false, 4: false, 5: false })
	})
})

describe('les étapes qui restent (ticket 296) : seulement les trois essentielles', () => {
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

	test('les trois faites : plus rien à faire pour être visible, même sans contact ni prix', () => {
		expect(remainingSteps(ACTIVE)).toEqual({ reste: 0, premiere: null })
		// The two optional steps are left to the space: a sign-in does not send her back to the onboarding for them.
		expect(onboardingPosition(ACTIVE)).toBe(4)
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
