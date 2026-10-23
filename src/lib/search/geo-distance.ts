/**
 * A point on the map and the distance between two of them (ticket 293; audit UX §1 defect 3). The
 * centres of the communes come from the official list (src/lib/dashboard/city-reference.ts), already
 * stored on every profile. Pure: no `next` import, no call.
 */

/** A point in degrees. */
export interface GeoPoint {
	readonly latitude: number
	readonly longitude: number
}

/** The mean radius of the Earth, in km (the sphere of the haversine formula). */
const EARTH_RADIUS_KM = 6371

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** True for a point with two finite coordinates inside the globe. */
export function validPoint(point: { latitude?: number | null; longitude?: number | null } | null | undefined): boolean {
	const latitude = point?.latitude
	const longitude = point?.longitude
	return (
		typeof latitude === 'number' &&
		typeof longitude === 'number' &&
		Number.isFinite(latitude) &&
		Number.isFinite(longitude) &&
		Math.abs(latitude) <= 90 &&
		Math.abs(longitude) <= 180
	)
}

/** The distance in km as the crow flies between two points (haversine formula). */
export function distanceKm(from: GeoPoint, to: GeoPoint): number {
	const deltaLatitude = toRadians(to.latitude - from.latitude)
	const deltaLongitude = toRadians(to.longitude - from.longitude)
	const a =
		Math.sin(deltaLatitude / 2) ** 2 +
		Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}
