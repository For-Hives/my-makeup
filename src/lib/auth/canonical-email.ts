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

export const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'] as const

/** The local part and the domain of an address, or `null` when it has no single `@`. */
function splitAt(email: string): { local: string; domaine: string } | null {
	const address = email.trim().toLowerCase()
	const atSign = address.lastIndexOf('@')
	if (atSign <= 0 || atSign === address.length - 1) return null
	return { local: address.slice(0, atSign), domaine: address.slice(atSign + 1) }
}

/** The key of the mailbox: the address itself, or the one form shared by the variants of a Gmail box. */
export function canonicalEmail(email: string): string {
	const parts = splitAt(email)
	if (!parts) return email.trim().toLowerCase()
	if (!(GMAIL_DOMAINS as readonly string[]).includes(parts.domaine)) return `${parts.local}@${parts.domaine}`
	const withoutTag = parts.local.split('+')[0] ?? ''
	return `${withoutTag.replaceAll('.', '')}@gmail.com`
}

/** The local part of the canonical form of a Gmail address, or `null` for any other provider. */
export function canonicalGmailLocal(email: string): string | null {
	const parts = splitAt(email)
	if (!parts || !(GMAIL_DOMAINS as readonly string[]).includes(parts.domaine)) return null
	const local = (parts.local.split('+')[0] ?? '').replaceAll('.', '')
	return local === '' ? null : local
}

/**
 * What a counter in memory is keyed by: a hash of the canonical form, so that no address sits in
 * the process memory as text and a variant of an address shares its mailbox's counter.
 */
export const mailboxKey = (email: string): string => createHash('sha256').update(canonicalEmail(email)).digest('hex')
