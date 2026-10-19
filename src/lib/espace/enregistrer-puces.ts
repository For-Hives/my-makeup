import type { Payload } from 'payload'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './mon-profil'
import {
	COMPETENCES,
	dejaDansLaListe,
	LANGUES,
	lireLesPuces,
	type Puce,
	pucesDeLaListe,
	type SorteDePuces,
	type ValeursDesPuces,
} from './puces'
import { MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'
import { MESSAGE_PROFIL_VERROUILLE, ProfilVerrouille } from './verrou'

type LigneStockee = { id?: string | null; name?: string | null; description?: string | null }

/**
 * Saves a list of chips of the signed-in makeup artist (languages: ticket 127, skills: ticket 128),
 * and tells the truth about it, like the identity (src/lib/espace/enregistrer-identite.ts):
 *
 * - the request is read by the strict schema (`puces`, each with an optional `id` and a `nom`):
 *   every name is trimmed and refused in French when empty or beyond 70 characters (E30);
 * - the profile written is hers, found by her account: the request holds no identifier (I02);
 * - a chip keeps its identifier when it is sent back with the one the server gave it (rule L1, the
 *   hook `identitesDesLignes` decides); a chip added is new and the server gives it its own. The
 *   order of the request is the order stored;
 * - a name that duplicates another chip is refused when the chip is new. A chip already stored twice
 *   (the import, the old site) is kept as it is: saving never fails because of what was there;
 * - the description of a skill, which the chips do not show, is carried over from the stored row;
 * - the write goes through the access rules and the hooks of the collection, as herself;
 * - the chips given back are those the database stored. A failure gives back a message in French
 *   and no value (E31).
 */
async function enregistrerLesPuces(
	sorte: SorteDePuces,
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown
): Promise<ResultatDEnregistrement<ValeursDesPuces>> {
	const lue = lireLesPuces(sorte, saisie)
	if (!lue.ok) return { ok: false, message: lue.message }
	try {
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const actuel = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			disableErrors: true,
			id,
			overrideAccess: false,
			select: { [sorte.champ]: true },
			user: utilisateur,
		})
		if (actuel === null) return { ok: false, message: MESSAGE_ECHEC }
		const stockees = (actuel[sorte.champ] ?? []) as LigneStockee[]
		const connues = new Map(
			stockees.flatMap(ligne => (typeof ligne.id === 'string' ? [[ligne.id, ligne] as const] : []))
		)

		const lignes: { id?: string; name: string; description?: string }[] = []
		for (const [rang, puce] of lue.puces.entries()) {
			const stockee = puce.id === undefined ? undefined : connues.get(puce.id)
			const autres = lue.puces.filter((_, autre) => autre !== rang)
			if (stockee === undefined && dejaDansLaListe(autres, puce.nom)) return { ok: false, message: sorte.doublon }
			lignes.push({
				...(stockee === undefined ? {} : { id: puce.id }),
				name: puce.nom,
				...(sorte.champ === 'skills' && stockee?.description ? { description: stockee.description } : {}),
			})
		}
		const stocke = await payload.update({
			collection: 'profiles',
			data: { [sorte.champ]: lignes },
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		const puces: Puce[] = pucesDeLaListe((stocke[sorte.champ] ?? []) as LigneStockee[])
		return { ok: true, valeurs: { puces } }
	} catch (erreur) {
		// A profile an admin has open (ticket 224) says so; anything else is the generic failure.
		return { ok: false, message: erreur instanceof ProfilVerrouille ? MESSAGE_PROFIL_VERROUILLE : MESSAGE_ECHEC }
	}
}

/** The languages of the signed-in makeup artist (ticket 127). */
export const enregistrerLangues = (payload: Payload, utilisateur: UtilisateurDeLEspace, saisie: unknown) =>
	enregistrerLesPuces(LANGUES, payload, utilisateur, saisie)

/** The skills of the signed-in makeup artist (ticket 128). */
export const enregistrerCompetences = (payload: Payload, utilisateur: UtilisateurDeLEspace, saisie: unknown) =>
	enregistrerLesPuces(COMPETENCES, payload, utilisateur, saisie)
