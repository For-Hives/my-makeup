/**
 * Where an artist works, as text (UI-06, plans/02 U14): never « null »,
 * « undefined », « nullkm » nor « & km », whatever Strapi holds (44 empty
 * cities, 47 profiles never saved, radius null or 0).
 */

const VIDES = new Set(['null', 'undefined', '-', '.', 'nan'])

/** Largest radius shown; above, the value is a typo */
export const RAYON_MAX_KM = 1000

/**
 * The city as typed, trimmed, or '' when nothing usable.
 * @param {unknown} city
 * @returns {string}
 */
export function villeAffichee(city) {
	if (typeof city !== 'string') return ''
	const v = city.trim().replace(/\s+/g, ' ')
	return VIDES.has(v.toLowerCase()) ? '' : v
}

/**
 * Radius in km, or null when 0, empty or absurd.
 * @param {unknown} radius
 * @returns {number|null}
 */
export function rayonKm(radius) {
	const n = typeof radius === 'string' && radius.trim() !== '' ? Number(radius) : radius
	if (typeof n !== 'number' || !Number.isFinite(n)) return null
	const km = Math.round(n)
	return km > 0 && km <= RAYON_MAX_KM ? km : null
}

/**
 * « Annecy », « Annecy et 30 km autour », or '' without a usable city (a
 * radius alone says nothing).
 * @param {{city?: unknown, radius?: unknown}} [zone]
 * @returns {string}
 */
export function formatZone({ city, radius } = {}) {
	const ville = villeAffichee(city)
	const km = rayonKm(radius)
	if (!ville) return ''
	return km ? `${ville} et ${km} km autour` : ville
}
