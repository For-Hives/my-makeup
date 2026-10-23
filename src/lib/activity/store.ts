import type { Payload, PayloadRequest } from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { ACTIVITY_CHECKS_COLLECTION } from '../../collections/ActivityChecks'
import type { ActivityOutcome } from './outcome'

/**
 * The reads and writes of the cache of the activity check (issue 1004), all by the server, all with the rules
 * lifted: the collection is closed to every request. Nothing here reads or returns a SIRET; it is the profile
 * that holds it.
 */

type Writer = Pick<Payload, 'find' | 'create' | 'update' | 'delete'>

const base = (req?: PayloadRequest) => ({ depth: 0, overrideAccess: true, ...(req && { req }) }) as const

/**
 * The SIRET of a profile was set, changed or emptied: its row starts again as `pending` (the registry was never
 * asked about this number), or goes when the SIRET is gone. The badge of the old number goes with the reset.
 */
export async function resetCheck(
	payload: Writer,
	profileId: number,
	hasSiret: boolean,
	req?: PayloadRequest
): Promise<void> {
	const { docs } = await payload.find({
		collection: ACTIVITY_CHECKS_COLLECTION,
		...base(req),
		limit: 1,
		pagination: false,
		select: {},
		where: { profile: { equals: profileId } },
	})
	const row = docs[0]
	if (!hasSiret) {
		if (row) await payload.delete({ collection: ACTIVITY_CHECKS_COLLECTION, ...base(req), id: row.id })
		return
	}
	const data = { outcome: 'pending', checkedAt: null, attemptedAt: null } as const
	if (row) await payload.update({ collection: ACTIVITY_CHECKS_COLLECTION, ...base(req), id: row.id, data })
	else
		await payload.create({
			collection: ACTIVITY_CHECKS_COLLECTION,
			...base(req),
			data: { profile: profileId, ...data },
		})
}

/** Deletes the row of a profile (its deletion, her account's). */
export async function deleteCheck(payload: Writer, profileId: number, req?: PayloadRequest): Promise<void> {
	await payload.delete({
		collection: ACTIVITY_CHECKS_COLLECTION,
		...base(req),
		where: { profile: { equals: profileId } },
	})
}

/** What the owner's space and the task read of one row. */
export interface CheckRow {
	id: number
	profile: number
	outcome: ActivityOutcome
	checkedAt: string | null
	attemptedAt: string | null
}

export function toRow(doc: {
	id: number
	profile?: number | { id: number } | null
	outcome: ActivityOutcome
	checkedAt?: string | null
	attemptedAt?: string | null
}): CheckRow | null {
	const profile = typeof doc.profile === 'object' && doc.profile !== null ? doc.profile.id : doc.profile
	if (typeof profile !== 'number') return null
	return {
		id: doc.id,
		profile,
		outcome: doc.outcome,
		checkedAt: doc.checkedAt ?? null,
		attemptedAt: doc.attemptedAt ?? null,
	}
}

/** The row of one profile, or `null`. */
export async function readCheck(payload: Pick<Payload, 'find'>, profileId: number): Promise<CheckRow | null> {
	const { docs } = await payload.find({
		collection: ACTIVITY_CHECKS_COLLECTION,
		...base(),
		limit: 1,
		pagination: false,
		where: { profile: { equals: profileId } },
	})
	const doc = docs[0]
	return doc ? toRow(doc) : null
}

/**
 * The profiles, among these identifiers, that hold the badge, each with the date of the last answer read: one
 * bounded read. Nothing else of the row leaves.
 */
export async function badgedProfiles(
	payload: Pick<Payload, 'find'>,
	ids: readonly number[]
): Promise<ReadonlyMap<number, string | null>> {
	if (ids.length === 0) return new Map()
	const { docs } = await payload.find({
		collection: ACTIVITY_CHECKS_COLLECTION,
		...base(),
		limit: ids.length,
		pagination: false,
		select: { profile: true, checkedAt: true },
		where: { and: [{ profile: { in: [...ids] } }, { outcome: { equals: 'active' } }] },
	})
	const held = new Map<number, string | null>()
	for (const { profile, checkedAt } of docs) {
		const id = typeof profile === 'object' && profile !== null ? profile.id : profile
		if (typeof id === 'number') held.set(id, checkedAt ?? null)
	}
	return held
}
