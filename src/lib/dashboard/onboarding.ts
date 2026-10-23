/**
 * The onboarding of a new makeup artist (ticket 140; plan 01 §3.3 P7.6; plan 02 E02; issue 1009): five
 * steps after the confirmation of her address.
 *
 * 1. you: her speciality (her names come from the sign-up, and are asked only when the account has none);
 * 2. where: her zone;
 * 3. her main photo;
 * 4. how to reach her: Instagram, then a phone or an email she chooses to show;
 * 5. her flagship offer, with a price.
 *
 * The first three make the profile `actif` (listed in the search) and are the essential ones. The last
 * two lead to a publishable profile and can wait: « Plus tard » leaves them to the space. One step is
 * saved before the next one opens, and she can leave and come back: the step to show is read from what
 * the server stored, never from what the browser remembers, and a step the profile already holds
 * (an import, a previous visit) is skipped.
 *
 * Nothing is computed here on its own: « done » is what the single rule of a profile says
 * (src/lib/profile/completeness.ts), so that the onboarding cannot disagree with the space.
 */

import { z } from 'zod'
import { DECLARED_ORIGINS } from '../analytics/events'
import { completeness } from '../profile/completeness'
import { type ProfileDocument, profileFields } from '../profile/state'
import { identitySchema, strictIdentitySchema } from './identity'

export const STEPS = [1, 2, 3, 4, 5] as const
export type OnboardingStep = (typeof STEPS)[number]

/** The steps that make a profile active: a sign-in sends her back for these, and the banner counts these. */
export const ESSENTIAL_STEPS = [1, 2, 3] as const

/** The steps she can leave for later (« Plus tard »): they lead to a publishable profile. */
export const OPTIONAL_STEPS = [4, 5] as const

/** Where she stands: a step still to do, or all five done. */
export type OnboardingPosition = OnboardingStep | 'terminee'

export const STEPS_TITLES: Readonly<Record<OnboardingStep, string>> = {
	1: 'Ta spécialité',
	2: 'Ta zone',
	3: 'Ta photo principale',
	4: 'Comment te joindre',
	5: 'Ta prestation phare',
}

/** The chapter of the onboarding where each step is seen from, in the stepper. */
export const STEPS_NAMES: Readonly<Record<OnboardingStep, string>> = {
	1: 'Toi',
	2: 'Où',
	3: 'Photo',
	4: 'Contact',
	5: 'Prestation',
}

/** Which of the five steps her stored profile has done, by the single rule of a profile. */
export function stepsDone(profil: ProfileDocument | null | undefined): Readonly<Record<OnboardingStep, boolean>> {
	const reading = completeness(profileFields(profil))
	return {
		1: !reading.manquants.includes('nom') && reading.conditions.specialite,
		2: reading.conditions.villeExploitable,
		3: reading.conditions.photoPrincipale,
		4: reading.conditions.canalDeContact,
		5: reading.conditions.offreChiffree,
	}
}

/**
 * The first step her stored profile has not done yet, or `terminee`:
 * 1. her first and last name and a speciality;
 * 2. a commune of the official list (the city the rule reads);
 * 3. a main photo;
 * 4. a contact channel she shows (a network, or a phone or an email she chose to show);
 * 5. an offer with an amount.
 * A profile that holds the first three is `actif` by the single rule.
 */
export function onboardingPosition(profil: ProfileDocument | null | undefined): OnboardingPosition {
	const done = stepsDone(profil)
	return STEPS.find(step => !done[step]) ?? 'terminee'
}

/**
 * What the onboarding still has to do for this profile to be visible (ticket 296): how many of the
 * three essential steps are not done, and the first of them, where « Reprendre » leads. `reste` is 0
 * and `premiere` null when they are all done; a profile that is not stored yet (`null`) has all three
 * left. The two optional steps are not counted: an active profile is not sent back for them.
 */
export function remainingSteps(profil: ProfileDocument | null | undefined): {
	readonly reste: number
	readonly premiere: (typeof ESSENTIAL_STEPS)[number] | null
} {
	const done = stepsDone(profil)
	const left = ESSENTIAL_STEPS.filter(step => !done[step])
	return { reste: left.length, premiere: left[0] ?? null }
}

/** The message under the speciality, which the onboarding asks for and the space leaves optional. */
export const SPECIALTY_MESSAGE = 'Indique ta spécialité.'

/** A speciality is a bullet or an « Autre » text: one of the two at least. */
const hasSpecialty = (identity: { specialtyBullets: string; specialtyOther: string }): boolean =>
	identity.specialtyBullets !== '' || identity.specialtyOther !== ''
const SPECIALTY_REFINEMENT = { error: SPECIALTY_MESSAGE, path: ['specialtyBullets'] }

/**
 * The identity as the first step asks for it: the fields of the space, but a speciality is required
 * (a bullet, or « Autre » filled in), since without it the profile cannot be active. The shared schema
 * stays as it is.
 */
export const onboardingIdentitySchema = identitySchema.refine(hasSpecialty, SPECIALTY_REFINEMENT)
export const strictOnboardingIdentitySchema = strictIdentitySchema.refine(hasSpecialty, SPECIALTY_REFINEMENT)

/** The answers to « Comment as-tu connu My Makeup ? », as the old site words them. */
export const ORIGINS_LABELS: Readonly<Record<(typeof DECLARED_ORIGINS)[number], string>> = {
	instagram: 'Instagram',
	google: 'Recherche Google',
	'bouche-a-oreille': 'Bouche-à-oreille',
	ecole: 'École de maquillage',
	ia: 'Une IA (ChatGPT, Gemini…)',
	autre: 'Autre',
}
export { DECLARED_ORIGINS as ORIGINES_DECLAREES }
