/**
 * The link « Répondre par email » of a contact message in the admin panel (ticket 308). It holds the
 * recipient and the subject, and nothing of the message: what the visitor typed never travels in an address.
 *
 * Relative imports on purpose: shared with the unit tests, no `next` import.
 */

/** The subject of the reply. */
export const REPLY_SUBJECT = 'Re : votre message à My Makeup'

/**
 * One address and nothing else: a character that would add a recipient (`,` `;`), a header or a field
 * (`?` `&` `#`, a line break) refuses the link, so the stored address can never write the rest of the mail.
 */
const PLAIN_ADDRESS = /^[^\s@,;?&#<>"%]+@[^\s@,;?&#<>"%]+\.[^\s@,;?&#<>"%]+$/

/** The `mailto:` link of a reply, or null when the stored address is not a plain one. */
export function replyMailto(email: unknown): string | null {
	if (typeof email !== 'string' || !PLAIN_ADDRESS.test(email)) return null
	return `mailto:${email}?subject=${encodeURIComponent(REPLY_SUBJECT)}`
}
