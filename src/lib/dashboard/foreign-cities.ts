/**
 * The big foreign cities a makeup artist may type in the field of the commune (ticket 297): when the
 * list of communes of France has nothing for them, the field proposes the country directly. Done in
 * the browser on this short list, with no request. It is a hint, never a choice: the country is
 * only pre-selected in the list of countries, and she confirms or changes it.
 */

import { countryKey } from '../countries'

/** City (French name, and the usual local spelling) to the ISO code of its country. */
const CITIES: Readonly<Record<string, string>> = {
	Genève: 'CH',
	Lausanne: 'CH',
	Zurich: 'CH',
	Bâle: 'CH',
	Berne: 'CH',
	Fribourg: 'CH',
	Neuchâtel: 'CH',
	Lugano: 'CH',
	Bruxelles: 'BE',
	Brussels: 'BE',
	Liège: 'BE',
	Anvers: 'BE',
	Gand: 'BE',
	Charleroi: 'BE',
	Namur: 'BE',
	Mons: 'BE',
	Louvain: 'BE',
	Turin: 'IT',
	Torino: 'IT',
	Milan: 'IT',
	Milano: 'IT',
	Rome: 'IT',
	Naples: 'IT',
	Florence: 'IT',
	Venise: 'IT',
	Bologne: 'IT',
	Madrid: 'ES',
	Barcelone: 'ES',
	Valence: 'ES',
	Séville: 'ES',
	Lisbonne: 'PT',
	Porto: 'PT',
	Londres: 'GB',
	London: 'GB',
	Manchester: 'GB',
	Édimbourg: 'GB',
	Berlin: 'DE',
	Munich: 'DE',
	Francfort: 'DE',
	Hambourg: 'DE',
	Cologne: 'DE',
	Amsterdam: 'NL',
	Rotterdam: 'NL',
	Vienne: 'AT',
	Dublin: 'IE',
	Athènes: 'GR',
	Varsovie: 'PL',
	Bucarest: 'RO',
	Istanbul: 'TR',
	Montréal: 'CA',
	Québec: 'CA',
	Toronto: 'CA',
	'New York': 'US',
	'Los Angeles': 'US',
	Miami: 'US',
	Casablanca: 'MA',
	Marrakech: 'MA',
	Rabat: 'MA',
	Tanger: 'MA',
	Tunis: 'TN',
	Alger: 'DZ',
	Oran: 'DZ',
	Dakar: 'SN',
	Abidjan: 'CI',
	Douala: 'CM',
	Kinshasa: 'CD',
	Antananarivo: 'MG',
	'Port-au-Prince': 'HT',
	Beyrouth: 'LB',
	'Le Caire': 'EG',
	Tokyo: 'JP',
}

const BY_KEY: ReadonlyMap<string, string> = new Map(
	Object.entries(CITIES).map(([name, code]) => [countryKey(name), code])
)

/** The code of the country of a big foreign city typed as it is, or `undefined` when it is not one we know. */
export function foreignCountryOf(text: string): string | undefined {
	return BY_KEY.get(countryKey(text))
}
