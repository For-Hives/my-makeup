import type { Payload } from 'payload'
import { type CityFromCode, cityFromCode } from './city-reference'
import {
	CITIES_SERVICE_MESSAGE,
	errorsByField,
	type LocationValues,
	locationValues,
	strictLocationSchema,
} from './location'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/** The question to the list of communes: a parameter so that a test can change it, never a request's. */
export type CityQuestion = (codeInsee: string) => Promise<CityFromCode>

/** The fields of the form, and the name Payload gives their paths. */
const FIELDS = ['codeInsee', 'rayonKm', 'aDomicile', 'countries', 'town'] as const
const pathField = (chemin: string): string =>
	chemin.startsWith('city')
		? 'codeInsee'
		: chemin === 'radiusKm'
			? 'rayonKm'
			: chemin === 'homeService'
				? 'aDomicile'
				: chemin.startsWith('countries')
					? 'countries'
					: chemin

/** The commune as the profile stores it. */
type StoredCity = {
	name: string
	inseeCode: string
	latitude: number | null
	longitude: number | null
	postalCodes: string[]
}

/**
 * Saves the location of the signed-in makeup artist (ticket 123; zones: tickets 265 and 266), and
 * tells the truth about it:
 *
 * - the request is read by the strict schema, one of two forms. A commune: its code, a radius,
 *   « à domicile », nothing else. Countries: one to five codes, a town next to a single foreign one,
 *   a radius, « à domicile ». A name, coordinates, postal codes, a département or a reserved field
 *   refuse it whole, and so does a request that mixes a code and countries;
 * - the commune stored is the one the official list gives for that code: its name, its centre and
 *   its postal codes come from the list, never from the request, so a name cannot sit next to the
 *   code of another and a postal code cannot be forged;
 * - the list is asked when the code changes, and also when the stored commune has no postal codes
 *   yet (that is how the profiles saved before them catch up). If the commune changes and the list
 *   does not answer, nothing is written and the old zone stays; if it does not know the code, the
 *   save is refused. If the commune does not change, the radius and « à domicile » are saved
 *   whatever the list does, and the postal codes wait for the next save;
 * - a zone of countries is written whole by the collection: the commune is emptied, and so is the
 *   review of the zone, as with a commune (ticket 259). The profile may become « publiable » by it;
 * - the profile written is hers, found by her account, written as herself (`overrideAccess:
 *   false`), the slug untouched;
 * - the values given back are those the database stored, read from the document Payload returns.
 */
export async function saveLocation(
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown,
	questionner: CityQuestion = cityFromCode
): Promise<SaveResult<LocationValues>> {
	const parsed = strictLocationSchema.safeParse(saisie)
	if (!parsed.success) {
		const fields = errorsByField(parsed.error)
		return Object.keys(fields).length > 0
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs: fields }
			: { ok: false, message: FAILURE_MESSAGE }
	}
	const request = parsed.data
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }

		let data: Record<string, unknown>
		if (request.kind === 'countries') {
			data = {
				zoneKind: 'countries',
				countries: request.countries,
				town: request.town,
				radiusKm: request.rayonKm,
				homeService: request.aDomicile,
			}
		} else {
			const { codeInsee, rayonKm: radiusKm, aDomicile: atHome } = request
			const current = await payload.findByID({
				collection: 'profiles',
				depth: 0,
				id,
				overrideAccess: false,
				select: { city: true },
				user: utilisateur,
			})
			const changed = current.city?.inseeCode !== codeInsee
			const missingPostalCodes = !changed && (current.city?.postalCodes ?? []).length === 0

			let city: StoredCity | undefined
			if (changed || missingPostalCodes) {
				const response = await questionner(codeInsee)
				if (changed && response.genre === 'panne') return { ok: false, message: CITIES_SERVICE_MESSAGE }
				if (changed && response.genre === 'inconnue') {
					return {
						ok: false,
						message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.',
						champs: {
							codeInsee: 'Cette commune n’est pas dans la liste officielle : choisis-la dans les suggestions.',
						},
					}
				}
				if (response.genre === 'commune') {
					const { nom: name, latitude, longitude, codesPostaux: postalCodes } = response.commune
					city = { name, inseeCode: codeInsee, latitude, longitude, postalCodes: [...postalCodes] }
				}
			}
			// The zone is a commune: the collection empties the countries and the town.
			data = { zoneKind: 'city', ...(city ? { city } : {}), radiusKm, homeService: atHome }
		}

		const stored = await payload.update({
			collection: 'profiles',
			data,
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return { ok: true, valeurs: locationValues(stored) }
	} catch (error) {
		return payloadFailure(error, FIELDS, pathField)
	}
}
