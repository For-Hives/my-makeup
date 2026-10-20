/**
 * The onboarding of a new makeup artist (ticket 140; plan 01 §3.3 P7.6; plan 02 E02): three steps
 * (identity, zone, main photo) after the confirmation of her address. One step is saved before the
 * next one opens, and she can leave and come back: the step to show is read from what the server
 * stored, never from what the browser remembers.
 *
 * Nothing is computed here on its own: « done » is what the single rule of a profile says
 * (src/lib/profil/completude.ts), so that a profile that went through the three steps is `actif`
 * (main photo, usable city and speciality) and the onboarding cannot disagree with the space.
 */

import { z } from 'zod'
import { ORIGINES_DECLAREES } from '../analytics/events'
import { completude } from '../profil/completude'
import { champsDuProfil, type DocumentDuProfil } from '../profil/etat'
import { IDENTITE_MAX, schemaDeLIdentite, schemaDeLIdentiteStrict } from './identity'

export const ETAPES = [1, 2, 3] as const
export type EtapeDAccueil = (typeof ETAPES)[number]

/** Where she stands: a step still to do, or all three done. */
export type PositionDAccueil = EtapeDAccueil | 'terminee'

export const TITRES_DES_ETAPES: Readonly<Record<EtapeDAccueil, string>> = {
	1: 'Ton identité',
	2: 'Ta zone',
	3: 'Ta photo principale',
}

/** The chapter of the onboarding where each step is seen from, in the stepper. */
export const NOMS_DES_ETAPES: Readonly<Record<EtapeDAccueil, string>> = {
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
export function positionDAccueil(profil: DocumentDuProfil | null | undefined): PositionDAccueil {
	const lecture = completude(champsDuProfil(profil))
	if (lecture.manquants.includes('nom') || !lecture.conditions.specialite) return 1
	if (!lecture.conditions.villeExploitable) return 2
	if (!lecture.conditions.photoPrincipale) return 3
	return 'terminee'
}

/** The message under the speciality, which the onboarding asks for and the space leaves optional. */
export const MESSAGE_SPECIALITE = 'Indique ta spécialité.'

const specialiteRequise = z
	.string({ error: MESSAGE_SPECIALITE })
	.trim()
	.min(1, MESSAGE_SPECIALITE)
	.max(IDENTITE_MAX, `Ta spécialité ne doit pas dépasser ${IDENTITE_MAX} caractères.`)

/**
 * The identity as the first step asks for it: the four fields of the space, but the speciality is
 * required, since without it the profile cannot be active. The shared schema stays as it is.
 */
export const schemaDeLIdentiteDAccueil = schemaDeLIdentite.extend({ specialite: specialiteRequise })
export const schemaDeLIdentiteDAccueilStrict = schemaDeLIdentiteStrict.extend({ specialite: specialiteRequise })

/** The answers to « Comment as-tu connu My Makeup ? », as the old site words them. */
export const LIBELLES_DES_ORIGINES: Readonly<Record<(typeof ORIGINES_DECLAREES)[number], string>> = {
	instagram: 'Instagram',
	google: 'Recherche Google',
	'bouche-a-oreille': 'Bouche-à-oreille',
	ecole: 'École de maquillage',
	ia: 'Une IA (ChatGPT, Gemini…)',
	autre: 'Autre',
}
export { ORIGINES_DECLAREES }
