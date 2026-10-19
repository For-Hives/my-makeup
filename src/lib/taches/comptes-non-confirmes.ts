import type { Payload } from 'payload'
import type { TacheQuotidienne } from './quotidiennes'

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

export const DELAI_AVANT_PURGE_JOURS = 7
const PAR_PASSAGE = 500

const seuil = (maintenant: Date): Date => new Date(maintenant.getTime() - DELAI_AVANT_PURGE_JOURS * 24 * 60 * 60 * 1000)

async function purgerUnCompte(payload: Payload, id: number): Promise<boolean> {
	const profils = await payload.find({
		collection: 'profiles',
		depth: 0,
		limit: 10,
		overrideAccess: true,
		pagination: false,
		select: { fullyEmpty: true },
		where: { pro: { equals: id } },
	})
	if (profils.docs.some(profil => profil.fullyEmpty !== true)) return false
	for (const profil of profils.docs) {
		await payload.delete({ collection: 'profiles', depth: 0, id: profil.id, overrideAccess: true })
	}
	await payload.delete({ collection: 'pros', depth: 0, id, overrideAccess: true })
	return true
}

export const purgeDesComptesNonConfirmes: TacheQuotidienne = {
	nom: 'purge-comptes-non-confirmes',
	executer: async (payload, maintenant) => {
		const { docs } = await payload.find({
			collection: 'pros',
			depth: 0,
			limit: PAR_PASSAGE,
			overrideAccess: true,
			pagination: false,
			select: { createdAt: true },
			sort: 'createdAt',
			where: {
				and: [
					{ _verified: { not_equals: true } },
					{ createdAt: { less_than: seuil(maintenant).toISOString() } },
					{ strapiId: { exists: false } },
					{ legacyProvider: { exists: false } },
				],
			},
		})
		let supprimes = 0
		for (const { id } of docs) {
			try {
				if (await purgerUnCompte(payload, id)) supprimes++
			} catch {
				// One account that cannot go (its name is not logged: it may be a person's) leaves the rest alone.
				payload.logger.error({ msg: 'Un compte jamais confirmé n’a pas pu être purgé.' })
			}
		}
		return supprimes
	},
}
