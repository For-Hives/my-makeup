'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { COURSES } from '@/lib/dashboard/courses'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import type { ListDefinition, SavedList } from '@/lib/dashboard/list'
import { withPublishableTransition } from '@/lib/dashboard/publishable-transition'
import { requestUser } from '@/lib/dashboard/request'
import { FAILURE_MESSAGE, MESSAGE_SESSION, type SaveResult } from '@/lib/dashboard/result'
import { saveList } from '@/lib/dashboard/save-list'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'

/**
 * Saves a list of the signed-in makeup artist: same guards as her identity (the session read again,
 * the origin checked against the origins Payload trusts, the profile found by her account), and the
 * values the database stored given back. It never redirects: the panel keeps what she typed.
 */
async function saveMyList(definition: ListDefinition, saisie: unknown): Promise<SaveResult<SavedList>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveList(payload, user, saisie, definition))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/** Her experiences (ticket 129). */
export async function saveMyExperiences(saisie: unknown): Promise<SaveResult<SavedList>> {
	return saveMyList(EXPERIENCES, saisie)
}

/** Her courses (ticket 130). */
export async function saveMyCourses(saisie: unknown): Promise<SaveResult<SavedList>> {
	return saveMyList(COURSES, saisie)
}

/** Her offers (ticket 131). */
export async function saveMyServiceOffers(saisie: unknown): Promise<SaveResult<SavedList>> {
	return saveMyList(SERVICE_OFFERS, saisie)
}
