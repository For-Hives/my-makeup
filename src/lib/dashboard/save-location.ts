import type { Payload } from 'payload'
import { type CityFromCode, cityFromCode } from './city-reference'
import { CITIES_SERVICE_MESSAGE, cityLabel, errorsByField, type LocationValues, strictLocationSchema } from './location'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, payloadFailure, type SaveResult } from './result'

/** The question to the list of communes: a parameter so that a test can change it, never a request's. */
export type CityQuestion = (codeInsee: string) => Promise<CityFromCode>

/** The fields of the form, and the name Payload gives their paths. */
const FIELDS = ['codeInsee', 'rayonKm', 'aDomicile'] as const
const pathField = (chemin: string): string =>
	chemin.startsWith('city')
		? 'codeInsee'
		: chemin === 'radiusKm'
			? 'rayonKm'
			: chemin === 'homeService'
				? 'aDomicile'
				: chemin

/**
 * Saves the location of the signed-in makeup artist (ticket 123), and tells the truth about it:
 *
 * - the request is read by the strict schema: a code of commune, a radius, « à domicile », nothing
 *   else. A name, coordinates, a département or a reserved field refuse it whole; a text that is
 *   not an INSEE code is not a commune (the same rule as the collection's, checked first);
 * - the commune stored is the one the official list gives for that code: its name and its centre
 *   come from the list, never from the request, so a name cannot sit next to the code of another;
 * - the list is asked only when the code changes. If it does not answer, nothing is written and the
 *   old commune stays; if it does not know the code, the save is refused. Her radius and « à
 *   domicile » can still be saved with the commune she already has, whatever the list does;
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
	const { codeInsee, rayonKm: radiusKm, aDomicile: atHome } = parsed.data
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const current = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			id,
			overrideAccess: false,
			select: { city: true },
			user: utilisateur,
		})

		let city: { name: string; inseeCode: string; latitude: number | null; longitude: number | null } | undefined
		if (current.city?.inseeCode !== codeInsee) {
			const response = await questionner(codeInsee)
			if (response.genre === 'panne') return { ok: false, message: CITIES_SERVICE_MESSAGE }
			if (response.genre === 'inconnue') {
				return {
					ok: false,
					message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.',
					champs: { codeInsee: 'Cette commune n’est pas dans la liste officielle : choisis-la dans les suggestions.' },
				}
			}
			const { nom: name, latitude, longitude } = response.commune
			city = { name: name, inseeCode: codeInsee, latitude, longitude }
		}

		const stored = await payload.update({
			collection: 'profiles',
			data: { ...(city ? { city } : {}), radiusKm: radiusKm, homeService: atHome },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return {
			ok: true,
			valeurs: {
				codeInsee: stored.city?.inseeCode ?? '',
				libelle: cityLabel({ nom: stored.city?.name, departement: stored.city?.department }),
				rayonKm: stored.radiusKm ?? null,
				aDomicile: stored.homeService === true,
			},
		}
	} catch (error) {
		return payloadFailure(error, FIELDS, pathField)
	}
}
