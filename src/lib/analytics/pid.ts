/**
 * The id a profile is counted under in the measure (`pid`, plan 04 §3.2): the id of the old site for
 * a profile that came from it, so the series go on, and `v3-<id>` for a profile created since.
 * Public and free of personal data: it is only a number.
 */

import { profilePid as pidOuNul } from '@/lib/profile/pid'
import type { Pid } from './events'

export type { Pid }

export function profilePid({ id, strapiId }: { id: number; strapiId?: number | null | undefined }): Pid {
	return pidOuNul({ id, strapiId }) ?? `v3-${id}`
}
