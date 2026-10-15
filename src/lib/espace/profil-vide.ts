import type { Payload, RequiredDataFromCollectionSlug } from 'payload'
import { identifiantDuProfil, type UtilisateurDeLEspace } from './mon-profil'

/**
 * The profile of this makeup artist, created by the server when she has none (ticket 140). An
 * account comes with its empty profile (`profilALaCreationDuCompte`), but some accounts of the old
 * site were imported without one: the onboarding makes it, so that she is never told to write to us.
 *
 * - Only her own account is read: `utilisateur` comes from the session, never from the request.
 * - It is idempotent. `profils.pro` is unique, so two renders at the same moment cannot make two
 *   profiles: the loser of the race finds the winner's profile and gives its identifier.
 * - The slug is made by the collection (`slugALaCreation`), from the name of her account.
 *
 * Gives back the identifier of her profile, or `null` when it could not be found nor created.
 */
export async function garantirLeProfil(payload: Payload, utilisateur: UtilisateurDeLEspace): Promise<number | null> {
	const existant = await identifiantDuProfil(payload, utilisateur)
	if (existant !== null) return existant
	try {
		const cree = await payload.create({
			collection: 'profils',
			data: { pro: Number(utilisateur.id) } as RequiredDataFromCollectionSlug<'profils'>,
			depth: 0,
			overrideAccess: true,
			select: {},
		})
		return cree.id
	} catch {
		// The other render won: its profile is the one.
		return identifiantDuProfil(payload, utilisateur)
	}
}
