/**
 * Where she goes, in one sentence (ticket 304): « Se déplace à domicile, jusqu’à 30 km d’Annecy ». It
 * replaces the card « Localisation & département », which repeated the zone of the header. `null` when she
 * does not travel: the header says where she works, and there is nothing to add.
 */

import { ofName } from '../french-elision'

export interface TravelInput {
	seDeplace: boolean
	/** Her commune or her place abroad: « Annecy », « Bruxelles (Belgique) ». */
	lieu: string | null
	/** « Annecy et 30 km autour », « France et Italie ». */
	zone: string | null
	radiusKm: number | null
	/** « à Annecy », « en France et en Italie ». */
	placePhrase: string | null
}

export function travelSentence({ seDeplace, lieu, zone, radiusKm, placePhrase }: TravelInput): string | null {
	if (!seDeplace) return null
	// The radius counts only when the zone says it: around a commune or a town, never around countries.
	if (radiusKm !== null && lieu !== null && zone?.includes(`${radiusKm} km autour`))
		return `Se déplace à domicile, jusqu’à ${radiusKm} km ${ofName(lieu)}`
	return placePhrase ? `Se déplace à domicile ${placePhrase}` : null
}
