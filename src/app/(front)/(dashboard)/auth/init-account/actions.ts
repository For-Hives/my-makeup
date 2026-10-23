'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { IdentityValues } from '@/lib/dashboard/identity'
import { requestUser } from '@/lib/dashboard/request'
import { FAILURE_MESSAGE, MESSAGE_SESSION, type SaveResult } from '@/lib/dashboard/result'
import { saveOnboardingIdentity } from '@/lib/dashboard/save-onboarding'

/**
 * The save of the onboarding that differs from those of the space (ticket 140): the identity, speciality
 * required. The other steps (zone, photo, networks, contact details, offers) are saved by the actions of
 * her space (issue 1009). An action is a
 * public endpoint: the session is read again, the origin is checked against the origins Payload
 * trusts, and the profile written is the one of her account. The location is saved by
 * `saveMyLocation`, as in her space.
 */
async function trustContext() {
	const context = await requestUser()
	if (context === null) return { ok: false as const, message: MESSAGE_SESSION, session: 'expiree' as const }
	const origin = (await headers()).get('origin')
	if (origin !== null && !context.payload.config.csrf.includes(origin))
		return { ok: false as const, message: FAILURE_MESSAGE }
	return context
}

/** Saves the first step: her identity, speciality required. */
export async function saveMyOnboardingIdentity(saisie: unknown): Promise<SaveResult<IdentityValues>> {
	const context = await trustContext()
	if ('ok' in context) return context
	const result = await saveOnboardingIdentity(context.payload, context.utilisateur, saisie)
	if (result.ok) revalidatePath('/auth/profil')
	return result
}
