/**
 * The weekly statistics, read from the database (ticket 149). The only place that reads accounts
 * and profiles for the report: it reads with the access rules lifted (the route has checked the
 * service token), picks the fields one by one, and hands them to the aggregation
 * (src/lib/stats-hebdo.ts), which keeps counts and public slugs only.
 *
 * The contact fields are read to know whether a profile has a contact channel, and go no further.
 *
 * Ticket 169 adds three readings, each of closed lists and numbers: the contact messages of the
 * period (their status and mail state only, never what the visitor typed), the authentication
 * journal (a kind, an outcome, a duration), and the count of inherited hashes, asked of the database
 * (`count` with the rules lifted) so that no hash is ever read, only counted.
 */

import type { Payload } from 'payload'
import {
	agregerAuth,
	agregerContact,
	agregerStats,
	FOURNISSEURS_HERITES,
	type Periode,
	type ProfilPourStats,
	type StatsHebdo,
} from '@/lib/stats-hebdo'

export async function lireLesStatsHebdo(
	payload: Payload,
	periode: Periode,
	maintenant: Date = new Date()
): Promise<StatsHebdo> {
	const dansLaPeriode = { greater_than_equal: periode.debut.toISOString(), less_than: periode.fin.toISOString() }
	const [profils, comptes, demandes, evenements, hashRestants, sansHash] = await Promise.all([
		payload.find({
			collection: 'profiles',
			select: {
				slug: true,
				createdAt: true,
				updatedAt: true,
				status: true,
				completeness: true,
				active: true,
				publishable: true,
				fullyEmpty: true,
				city: true,
				networks: true,
				contactDetails: true,
				publicContact: true,
			},
			depth: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.find({
			collection: 'pros',
			select: { createdAt: true },
			depth: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.find({
			collection: 'contact-requests',
			where: { createdAt: dansLaPeriode },
			select: { status: true, mailStatus: true },
			depth: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.find({
			collection: 'auth-events',
			where: { date: dansLaPeriode },
			select: { type: true, code: true, durationMs: true },
			depth: 0,
			pagination: false,
			overrideAccess: true,
		}),
		payload.count({
			collection: 'pros',
			where: { legacyBcrypt: { exists: true } },
			overrideAccess: true,
		}),
		Promise.all(
			FOURNISSEURS_HERITES.map(async fournisseur => {
				const sansHash = { legacyBcrypt: { exists: false } }
				const where =
					fournisseur === 'other'
						? {
								and: [
									sansHash,
									{ legacyProvider: { exists: true } },
									{ legacyProvider: { not_in: ['local', 'google', 'facebook'] } },
								],
							}
						: { and: [sansHash, { legacyProvider: { equals: fournisseur } }] }
				return [
					fournisseur,
					(await payload.count({ collection: 'pros', where, overrideAccess: true })).totalDocs,
				] as const
			})
		),
	])
	const stats = agregerStats({
		profils: profils.docs as ProfilPourStats[],
		datesDesComptes: comptes.docs.map(compte => compte.createdAt),
		periode,
		maintenant,
	})
	return {
		...stats,
		contact: agregerContact(demandes.docs),
		auth: agregerAuth(evenements.docs),
		inherited: { remainingHashes: hashRestants.totalDocs, withoutPasswordByProvider: Object.fromEntries(sansHash) },
	}
}
