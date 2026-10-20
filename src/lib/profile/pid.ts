import type { Pid } from '@/lib/analytics/events'

/**
 * The `pid` of a profile in the audience measure (plan 04 §3.3): the Strapi id for a profile of the
 * site online, so the series go on, `v3-<id>` for a new one. `null` when neither is known.
 */
export function pidDuProfil(profil: { id?: number | null; strapiId?: number | null }): Pid | null {
	if (typeof profil.strapiId === 'number' && Number.isSafeInteger(profil.strapiId) && profil.strapiId > 0)
		return profil.strapiId
	if (typeof profil.id === 'number' && Number.isSafeInteger(profil.id) && profil.id > 0) return `v3-${profil.id}`
	return null
}
