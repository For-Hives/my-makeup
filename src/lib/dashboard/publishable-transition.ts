import type { Payload } from 'payload'
import { identifiantDuProfil, type UtilisateurDeLEspace } from './my-profile'
import type { ResultatDEnregistrement } from './result'

/** Whether the stored profile is « publiable » (the flag the server computes at every save), or nothing when unknown. */
async function publiableAujourdhui(payload: Payload, id: number): Promise<boolean | undefined> {
	try {
		const profil = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			id,
			overrideAccess: true,
			select: { publishable: true },
		})
		return profil.publishable === true
	} catch {
		return undefined
	}
}

/**
 * Runs a save of her space and says, in its answer, when that very save made her profile
 * « publiable » (ticket 147, event `profile_publiable`).
 *
 * The flag is set only on a successful save that takes the stored state from « not publiable » to
 * « publiable »: a save of a profile that already was, a save that fails, and a save that makes it
 * lose the state all give no flag, so the event is sent once and never for the way back. When the
 * state cannot be read, nothing is said.
 */
export async function avecPassagePublicable<Valeurs extends Record<string, unknown>>(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	enregistrer: () => Promise<ResultatDEnregistrement<Valeurs>>
): Promise<ResultatDEnregistrement<Valeurs>> {
	const id = await identifiantDuProfil(payload, utilisateur).catch(() => null)
	const avant = id === null ? undefined : await publiableAujourdhui(payload, id)
	const resultat = await enregistrer()
	if (!resultat.ok || id === null || avant !== false) return resultat
	return (await publiableAujourdhui(payload, id)) === true ? { ...resultat, devenuPublicable: true } : resultat
}
