/**
 * Where an artist works, as text (plans/02 U14): never « null », « undefined », « nullkm » nor
 * « & km », whatever the old data holds (empty cities, profiles never saved, radius null or 0).
 *
 * Ported as is from src/lib/format-zone.js of the old site (branch main): the same inputs give
 * the same text.
 */

const VIDES = new Set(['null', 'undefined', '-', '.', 'nan'])

/** Largest radius shown; above, the value is a typo */
export const RAYON_MAX_KM = 1000

/** The city as typed, trimmed, or '' when nothing usable. */
export function villeAffichee(city: unknown): string {
	if (typeof city !== 'string') return ''
	const v = city.trim().replace(/\s+/g, ' ')
	return VIDES.has(v.toLowerCase()) ? '' : v
}

/** Radius in km, or null when 0, empty or absurd. */
export function rayonKm(radius: unknown): number | null {
	const n = typeof radius === 'string' && radius.trim() !== '' ? Number(radius) : radius
	if (typeof n !== 'number' || !Number.isFinite(n)) return null
	const km = Math.round(n)
	return km > 0 && km <= RAYON_MAX_KM ? km : null
}

/**
 * « Annecy », « Annecy et 30 km autour », or '' without a usable city (a radius alone says
 * nothing).
 */
export function formatZone({ city, radius }: { city?: unknown; radius?: unknown } = {}): string {
	const ville = villeAffichee(city)
	const km = rayonKm(radius)
	if (!ville) return ''
	return km ? `${ville} et ${km} km autour` : ville
}
