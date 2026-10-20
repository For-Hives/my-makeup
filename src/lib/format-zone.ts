/**
 * Where an artist works, as text (plans/02 U14): never « null », « undefined », « nullkm » nor
 * « & km », whatever the old data holds (empty cities, profiles never saved, radius null or 0).
 *
 * Ported as is from src/lib/format-zone.js of the old site (branch main): the same inputs give
 * the same text. A zone of countries (ticket 260; PLAN-ZONES.md §3.4) is a second form of input:
 * « Bruxelles (Belgique) et 30 km autour », « Belgique », « France et Italie ». The label is a text
 * the old site's rule reads as a place (`publicPlace(label).texte` gives the label back), which is
 * also how a page reads it again.
 *
 * Relative import on purpose: the rule of the profile reads this file, and the Payload CLI loads it.
 */

import { type Country, countryByCode, flag, normalizedCountryCode } from './countries'

const EMPTY = new Set(['null', 'undefined', '-', '.', 'nan'])

/** Largest radius shown; above, the value is a typo */
export const RADIUS_MAX_KM = 1000

/** The city as typed, trimmed, or '' when nothing usable. */
export function displayedCity(city: unknown): string {
	if (typeof city !== 'string') return ''
	const v = city.trim().replace(/\s+/g, ' ')
	return EMPTY.has(v.toLowerCase()) ? '' : v
}

/** Radius in km, or null when 0, empty or absurd. */
export function radiusKm(radius: unknown): number | null {
	const n = typeof radius === 'string' && radius.trim() !== '' ? Number(radius) : radius
	if (typeof n !== 'number' || !Number.isFinite(n)) return null
	const km = Math.round(n)
	return km > 0 && km <= RADIUS_MAX_KM ? km : null
}

/** The zone of a profile as these functions read it: a commune name, or countries and a town. */
export interface ZoneInput {
	/** The name of the commune. */
	city?: unknown
	radius?: unknown
	/** `city` ignores the countries (they are empty on a stored commune); anything else reads them. */
	zoneKind?: unknown
	/** The ISO codes of the countries, in the order of the makeup artist. */
	countries?: unknown
	/** The town abroad, read only next to a single country. */
	town?: unknown
}

/** The countries of a zone: the known codes, in capitals, once each, in order. Nothing for a zone of communes. */
export function zoneCountries({ zoneKind, countries }: Pick<ZoneInput, 'zoneKind' | 'countries'>): Country[] {
	if (zoneKind === 'city' || !Array.isArray(countries)) return []
	const found = new Map<string, Country>()
	for (const code of countries) {
		const country = countryByCode(normalizedCountryCode(code))
		if (country) found.set(country.code, country)
	}
	return [...found.values()]
}

/** « A », « A et B », « A, B et C ». */
function joined(items: readonly string[]): string {
	if (items.length <= 1) return items.join('')
	return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

/** « Bruxelles (Belgique) » for a town and one country, the name of the country otherwise. */
function placeAbroad(countries: readonly Country[], town: unknown): string {
	const [only] = countries
	const townName = displayedCity(town)
	if (countries.length === 1 && only) return townName ? `${townName} (${only.name})` : only.name
	return joined(countries.map(({ name }) => name))
}

/**
 * The text of a zone, on a card or on the page of a profile: « Annecy et 30 km autour »,
 * « Bruxelles (Belgique) et 30 km autour », « Belgique », « France et Italie », or '' for an empty
 * zone. The radius is read around a commune or a town abroad, never around a country or several.
 */
export function formatZone({ city, radius, zoneKind, countries, town }: ZoneInput = {}): string {
	const abroad = zoneCountries({ zoneKind, countries })
	if (abroad.length === 0) {
		const cityName = displayedCity(city)
		const km = radiusKm(radius)
		if (!cityName) return ''
		return km ? `${cityName} et ${km} km autour` : cityName
	}
	const place = placeAbroad(abroad, town)
	const km = radiusKm(radius)
	return abroad.length === 1 && displayedCity(town) && km ? `${place} et ${km} km autour` : place
}

/**
 * The zone inside a sentence, for a title or a description: « à Annecy », « à Bruxelles
 * (Belgique) », « en Belgique », « aux Pays-Bas », « en France et en Italie »; '' for an empty zone.
 */
export function zoneSentence({ city, zoneKind, countries, town }: ZoneInput = {}): string {
	const abroad = zoneCountries({ zoneKind, countries })
	if (abroad.length === 0) {
		const cityName = displayedCity(city)
		return cityName ? `à ${cityName}` : ''
	}
	const [only] = abroad
	if (abroad.length === 1 && only)
		return displayedCity(town) ? `à ${placeAbroad(abroad, town)}` : `${only.preposition} ${only.name}`
	return joined(abroad.map(({ preposition, name }) => `${preposition} ${name}`))
}

/** The flags of a zone of countries, in order, for the decorative display; empty for a commune. */
export function zoneFlags(zone: Pick<ZoneInput, 'zoneKind' | 'countries'>): string[] {
	return zoneCountries(zone).map(({ code }) => flag(code))
}
