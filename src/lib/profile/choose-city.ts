/**
 * The choice of a commune of a zone review by an admin, from the sheet of the profile (ticket 308; audit UX
 * no. 25). It saves what the makeup artist's own choice saves (src/lib/dashboard/save-location.ts): the commune
 * the official list gives for the code, its centre and its postal codes included, then the server empties the
 * review (`clearZoneReview`, ticket 259). The radius and « à domicile » are left as they are.
 *
 * Any commune the review lists is accepted, whatever the reason (a shared postal code, homonyms), because the
 * admin sees them all; the makeup artist's banner offers only the shared postal code. Only a commune of the review is accepted: a code that is not one of its candidates is refused before the
 * list is asked, so a request cannot put any commune on a profile.
 *
 * Relative imports on purpose: the route of the collection calls it, the Payload CLI loads that.
 */

import type { Payload } from 'payload'
import { type CityFromCode, cityFromCode } from '../dashboard/city-reference'
import { zoneReviewView } from '../dashboard/zone-review'

/** The user the write is made as: an admin's account. */
type Actor = NonNullable<Awaited<ReturnType<Payload['auth']>>['user']>

export type ChooseCityCode = 'not-found' | 'not-a-candidate' | 'unknown-city' | 'service-down' | 'failed'

export type ChooseCityResult = { ok: true } | { ok: false; code: ChooseCityCode; message: string }

/** What the choice asks from outside: the official list. A parameter so that a test changes it. */
export interface ChooseCityDeps {
	ask: (inseeCode: string) => Promise<CityFromCode>
}

const MESSAGES: Record<ChooseCityCode, string> = {
	'not-found': 'Ce profil n’existe pas.',
	'not-a-candidate': 'Cette commune n’est pas l’une des communes possibles de ce profil.',
	'unknown-city': 'Cette commune n’est pas dans la liste officielle.',
	'service-down': 'La liste officielle des communes ne répond pas. Réessaie dans un instant.',
	failed: 'La commune n’a pas pu être enregistrée. Réessaie dans un instant.',
}

const refused = (code: ChooseCityCode): ChooseCityResult => ({ ok: false, code, message: MESSAGES[code] })

export async function chooseReviewCity(
	payload: Payload,
	actor: Actor,
	profileId: number,
	inseeCode: string,
	deps: ChooseCityDeps = { ask: cityFromCode }
): Promise<ChooseCityResult> {
	const profile = await payload
		.findByID({
			collection: 'profiles',
			depth: 0,
			disableErrors: true,
			id: profileId,
			overrideAccess: false,
			select: { zoneReview: true },
			user: actor,
		})
		.catch(() => null)
	if (!profile) return refused('not-found')

	const view = zoneReviewView(profile.zoneReview)
	if (view === null || !view.communes.some(candidate => candidate.codeInsee === inseeCode))
		return refused('not-a-candidate')

	const answer = await deps.ask(inseeCode)
	if (answer.genre === 'panne') return refused('service-down')
	if (answer.genre === 'inconnue') return refused('unknown-city')

	const { nom: name, latitude, longitude, codesPostaux: postalCodes } = answer.commune
	try {
		await payload.update({
			collection: 'profiles',
			data: {
				zoneKind: 'city',
				city: { name, inseeCode, latitude, longitude, postalCodes: [...postalCodes] },
			},
			depth: 0,
			id: profileId,
			overrideAccess: false,
			user: actor,
		})
	} catch {
		return refused('failed')
	}
	return { ok: true }
}
