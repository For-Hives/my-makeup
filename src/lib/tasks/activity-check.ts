import { createLocalReq, type Payload, type Where } from 'payload'
import { ACTIVITY_CHECKS_COLLECTION } from '../../collections/ActivityChecks'
import { revalidateChange } from '../../collections/revalidate'
import { type ActivityOutcome, BADGE_OUTCOME } from '../activity/outcome'
import { type BusinessRegistry, createBusinessRegistry, type RegistryAnswer } from '../activity/registry'
import { toRow } from '../activity/store'
import { serverEnv } from '../env'
import { importInProgress } from '../import-context'
import { PUBLISHED_STATUS } from '../profile/status'
import { changeTargets } from '../revalidate'
import type { DailyTask } from './daily'

/**
 * The activity check of the SIRET (issue 1004): once a day, in small batches, the task asks the public business
 * registry about the profiles whose answer is missing or due, and keeps the answer, with its date, in the cache
 * (src/collections/ActivityChecks.ts). The badge « Activité vérifiée » is that answer being « active ».
 *
 * - The registry is never asked about a number that did not change, except to renew a badge: a row with an
 *   answer of « ceased » or « not found » is final until the SIRET changes (a change resets the row, in a hook of
 *   the profile). A badge is renewed once a day.
 * - Only a clear answer changes an outcome. A time-out, an error, a page we cannot read: the outcome stays, the
 *   attempt is dated, and the row is asked again six hours later at the earliest. Never a badge taken or given
 *   on an error.
 * - At most `cap` profiles a day, one request a second (the registry service), and the day stops on a 429 or
 *   after three failures in a row.
 * - It does nothing off the site (`activityCheck` of src/lib/env.ts), nor while an import runs. A test hands its own
 *   registry; the real one is built only here, in production.
 * - It writes the cache only, never the profile: the date of modification of a profile, which the directory sorts
 *   by, does not move.
 * - Pages: the change of a badge refreshes the page of the profile and the lists (6 hours at worst when Next
 *   refuses a refresh outside of a request; the pages expire after one hour, src/services/public/cached.ts).
 */

/** The profiles asked in one day, at the most. */
export const DAILY_CAP = 100
/** A badge is renewed when its answer is older than this: once a day. */
export const RENEW_AFTER_MS = 20 * 3_600_000
/** A row whose last try failed is tried again after this. */
export const RETRY_AFTER_MS = 6 * 3_600_000
/** Failures in a row after which the day stops: the service is down. */
const FAILURES_STOP = 3

export interface ActivityCheckDeps {
	enabled: () => boolean
	registry: () => BusinessRegistry
	cap: number
}

const DEFAULT_DEPS: ActivityCheckDeps = {
	enabled: () => serverEnv().activityCheck,
	registry: () => createBusinessRegistry(),
	cap: DAILY_CAP,
}

const OUTCOME_OF: Readonly<Partial<Record<RegistryAnswer['kind'], ActivityOutcome>>> = {
	active: 'active',
	ceased: 'ceased',
	'not-found': 'not-found',
}

type Id = number

/** The rows to ask today: never tried first, then the oldest failed tries, then the badges to renew. */
async function dueRows(
	payload: Payload,
	now: Date,
	cap: number
): Promise<{ id: Id; profile: Id; outcome: ActivityOutcome }[]> {
	const retryBefore = new Date(now.getTime() - RETRY_AFTER_MS).toISOString()
	const renewBefore = new Date(now.getTime() - RENEW_AFTER_MS).toISOString()
	const lookups: { and: Where[]; sort: string }[] = [
		{ and: [{ outcome: { equals: 'pending' } }, { attemptedAt: { exists: false } }], sort: 'createdAt' },
		{ and: [{ outcome: { equals: 'pending' } }, { attemptedAt: { less_than: retryBefore } }], sort: 'attemptedAt' },
		{
			and: [
				{ outcome: { equals: 'active' } },
				{ checkedAt: { less_than: renewBefore } },
				{ or: [{ attemptedAt: { exists: false } }, { attemptedAt: { less_than: retryBefore } }] },
			],
			sort: 'checkedAt',
		},
	]
	const rows: { id: Id; profile: Id; outcome: ActivityOutcome }[] = []
	for (const { and, sort } of lookups) {
		if (rows.length >= cap) break
		const { docs } = await payload.find({
			collection: ACTIVITY_CHECKS_COLLECTION,
			depth: 0,
			limit: cap - rows.length,
			overrideAccess: true,
			pagination: false,
			sort,
			where: { and },
		})
		for (const doc of docs) {
			const row = toRow(doc)
			if (row) rows.push({ id: row.id, profile: row.profile, outcome: row.outcome })
		}
	}
	return rows
}

/** The rows whose profile is gone (the database emptied the link): removed. */
async function dropOrphans(payload: Payload): Promise<number> {
	const { docs } = await payload.delete({
		collection: ACTIVITY_CHECKS_COLLECTION,
		depth: 0,
		overrideAccess: true,
		select: {},
		where: { profile: { exists: false } },
	})
	return docs.length
}

async function siretOf(payload: Payload, id: Id) {
	return payload.findByID({
		collection: 'profiles',
		depth: 0,
		disableErrors: true,
		id,
		overrideAccess: true,
		select: { siret: true, slug: true, status: true },
	})
}

/** Tells Next the page of this profile and the lists changed, when its badge came or went. */
async function refreshPages(payload: Payload, slug: string, published: boolean): Promise<void> {
	const req = await createLocalReq({}, payload)
	revalidateChange(req, changeTargets('profiles', { slug, visible: published }, { slug, visible: published }))
}

export function createActivityCheckTask(deps: ActivityCheckDeps = DEFAULT_DEPS): DailyTask {
	return {
		nom: 'controle-activite',
		executer: async (payload, now) => {
			if (!deps.enabled() || importInProgress()) return 0
			let done = await dropOrphans(payload)
			const rows = await dueRows(payload, now, deps.cap)
			if (rows.length === 0) return done
			const registry = deps.registry()
			let failures = 0
			for (const row of rows) {
				const profile = await siretOf(payload, row.profile)
				const siret = typeof profile?.siret === 'string' ? profile.siret : ''
				if (siret === '') {
					// A row for a profile that holds no SIRET (any more): nothing to ask, nothing to keep.
					await payload.delete({ collection: ACTIVITY_CHECKS_COLLECTION, depth: 0, id: row.id, overrideAccess: true })
					continue
				}
				const answer = await registry.lookup(siret)
				if (answer.kind === 'rate-limited') break
				failures = answer.kind === 'unavailable' ? failures + 1 : 0
				// The number may have changed while the registry answered: its answer is for the old one.
				if ((await siretOf(payload, row.profile))?.siret !== siret) continue
				const outcome = OUTCOME_OF[answer.kind]
				await payload.update({
					collection: ACTIVITY_CHECKS_COLLECTION,
					data: { attemptedAt: now.toISOString(), ...(outcome && { outcome, checkedAt: now.toISOString() }) },
					depth: 0,
					id: row.id,
					overrideAccess: true,
				})
				done += 1
				if (outcome !== undefined && (outcome === BADGE_OUTCOME) !== (row.outcome === BADGE_OUTCOME))
					await refreshPages(payload, profile?.slug ?? '', profile?.status === PUBLISHED_STATUS)
				if (failures >= FAILURES_STOP) break
			}
			return done
		},
	}
}

export const activityCheckTask: DailyTask = createActivityCheckTask()
