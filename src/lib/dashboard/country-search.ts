/**
 * The countries a text typed in her space proposes (ticket 266; PLAN-ZONES.md §3.4): the countries
 * of the embedded list (src/lib/countries.ts) whose name, or another name the list knows, starts
 * like the text, accents, case and hyphens aside. Done in the browser, on the embedded list: no
 * request leaves for it, and nothing she types about a country reaches the server.
 */

import { COUNTRIES, type Country, countryKey, FRANCE_CODE } from '../countries'

/** The shortest text that proposes countries. */
export const COUNTRY_SEARCH_MIN = 2

/** The most countries the list proposes at once. */
export const COUNTRY_SUGGESTIONS_MAX = 6

/**
 * The countries that start like the text, in the order of the list (alphabetical, in French).
 * `sans` holds the codes not to propose again (those already chosen). France is proposed only when
 * `avecFrance` says so: in the single field it is a commune that says France, while a list of
 * countries may name it next to a foreign one.
 */
export function matchingCountries(
	texte: string,
	{ sans = [], avecFrance = false }: { sans?: readonly string[]; avecFrance?: boolean } = {}
): Country[] {
	if (/\d/.test(texte)) return []
	const question = countryKey(texte)
	if (question.length < COUNTRY_SEARCH_MIN) return []
	return COUNTRIES.filter(
		country =>
			!sans.includes(country.code) &&
			(avecFrance || country.code !== FRANCE_CODE) &&
			[country.name, ...(country.aliases ?? [])].some(name => countryKey(name).startsWith(question))
	).slice(0, COUNTRY_SUGGESTIONS_MAX)
}
