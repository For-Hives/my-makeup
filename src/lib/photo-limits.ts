/**
 * What a makeup artist may store on the site (ticket 309): the heaviest photo one send takes, how many
 * photos and how many bytes one profile holds, and how a photo is converted (WebP, quality, longest
 * side). Every value is a setting of the environment with a default, never a constant of the code
 * (docs/photos-limites.md).
 *
 * Pure: no I/O. `photoLimits()` reads `process.env` at the moment it is called, so that the server, the
 * proxy and the scripts all see the same values; src/lib/env.ts checks them when the server starts.
 */

/** The variables of the settings, with the unit and the range each one accepts. */
export const PHOTO_LIMIT_SETTINGS = {
	PHOTO_UPLOAD_MAX_MB: { key: 'uploadMb', fallback: 12, min: 1, max: 50, unit: 'Mo' },
	PHOTO_PROFILE_MAX_COUNT: { key: 'profileCount', fallback: 45, min: 1, max: 500, unit: 'photos' },
	PHOTO_PROFILE_MAX_MB: { key: 'profileMb', fallback: 60, min: 1, max: 2000, unit: 'Mo' },
	PHOTO_WEBP_QUALITY: { key: 'webpQuality', fallback: 82, min: 40, max: 95, unit: '' },
	PHOTO_SIDE_MAX_PX: { key: 'sidePx', fallback: 2000, min: 800, max: 4000, unit: 'px' },
} as const

export type PhotoLimitVariable = keyof typeof PHOTO_LIMIT_SETTINGS

/** The variables as `process.env` gives them. */
export type PhotoLimitSource = Readonly<Partial<Record<string, string | undefined>>>

export interface PhotoLimits {
	/** The heaviest file one send takes, before conversion (bytes). */
	uploadBytes: number
	/** The most photos one profile holds. */
	profileCount: number
	/** The most bytes one profile holds, the photos as stored after conversion. */
	profileBytes: number
	/** WebP quality, 1 to 100. */
	webpQuality: number
	/** The longest side of a stored photo (pixels). */
	sidePx: number
}

const MIB = 1024 * 1024

/** A whole number in digits only, within the range; nothing else (« 10.5 », « 1e1 », « -1 »). */
export function settingValue(variable: PhotoLimitVariable, value: string | undefined): number | undefined {
	const text = (value ?? '').trim()
	if (!/^\d{1,6}$/.test(text)) return undefined
	const { min, max } = PHOTO_LIMIT_SETTINGS[variable]
	const number = Number(text)
	return number >= min && number <= max ? number : undefined
}

/** True when the variable is set (not blank) and holds something else than a whole number in its range. */
export const settingInvalid = (variable: PhotoLimitVariable, value: string | undefined): boolean =>
	(value ?? '').trim() !== '' && settingValue(variable, value) === undefined

/** What the variables say; a blank or invalid variable gives its default (the server refuses to start on an invalid one). */
export function photoLimitsFrom(source: PhotoLimitSource): PhotoLimits {
	const read = (variable: PhotoLimitVariable): number =>
		settingValue(variable, source[variable]) ?? PHOTO_LIMIT_SETTINGS[variable].fallback
	return {
		uploadBytes: read('PHOTO_UPLOAD_MAX_MB') * MIB,
		profileCount: read('PHOTO_PROFILE_MAX_COUNT'),
		profileBytes: read('PHOTO_PROFILE_MAX_MB') * MIB,
		webpQuality: read('PHOTO_WEBP_QUALITY'),
		sidePx: read('PHOTO_SIDE_MAX_PX'),
	}
}

/** The limits of this process. */
export const photoLimits = (): PhotoLimits => photoLimitsFrom(process.env)

/** What a multipart body weighs beyond the file: the boundaries, the `_payload` field and the headers of its parts. */
export const MULTIPART_OVERHEAD_MAX = MIB

/** Largest request body the site reads on a route that receives a file. */
export const uploadRequestSizeMax = (limits: PhotoLimits = photoLimits()): number =>
	limits.uploadBytes + MULTIPART_OVERHEAD_MAX

/** Megabytes as she reads them: one decimal at most, a comma, no trailing « ,0 ». */
export function megabytes(octets: number): string {
	const value = Math.round((octets / MIB) * 10) / 10
	return String(value).replace('.', ',')
}

/** What one profile holds now. */
export interface PhotoUsage {
	count: number
	bytes: number
}

/** What her space shows of it: plain numbers, safe to hand to the browser. */
export interface PhotoUsageView extends PhotoUsage {
	countMax: number
	bytesMax: number
}

export const usageView = (usage: PhotoUsage, limits: PhotoLimits = photoLimits()): PhotoUsageView => ({
	...usage,
	countMax: limits.profileCount,
	bytesMax: limits.profileBytes,
})

/** How many photos she may still send: the count left, never negative (a profile above the limit has none). */
export const photosLeft = (view: Pick<PhotoUsageView, 'count' | 'countMax'>): number =>
	Math.max(0, view.countMax - view.count)

/** « Tu peux encore ajouter 31 photos. » / « Tu as atteint la limite… », the sentence of her space. */
export function usageSentence(view: PhotoUsageView): string {
	const volume = `Tes photos prennent ${megabytes(view.bytes)} Mo sur ${megabytes(view.bytesMax)} Mo.`
	const left = photosLeft(view)
	if (left === 0 || view.bytes >= view.bytesMax)
		return `${volume} Tu as atteint la limite : retire une photo, puis enregistre, avant d’en ajouter une autre.`
	return `${volume} ${left === 1 ? 'Il te reste 1 photo.' : `Il te reste ${left} photos.`}`
}

/** Said when a photo is heavier than one send takes. No number: the settings can change it. */
export const TOO_HEAVY_MESSAGE = 'La photo est trop lourde : choisis-en une plus légère.'

/** Said when the photo, once converted, cannot be read as a picture. */
export const UNREADABLE_MESSAGE = 'Impossible de lire cette photo : choisis une autre photo JPEG, PNG ou WebP.'

export type QuotaVerdict = { ok: true } | { ok: false; message: string }

/**
 * Whether a photo may be added to a profile, or may replace the file of one it already holds
 * (`replacing`: the count does not grow, `addedBytes` is the new size minus the old one). A profile above a
 * limit keeps its photos but adds none until it is back under: the rule is on what it would hold afterwards,
 * so a replacement that makes it lighter always passes.
 */
export function quotaVerdict({
	usage,
	addedBytes,
	replacing,
	limits = photoLimits(),
}: {
	usage: PhotoUsage
	addedBytes: number
	replacing: boolean
	limits?: PhotoLimits
}): QuotaVerdict {
	if (!replacing && usage.count + 1 > limits.profileCount)
		return {
			ok: false,
			message: `Tu as atteint la limite de ${limits.profileCount} photo${limits.profileCount > 1 ? 's' : ''} : retire une photo, puis enregistre, avant d’en ajouter une autre.`,
		}
	if (addedBytes > 0 && usage.bytes + addedBytes > limits.profileBytes)
		return {
			ok: false,
			message: `Cette photo ne rentre pas dans ton espace (${megabytes(usage.bytes)} Mo utilisés sur ${megabytes(limits.profileBytes)} Mo) : retire une photo, puis enregistre, avant de réessayer.`,
		}
	return { ok: true }
}
