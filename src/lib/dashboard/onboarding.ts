/**
 * The onboarding of a new makeup artist (ticket 140; plan 01 §3.3 P7.6; plan 02 E02): three steps
 * (identity, zone, main photo) after the confirmation of her address. One step is saved before the
 * next one opens, and she can leave and come back: the step to show is read from what the server
 * stored, never from what the browser remembers.
 *
 * Nothing is computed here on its own: « done » is what the single rule of a profile says
 * (src/lib/profile/completeness.ts), so that a profile that went through the three steps is `actif`
 * (main photo, usable city and speciality) and the onboarding cannot disagree with the space.
 */

import { z } from 'zod'
import { ORIGINES_DECLAREES } from '../analytics/events'
import { completeness } from '../profile/completeness'
import { type ProfileDocument, profileFields } from '../profile/state'
import { IDENTITY_MAX, identitySchema, strictIdentitySchema } from './identity'

export const STEPS = [1, 2, 3] as const
export type OnboardingStep = (typeof STEPS)[number]

/** Where she stands: a step still to do, or all three done. */
export type OnboardingPosition = OnboardingStep | 'terminee'

export const STEPS_TITLES: Readonly<Record<OnboardingStep, string>> = {
	1: 'Ton identité',
	2: 'Ta zone',
	3: 'Ta photo principale',
}

/** The chapter of the onboarding where each step is seen from, in the stepper. */
export const STEPS_NAMES: Readonly<Record<OnboardingStep, string>> = {
	1: 'Identité',
	2: 'Zone',
	3: 'Photo',
}

/**
 * The first step her stored profile has not done yet, or `terminee`:
 * 1. her first and last name and a speciality;
 * 2. a commune of the official list (the city the rule reads);
 * 3. a main photo.
 * A profile that holds the three is `actif` by the single rule.
 */
export function onboardingPosition(profil: ProfileDocument | null | undefined): OnboardingPosition {
	const reading = completeness(profileFields(profil))
	if (reading.manquants.includes('nom') || !reading.conditions.specialite) return 1
	if (!reading.conditions.villeExploitable) return 2
	if (!reading.conditions.photoPrincipale) return 3
	return 'terminee'
}

/** The message under the speciality, which the onboarding asks for and the space leaves optional. */
export const SPECIALTY_MESSAGE = 'Indique ta spécialité.'

const requiredSpecialty = z
	.string({ error: SPECIALTY_MESSAGE })
	.trim()
	.min(1, SPECIALTY_MESSAGE)
	.max(IDENTITY_MAX, `Ta spécialité ne doit pas dépasser ${IDENTITY_MAX} caractères.`)

/**
 * The identity as the first step asks for it: the four fields of the space, but the speciality is
 * required, since without it the profile cannot be active. The shared schema stays as it is.
 */
export const onboardingIdentitySchema = identitySchema.extend({ specialite: requiredSpecialty })
export const strictOnboardingIdentitySchema = strictIdentitySchema.extend({ specialite: requiredSpecialty })

/** The answers to « Comment as-tu connu My Makeup ? », as the old site words them. */
export const ORIGINS_LABELS: Readonly<Record<(typeof ORIGINES_DECLAREES)[number], string>> = {
	instagram: 'Instagram',
	google: 'Recherche Google',
	'bouche-a-oreille': 'Bouche-à-oreille',
	ecole: 'École de maquillage',
	ia: 'Une IA (ChatGPT, Gemini…)',
	autre: 'Autre',
}
export { ORIGINES_DECLAREES }
