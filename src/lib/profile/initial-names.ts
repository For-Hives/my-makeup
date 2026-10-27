/**
 * The names a profile starts with (issue 1009): she types her first and last name once, at sign-up (or
 * Google gives them), and her profile already holds them when she reaches her space, which then
 * asks only for her speciality.
 *
 * The server that creates the account hands them to the creation of its profile through the context of
 * the request (`INITIAL_NAMES_KEY`): nothing a visitor sends reaches it, since the context is not part of
 * a request. A name that is not text, or empty after trimming, is none.
 *
 * Relative imports only: the collection that reads this file is also loaded by the Payload CLI.
 */

/** The key of the request context under which the creation of an account hands over the names. */
export const INITIAL_NAMES_KEY = 'initialNames'

/** The longest a name is kept: the same bound as the sign-up form. */
export const INITIAL_NAME_MAX = 100

export interface InitialNames {
	readonly firstName: string
	readonly lastName: string
}

const clean = (value: unknown): string =>
	typeof value === 'string' ? Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, INITIAL_NAME_MAX).join('') : ''

/** The names carried by a request context, or null when it carries none (or neither is usable). */
export function initialNamesOf(context: unknown): InitialNames | null {
	if (typeof context !== 'object' || context === null) return null
	const carried: unknown = (context as Record<string, unknown>)[INITIAL_NAMES_KEY]
	if (typeof carried !== 'object' || carried === null) return null
	const firstName = clean((carried as Record<string, unknown>).firstName)
	const lastName = clean((carried as Record<string, unknown>).lastName)
	return firstName === '' && lastName === '' ? null : { firstName, lastName }
}
