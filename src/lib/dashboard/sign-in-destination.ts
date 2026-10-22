import type { Payload } from 'payload'
import { COLLECTION_PROS } from '../access'
import { destinationAfterSignIn } from '../auth/return-to'
import { artistProfile, type DashboardUser } from './my-profile'
import { remainingSteps } from './onboarding'

/**
 * True when her onboarding is still to do: she has no profile yet, or her stored profile lacks one of
 * the three steps (ticket 296). Her own profile only, read as herself. A read that fails says
 * « not to do »: a sign-in never breaks on this question.
 */
export async function onboardingToDo(payload: Payload, user: DashboardUser): Promise<boolean> {
	try {
		if (user.collection !== COLLECTION_PROS) return false
		const profile = await artistProfile(payload, user)
		return remainingSteps(profile).reste > 0
	} catch {
		return false
	}
}

/**
 * Where a password sign-in leads: `returnTo`, or the onboarding for a profile that is not active
 * (see `destinationAfterSignIn`). The account is read from the session just opened, never from the form.
 */
export async function passwordSignInDestination(payload: Payload, token: string, returnTo: string): Promise<string> {
	try {
		// The token, not the cookie: Payload ignores a cookie that comes with no `Origin` (a call made by the server).
		const { user } = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })
		if (user === null || user === undefined) return returnTo
		return destinationAfterSignIn(returnTo, await onboardingToDo(payload, user as DashboardUser))
	} catch {
		return returnTo
	}
}

/** Where a Google sign-in of an existing account leads: the same rule, the account known by its identifier. */
export async function googleSignInDestination(
	payload: Payload,
	accountId: number | string,
	returnTo: string
): Promise<string> {
	try {
		const doc = await payload.findByID({ collection: 'pros', id: accountId, depth: 0, overrideAccess: true })
		const user = { ...doc, collection: 'pros' } as DashboardUser
		return destinationAfterSignIn(returnTo, await onboardingToDo(payload, user))
	} catch {
		return returnTo
	}
}
