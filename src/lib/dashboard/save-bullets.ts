import type { Payload } from 'payload'
import {
	alreadyInList,
	type Bullet,
	type BulletsKind,
	type BulletsValues,
	LANGUAGES,
	listBullets,
	readBullets,
	SKILLS,
} from './bullets'
import { LOCKED_PROFILE_MESSAGE, LockedProfile } from './lock'
import { type DashboardUser, profileIdToWrite } from './my-profile'
import { FAILURE_MESSAGE, type SaveResult } from './result'

type StoredRow = { id?: string | null; name?: string | null; description?: string | null }

/**
 * Saves a list of chips of the signed-in makeup artist (languages: ticket 127, skills: ticket 128),
 * and tells the truth about it, like the identity (src/lib/dashboard/save-identity.ts):
 *
 * - the request is read by the strict schema (`puces`, each with an optional `id` and a `nom`):
 *   every name is trimmed and refused in French when empty or beyond 70 characters (E30);
 * - the profile written is hers, found by her account: the request holds no identifier (I02);
 * - a chip keeps its identifier when it is sent back with the one the server gave it (rule L1, the
 *   hook `rowIdentities` decides); a chip added is new and the server gives it its own. The
 *   order of the request is the order stored;
 * - a name that duplicates another chip is refused when the chip is new. A chip already stored twice
 *   (the import, the old site) is kept as it is: saving never fails because of what was there;
 * - the description of a skill, which the chips do not show, is carried over from the stored row;
 * - the write goes through the access rules and the hooks of the collection, as herself;
 * - the chips given back are those the database stored. A failure gives back a message in French
 *   and no value (E31).
 */
async function saveBullets(
	sorte: BulletsKind,
	payload: Payload,
	utilisateur: DashboardUser,
	saisie: unknown
): Promise<SaveResult<BulletsValues>> {
	const parsed = readBullets(sorte, saisie)
	if (!parsed.ok) return { ok: false, message: parsed.message }
	try {
		const id = await profileIdToWrite(payload, utilisateur)
		if (id === null) return { ok: false, message: FAILURE_MESSAGE }
		const current = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			disableErrors: true,
			id,
			overrideAccess: false,
			select: { [sorte.champ]: true },
			user: utilisateur,
		})
		if (current === null) return { ok: false, message: FAILURE_MESSAGE }
		const storedRows = (current[sorte.champ] ?? []) as StoredRow[]
		const knownById = new Map(
			storedRows.flatMap(ligne => (typeof ligne.id === 'string' ? [[ligne.id, ligne] as const] : []))
		)

		const rows: { id?: string; name: string; description?: string }[] = []
		for (const [rank, bullet] of parsed.puces.entries()) {
			const storedRow = bullet.id === undefined ? undefined : knownById.get(bullet.id)
			const others = parsed.puces.filter((_, autre) => autre !== rank)
			if (storedRow === undefined && alreadyInList(others, bullet.nom)) return { ok: false, message: sorte.doublon }
			rows.push({
				...(storedRow === undefined ? {} : { id: bullet.id }),
				name: bullet.nom,
				...(sorte.champ === 'skills' && storedRow?.description ? { description: storedRow.description } : {}),
			})
		}
		const stored = await payload.update({
			collection: 'profiles',
			data: { [sorte.champ]: rows },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const bullets: Bullet[] = listBullets((stored[sorte.champ] ?? []) as StoredRow[])
		return { ok: true, valeurs: { puces: bullets } }
	} catch (error) {
		// A profile an admin has open (ticket 224) says so; anything else is the generic failure.
		return { ok: false, message: error instanceof LockedProfile ? LOCKED_PROFILE_MESSAGE : FAILURE_MESSAGE }
	}
}

/** The languages of the signed-in makeup artist (ticket 127). */
export const saveLanguages = (payload: Payload, utilisateur: DashboardUser, saisie: unknown) =>
	saveBullets(LANGUAGES, payload, utilisateur, saisie)

/** The skills of the signed-in makeup artist (ticket 128). */
export const saveSkills = (payload: Payload, utilisateur: DashboardUser, saisie: unknown) =>
	saveBullets(SKILLS, payload, utilisateur, saisie)
