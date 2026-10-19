import type { Payload } from 'payload'

/**
 * The edit lock an admin holds on a profile (ticket 224, finding of ticket 044).
 *
 * The administration locks a document while somebody has it open, for 5 minutes after the last sign
 * of activity (Payload's default), and refuses another admin's save meanwhile. Payload does not check
 * versions, though: an admin whose form was opened before the makeup artist saved from her space sends
 * every field back and overwrites what she just wrote. The Local API skips the lock unless it is asked
 * not to (`overrideLock` is true by default), and she writes through the Local API. So the writes of
 * her space look first for a lock held by an admin on her profile (`verifierQueLAdminNeTientPasLeProfil`),
 * and she is told in French to try again in a few minutes; what she typed stays in her form.
 *
 * The check is ours and not Payload's `overrideLock: false`, which compares only the identifier of the
 * user: a makeup artist whose account has the same number as the admin who holds the lock would pass.
 */

export const MESSAGE_PROFIL_VERROUILLE =
	'Ton profil est en cours de modification par l’équipe, réessaie dans quelques minutes.'

/** How long a lock lasts when the collection does not say: Payload's default, in seconds. */
export const DUREE_DU_VERROU_PAR_DEFAUT_S = 300

/** The profile is open in the administration: the write of her space waits. */
export class ProfilVerrouille extends Error {
	constructor() {
		super(MESSAGE_PROFIL_VERROUILLE)
		this.name = 'ProfilVerrouille'
	}
}

/** The duration of a lock on the profiles, in seconds; null when the collection has no lock at all. */
function dureeDuVerrouS(payload: Payload): number | null {
	const reglage = payload.collections.profiles?.config.lockDocuments
	if (reglage === false) return null
	return typeof reglage === 'object' ? reglage.duration : DUREE_DU_VERROU_PAR_DEFAUT_S
}

/**
 * Throws `ProfilVerrouille` when an admin holds a live lock on this profile. A lock past its
 * duration is no lock (Payload's own rule), and neither is one held by an account that is not an
 * admin's. `maintenant` is the clock, for a test.
 */
export async function verifierQueLAdminNeTientPasLeProfil(
	payload: Payload,
	idDuProfil: number,
	maintenant: Date = new Date()
): Promise<void> {
	const duree = dureeDuVerrouS(payload)
	if (duree === null) return
	const { totalDocs } = await payload.count({
		collection: 'payload-locked-documents',
		overrideAccess: true,
		where: {
			and: [
				{ 'document.relationTo': { equals: 'profiles' } },
				{ 'document.value': { equals: idDuProfil } },
				{ 'user.relationTo': { equals: 'admins' } },
				{ updatedAt: { greater_than: new Date(maintenant.getTime() - duree * 1000).toISOString() } },
			],
		},
	})
	if (totalDocs > 0) throw new ProfilVerrouille()
}
