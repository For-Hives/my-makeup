/**
 * The weekly statistics, read from the database (ticket 149). The only place that reads accounts
 * and profiles for the report: it reads with the access rules lifted (the route has checked the
 * service token), picks the fields one by one, and hands them to the aggregation
 * (src/lib/stats-hebdo.ts), which keeps counts and public slugs only.
 *
 * The contact fields are read to know whether a profile has a contact channel, and go no further.
 */

import type { Payload } from 'payload'
import { agregerStats, type Periode, type ProfilPourStats, type StatsHebdo } from '@/lib/stats-hebdo'

export async function lireLesStatsHebdo(
	payload: Payload,
	periode: Periode,
	maintenant: Date = new Date()
): Promise<StatsHebdo> {
	const [profils, comptes] = await Promise.all([
		payload.find({
			collection: 'profils',
			select: {
				slug: true,
				createdAt: true,
				updatedAt: true,
				statut: true,
				completude: true,
				actif: true,
				publiable: true,
				entierementVide: true,
				commune: true,
				reseaux: true,
				coordonnees: true,
				contactPublic: true,
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
	])
	return agregerStats({
		profils: profils.docs as ProfilPourStats[],
		datesDesComptes: comptes.docs.map(compte => compte.createdAt),
		periode,
		maintenant,
	})
}
