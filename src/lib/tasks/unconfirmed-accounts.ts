import type { Payload } from 'payload'
import type { DailyTask } from './daily'

/**
 * The purge of the accounts that never confirmed their email (ticket 084): the fake sign-ups of
 * 12/2025 to 09/2026 lived for months as empty profiles in the directory. An account that has not
 * followed the link of its mail within 7 days goes, with its empty profile.
 *
 * What it never touches:
 * - an account imported from the old site (`strapiId` or `legacyProvider` set), whatever its state;
 * - an account whose profile holds anything (an admin filled it in): it is left for a person to decide;
 * - an account confirmed, even if it never came back.
 *
 * The profile goes first, then the account (`compteSansProfilAvantSuppression`). One account at a
 * time, so that a failure leaves the others alone. A run removes 500 accounts at most; the next
 * day takes the rest. It reports a number, never a row.
 */

export const PURGE_DELAY_DAYS = 7
const PER_PASS = 500

const threshold = (maintenant: Date): Date => new Date(maintenant.getTime() - PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000)

async function purgeAccount(payload: Payload, id: number): Promise<boolean> {
	const profiles = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 10,
		overrideAccess: true,
		pagination: false,
		select: { fullyEmpty: true },
		where: { pro: { equals: id } },
	})
	if (profiles.docs.some(profil => profil.fullyEmpty !== true)) return false
	for (const profile of profiles.docs) {
		await payload.delete({ collection: 'profiles', depth: 0, id: profile.id, overrideAccess: true })
	}
	await payload.delete({ collection: 'pros', depth: 0, id, overrideAccess: true })
	return true
}

export const purgeUnconfirmedAccounts: DailyTask = {
	nom: 'purge-comptes-non-confirmes',
	executer: async (payload, maintenant) => {
		const { docs } = await payload.find({
			collection: 'pros',
			depth: 0,
			limit: PER_PASS,
			overrideAccess: true,
			pagination: false,
			select: { createdAt: true },
			sort: 'createdAt',
			where: {
				and: [
					{ _verified: { not_equals: true } },
					{ createdAt: { less_than: threshold(maintenant).toISOString() } },
					{ strapiId: { exists: false } },
					{ legacyProvider: { exists: false } },
				],
			},
		})
		let deleted = 0
		for (const { id } of docs) {
			try {
				if (await purgeAccount(payload, id)) deleted++
			} catch {
				// One account that cannot go (its name is not logged: it may be a person's) leaves the rest alone.
				payload.logger.error({ msg: 'Un compte jamais confirmé n’a pas pu être purgé.' })
			}
		}
		return deleted
	},
}
