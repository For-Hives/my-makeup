import type { Payload } from 'payload'
import { COLLECTION_PROS } from '../acces'
import type { ProfilDeLEspace } from './cartes'

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
	return payload.findByID({
		collection: 'profils',
		depth: 0,
		disableErrors: true,
		id,
		overrideAccess: false,
		select: CHAMPS_LUS,
		user: utilisateur,
	})
}
