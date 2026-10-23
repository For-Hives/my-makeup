/**
 * What she has chosen in the zone field of her space, and the request it makes (tickets 265 and
 * 266). The field and the step of the onboarding share it: a commune of the list, or countries and
 * a town. The checks are those of the server (src/lib/profile/zone.ts), so that the sentence under
 * the field is the one the server would answer.
 */

import { ABROAD_MESSAGES, countriesErrors, townErrors } from '../profile/zone'
import {
	CITY_TO_CHOOSE_MESSAGE,
	type LocationInput,
	type LocationValues,
	type SuggestedCity,
	textRadius,
} from './location'

export type ZoneChoice =
	| { kind: 'city'; city: SuggestedCity | null }
	| { kind: 'countries'; countries: string[]; town: string }

/** The choice a stored zone starts from. */
export function initialChoice(valeurs: LocationValues): ZoneChoice {
	return valeurs.kind === 'countries'
		? { kind: 'countries', countries: [...valeurs.countries], town: valeurs.town }
		: {
				kind: 'city',
				city:
					valeurs.codeInsee === ''
						? null
						: // The bare name is not stored apart: the label « Annecy (74) » stands for it.
							{ codeInsee: valeurs.codeInsee, libelle: valeurs.libelle, nom: valeurs.libelle },
			}
}

/** Whether the choice differs from the stored zone: for the panel that asks before it closes. */
export function choiceChanged(choice: ZoneChoice, valeurs: LocationValues): boolean {
	if (choice.kind !== valeurs.kind) return choice.kind === 'countries' ? choice.countries.length > 0 : true
	if (choice.kind === 'city') return (choice.city?.codeInsee ?? '') !== valeurs.codeInsee
	return choice.countries.join() !== valeurs.countries.join() || choice.town.trim() !== valeurs.town
}

/** Whether the radius is asked: around a commune, or around a single country (where a town may be named). */
export const radiusAsked = (choice: ZoneChoice): boolean => choice.kind === 'city' || choice.countries.length === 1

/**
 * The request for the server from what she chose and typed, or the sentence to show under the
 * field when nothing can be sent. The radius is sent only when it is asked.
 */
export function zoneRequest(
	choice: ZoneChoice,
	rayon: string,
	atHome: boolean
): { ok: true; saisie: LocationInput } | { ok: false; message: string; champ: 'zone' | 'ville' } {
	const typed = radiusAsked(choice) ? textRadius(rayon) : null
	// A radius that is no number is not sent: the form refuses it under its field before this point.
	const radiusKm = typed !== null && Number.isNaN(typed) ? null : typed
	if (choice.kind === 'city') {
		return choice.city === null
			? { ok: false, message: CITY_TO_CHOOSE_MESSAGE, champ: 'zone' }
			: { ok: true, saisie: { kind: 'city', codeInsee: choice.city.codeInsee, rayonKm: radiusKm, aDomicile: atHome } }
	}
	const town = choice.town.trim() === '' ? null : choice.town.trim()
	const countriesMessage =
		choice.countries.length === 0 ? ABROAD_MESSAGES.countriesFranceOnly : countriesErrors(choice.countries)[0]
	if (countriesMessage !== undefined) return { ok: false, message: countriesMessage, champ: 'zone' }
	const townMessage = townErrors(town, choice.countries)[0]
	return townMessage === undefined
		? {
				ok: true,
				saisie: { kind: 'countries', countries: choice.countries, town, rayonKm: radiusKm, aDomicile: atHome },
			}
		: { ok: false, message: townMessage, champ: 'ville' }
}
