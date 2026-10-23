import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The token of the unsubscribe link of a reminder (issue 1006): `<profile>.<signature>`. The signature is an
 * HMAC of the profile number, keyed with the secret of the application, so that nobody can unsubscribe a
 * profile she does not hold the link of, and nothing is stored to check it. It carries no address, no name
 * and no date, and it never expires: a link in an old mail must keep working.
 *
 * Pure but for `node:crypto`: no `next` import, no Payload.
 */

const PURPOSE = 'reminders-unsubscribe'

function signature(secret: string, profileId: number): Buffer {
	return createHmac('sha256', secret).update(`${PURPOSE}:${profileId}`).digest()
}

export function unsubscribeToken(secret: string, profileId: number): string {
	return `${profileId}.${signature(secret, profileId).toString('base64url')}`
}

/** The profile a token is for, or `undefined` when it is malformed, altered or signed with another secret. */
export function readUnsubscribeToken(secret: string, token: string): number | undefined {
	const match = /^([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/.exec(token)
	if (!match) return undefined
	const profileId = Number(match[1])
	if (!Number.isSafeInteger(profileId)) return undefined
	const given = Buffer.from(match[2] ?? '', 'base64url')
	const expected = signature(secret, profileId)
	return given.length === expected.length && timingSafeEqual(given, expected) ? profileId : undefined
}
