import type { Payload } from 'payload'
import { COLLECTION_PROS } from '../acces'
import type { ProfilDeLEspace } from './cartes'
import { verifierQueLAdminNeTientPasLeProfil } from './verrou'

/** The makeup artist as Payload knows her: what the access rules of a request need. */
export type UtilisateurDeLEspace = NonNullable<Awaited<ReturnType<Payload['auth']>>['user']>

/** What the page reads of her profile: nothing the cards do not show. */
const CHAMPS_LUS = {
	prenom: true,
	nom: true,
	nomArtiste: true,
	specialite: true,
	description: true,
	commune: true,
	rayonKm: true,
	aDomicile: true,
	disponible: true,
	photoPrincipale: true,
	galerie: true,
	competences: true,
	formations: true,
	experiences: true,
	langues: true,
	prestations: true,
	reseaux: true,
	coordonnees: true,
	contactPublic: true,
	consentiLe: true,
} as const

/**
 * The identifier of her profile, found by her account. The field `pro` is closed to a query made
 * as herself (field access applies to the paths of a `where`), so this one lookup is made by the
 * server, and gives back an identifier and nothing else. `utilisateur` comes from the session
 * (`payload.auth`), never from the request.
 */
export async function identifiantDuProfil(payload: Payload, utilisateur: UtilisateurDeLEspace): Promise<number | null> {
	if (utilisateur.collection !== COLLECTION_PROS) return null
	const { docs } = await payload.find({
		collection: 'profils',
		depth: 0,
		limit: 1,
		overrideAccess: true,
		pagination: false,
		select: {},
		where: { pro: { equals: utilisateur.id } },
	})
	return docs[0]?.id ?? null
}

/**
 * The identifier of her profile for a write of her space: `identifiantDuProfil`, then a refusal
 * (`ProfilVerrouille`) while an admin has the profile open in the administration (ticket 224). Null
 * when she has no profile, as `identifiantDuProfil`.
 */
export async function identifiantDuProfilAEcrire(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace
): Promise<number | null> {
	const id = await identifiantDuProfil(payload, utilisateur)
	if (id !== null) await verifierQueLAdminNeTientPasLeProfil(payload, id)
	return id
}

/**
 * The profile of this makeup artist, and hers only: found by her account (`identifiantDuProfil`),
 * never by an identifier that comes from the request, then read with the access rules on
 * (`overrideAccess: false`) as herself. Nobody else's profile can come out of it (U54).
 */
export async function profilDeLaMaquilleuse(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace
): Promise<ProfilDeLEspace | null> {
	const id = await identifiantDuProfil(payload, utilisateur)
	if (id === null) return null
	// The rule of a field closed to the public (`coordonnees`, `contactPublic`, `consentiLe`) reads the
	// account in `pro` of the document it is given: a selection without it would strip those fields
	// from her own page. `pro` is read for the rule and dropped before the page gets the profile.
	const profil = await payload.findByID({
		collection: 'profils',
		depth: 0,
		disableErrors: true,
		id,
		overrideAccess: false,
		select: { ...CHAMPS_LUS, pro: true },
		user: utilisateur,
	})
	if (profil === null) return null
	const { pro: _compte, ...visible } = profil
	return visible
}
