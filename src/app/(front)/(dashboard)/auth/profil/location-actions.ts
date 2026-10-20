'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { findCities, suggestion } from '@/lib/dashboard/city-reference'
import { CITIES_SERVICE_MESSAGE, type LocationValues, type SearchResult } from '@/lib/dashboard/location'
import { withPublishableTransition } from '@/lib/dashboard/publishable-transition'
import { requestUser } from '@/lib/dashboard/request'
import { FAILURE_MESSAGE, MESSAGE_SESSION, type SaveResult } from '@/lib/dashboard/result'
import { saveLocation } from '@/lib/dashboard/save-location'

/** Searches of communes a minute for one account: far above what typing needs, below a script's pace. */
const SEARCHES_PER_MINUTE = 120
const searchesRateLimit = createRateLimit({ nom: 'communes-espace', limite: SEARCHES_PER_MINUTE, fenetreMs: 60_000 })

/** Whether the origin of the request is one Payload trusts (an action is a public endpoint). */
async function trustOrigin(trusted: readonly string[]): Promise<boolean> {
	const origin = (await headers()).get('origin')
	return origin === null || trusted.includes(origin)
}

/**
 * The communes that match the text she types (ticket 123). The session is read again here and the
 * origin checked: the list of communes is asked for signed-in makeup artists only, never for the
 * browser of a visitor. An account is braked, not an address. The text is cut by the search itself
 * (length, characters, an address is never sent on).
 */
export async function findMyCities(texte: unknown): Promise<SearchResult> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION }
	if (!(await trustOrigin(context.payload.config.csrf)) || typeof texte !== 'string')
		return { ok: false, message: FAILURE_MESSAGE }
	if (!searchesRateLimit.prendre(`${context.utilisateur.id}`).autorise) return { ok: false, message: FAILURE_MESSAGE }

	const response = await findCities(texte)
	if (response.genre === 'panne') return { ok: false, message: CITIES_SERVICE_MESSAGE }
	if (response.genre === 'rien') return { ok: true, communes: [], motif: response.motif }
	return { ok: true, communes: response.communes.map(suggestion) }
}

/**
 * Saves the location of the signed-in makeup artist (ticket 123), as `saveMyIdentity` saves
 * her identity: session read again, origin checked, the profile of her account, the values the
 * database stored given back, or a message in French. It never redirects.
 */
export async function saveMyLocation(saisie: unknown): Promise<SaveResult<LocationValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	if (!(await trustOrigin(payload.config.csrf))) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveLocation(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}
