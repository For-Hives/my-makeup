import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload, type Payload } from 'payload'
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
 * The profile of this makeup artist, and hers only: it is found by her account, never by an
 * identifier that comes from the request, and read with the access rules on (`overrideAccess:
 * false`) as herself. Nobody else's profile can come out of it (U54).
 */
export async function profilDeLaMaquilleuse(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace
): Promise<(ProfilDeLEspace & { id: number }) | null> {
	if (utilisateur.collection !== COLLECTION_PROS) return null
	const { docs } = await payload.find({
		collection: 'profils',
		depth: 0,
		limit: 1,
		overrideAccess: false,
		pagination: false,
		select: CHAMPS_LUS,
		user: utilisateur,
		where: { pro: { equals: utilisateur.id } },
	})
	return docs[0] ?? null
}

/** The session of the request as a user of Payload, or nothing: for a page and an action of the space. */
export async function utilisatriceDeLaRequete(): Promise<{
	payload: Payload
	utilisateur: UtilisateurDeLEspace
} | null> {
	const payload = await getPayload({ config })
	const { user } = await payload.auth({ headers: await headers() })
	return user?.collection === COLLECTION_PROS ? { payload, utilisateur: user } : null
}
