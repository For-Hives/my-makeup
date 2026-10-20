/**
 * The SIRET of a makeup artist, as an admin writes it on her profile (ticket 021): 14 digits,
 * nothing else. Empty is allowed: most profiles have none.
 *
 * Only the shape is checked here. Whether the company is active is the work of the « Vérifier le
 * SIRET » action, after the switch (plan 01 §3.4).
 */
export const MESSAGE_SIRET = 'Le SIRET compte 14 chiffres, sans espace.'

/** `true`, or the message the field shows. The signature of a Payload `validate`. */
export function validateSiret(valeur: string | null | undefined): true | string {
	if (valeur === null || valeur === undefined || valeur === '') return true
	return /^\d{14}$/.test(valeur) ? true : MESSAGE_SIRET
}
