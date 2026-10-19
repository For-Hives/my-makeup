import { createHash } from 'node:crypto'

/**
 * One mailbox, one key (ticket 084). Gmail reads « l.ea@gmail.com », « lea+x@gmail.com » and
 * « lea@googlemail.com » as the mailbox of « lea@gmail.com »: a sign-up with such a variant of an
 * address that already has an account is the same person (or a fake account made from the same
 * mailbox, which is what the spam of 12/2025 to 09/2026 did).
 *
 * - Every address is trimmed and lower-cased.
 * - For `gmail.com` and `googlemail.com` only: what follows a `+` in the local part goes, the dots
 *   go, and the domain is `gmail.com`. Any other provider keeps its address as it is: there, a dot
 *   or a `+` may make another mailbox.
 *
 * Pure: no `next` import, no Payload.
 */

export const DOMAINES_GMAIL = ['gmail.com', 'googlemail.com'] as const

/** The local part and the domain of an address, or `null` when it has no single `@`. */
function couper(email: string): { local: string; domaine: string } | null {
	const adresse = email.trim().toLowerCase()
	const arobase = adresse.lastIndexOf('@')
	if (arobase <= 0 || arobase === adresse.length - 1) return null
	return { local: adresse.slice(0, arobase), domaine: adresse.slice(arobase + 1) }
}

/** The key of the mailbox: the address itself, or the one form shared by the variants of a Gmail box. */
export function emailCanonique(email: string): string {
	const morceaux = couper(email)
	if (!morceaux) return email.trim().toLowerCase()
	if (!(DOMAINES_GMAIL as readonly string[]).includes(morceaux.domaine)) return `${morceaux.local}@${morceaux.domaine}`
	const sansEtiquette = morceaux.local.split('+')[0] ?? ''
	return `${sansEtiquette.replaceAll('.', '')}@gmail.com`
}

/** The local part of the canonical form of a Gmail address, or `null` for any other provider. */
export function localGmailCanonique(email: string): string | null {
	const morceaux = couper(email)
	if (!morceaux || !(DOMAINES_GMAIL as readonly string[]).includes(morceaux.domaine)) return null
	const local = (morceaux.local.split('+')[0] ?? '').replaceAll('.', '')
	return local === '' ? null : local
}

/**
 * What a counter in memory is keyed by: a hash of the canonical form, so that no address sits in
 * the process memory as text and a variant of an address shares its mailbox's counter.
 */
export const cleDeBoite = (email: string): string => createHash('sha256').update(emailCanonique(email)).digest('hex')
