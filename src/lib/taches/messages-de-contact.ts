import type { Payload } from 'payload'
import { importEnCours } from '../contexte-import'
import type { TacheQuotidienne } from './quotidiennes'

/**
 * The purge of the contact messages (ticket 162): the privacy policy promises that a message of the
 * contact form is kept 12 months after its reception, then deleted. The row goes whole (name, email,
 * phone, message), never a part of it.
 *
 * - The age is counted from the reception (`createdAt`), 12 calendar months back from the clock of
 *   the run: a message of 12 months and a day goes, one of 11 months stays, one of exactly 12 months
 *   stays until the next day.
 * - Only the type `contact`: the next types of `contact-requests` have their own promise and their own ticket.
 * - It does nothing while an import runs in this process (`importEnCours`): the next day's run takes
 *   what is past its date, since the task is idempotent.
 * - It reports a number, never a row.
 */

export const CONSERVATION_CONTACT_MOIS = 12

/** The date before which a message is deleted: `maintenant` minus 12 calendar months, in UTC. */
export function seuilDePurgeDuContact(maintenant: Date): Date {
	const seuil = new Date(maintenant.getTime())
	const jour = seuil.getUTCDate()
	// Day 1 first, so that 31 March minus a month does not spill over into the month after.
	seuil.setUTCDate(1)
	seuil.setUTCMonth(seuil.getUTCMonth() - CONSERVATION_CONTACT_MOIS)
	const dernierJour = new Date(Date.UTC(seuil.getUTCFullYear(), seuil.getUTCMonth() + 1, 0)).getUTCDate()
	seuil.setUTCDate(Math.min(jour, dernierJour))
	return seuil
}

export const purgeDesMessagesDeContact: TacheQuotidienne = {
	nom: 'purge-messages-contact',
	executer: async (payload: Payload, maintenant) => {
		if (importEnCours()) return 0
		const { docs } = await payload.delete({
			collection: 'contact-requests',
			depth: 0,
			overrideAccess: true,
			select: { type: true },
			where: {
				and: [
					{ type: { equals: 'contact' } },
					{ createdAt: { less_than: seuilDePurgeDuContact(maintenant).toISOString() } },
				],
			},
		})
		return docs.length
	},
}
