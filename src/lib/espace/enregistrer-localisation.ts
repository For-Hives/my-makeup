import type { Payload } from 'payload'
import {
	erreursParChamp,
	libelleDeLaCommune,
	MESSAGE_SERVICE_DES_COMMUNES,
	schemaDeLaLocalisationStrict,
	type ValeursDeLaLocalisation,
} from './localisation'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import { type CommuneDuCode, communeDuCode } from './referentiel-communes'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

/** The question to the list of communes: a parameter so that a test can change it, never a request's. */
export type QuestionDeCommune = (codeInsee: string) => Promise<CommuneDuCode>

/** The fields of the form, and the name Payload gives their paths. */
const CHAMPS = ['codeInsee', 'rayonKm', 'aDomicile'] as const
const champDuChemin = (chemin: string): string =>
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
export async function enregistrerLocalisation(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown,
	questionner: QuestionDeCommune = communeDuCode
): Promise<ResultatDEnregistrement<ValeursDeLaLocalisation>> {
	const lue = schemaDeLaLocalisationStrict.safeParse(saisie)
	if (!lue.success) {
		const champs = erreursParChamp(lue.error)
		return Object.keys(champs).length > 0
			? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs }
			: { ok: false, message: MESSAGE_ECHEC }
	}
	const { codeInsee, rayonKm, aDomicile } = lue.data
	try {
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const actuel = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			id,
			overrideAccess: false,
			select: { city: true },
			user: utilisateur,
		})

		let city: { name: string; inseeCode: string; latitude: number | null; longitude: number | null } | undefined
		if (actuel.city?.inseeCode !== codeInsee) {
			const reponse = await questionner(codeInsee)
			if (reponse.genre === 'panne') return { ok: false, message: MESSAGE_SERVICE_DES_COMMUNES }
			if (reponse.genre === 'inconnue') {
				return {
					ok: false,
					message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.',
					champs: { codeInsee: 'Cette commune n’est pas dans la liste officielle : choisis-la dans les suggestions.' },
				}
			}
			const { nom, latitude, longitude } = reponse.commune
			city = { name: nom, inseeCode: codeInsee, latitude, longitude }
		}

		const stocke = await payload.update({
			collection: 'profiles',
			data: { ...(city ? { city } : {}), radiusKm: rayonKm, homeService: aDomicile },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return {
			ok: true,
			valeurs: {
				codeInsee: stocke.city?.inseeCode ?? '',
				libelle: libelleDeLaCommune({ nom: stocke.city?.name, departement: stocke.city?.department }),
				rayonKm: stocke.radiusKm ?? null,
				aDomicile: stocke.homeService === true,
			},
		}
	} catch (erreur) {
		return echecDePayload(erreur, CHAMPS, champDuChemin)
	}
}
