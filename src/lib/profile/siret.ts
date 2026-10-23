// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { luhnValid } from '../legal'

/**
 * The SIRET of a makeup artist (ticket 021, issue 1004): 14 digits and the check key of the numbers of
 * the registry (Luhn). Empty is allowed: it is optional, and a profile without one is not worse off
 * anywhere (src/lib/search/ranking.ts).
 *
 * Only the shape and the key are checked here. Whether the establishment exists and is active is the work
 * of the activity check (src/lib/activity/).
 */
export const MESSAGE_SIRET = 'Le SIRET compte 14 chiffres, sans espace.'
export const MESSAGE_SIRET_CHECK =
	'Ce SIRET n’est pas valide : vérifie les chiffres, il y a sans doute une faute de frappe.'

/** The SIREN of La Poste: its establishments do not follow Luhn, their digits add up to a multiple of 5. */
const LA_POSTE_SIREN = '356000000'

/** What she typed without the separators people put in a SIRET (spaces, no-break spaces, dots, dashes). */
export const normalizeSiret = (typed: string): string => typed.replace(/[\s  .-]/g, '')

function keyIsValid(siret: string): boolean {
	if (siret.startsWith(LA_POSTE_SIREN)) return [...siret].reduce((sum, digit) => sum + Number(digit), 0) % 5 === 0
	return luhnValid(siret)
}

/** `true`, or the message the field shows. The signature of a Payload `validate`. */
export function validateSiret(valeur: string | null | undefined): true | string {
	if (valeur === null || valeur === undefined || valeur === '') return true
	if (!/^\d{14}$/.test(valeur)) return MESSAGE_SIRET
	return keyIsValid(valeur) ? true : MESSAGE_SIRET_CHECK
}
