import type { Payload } from 'payload'
import type { Profil } from '@/payload-types'
import {
	type DefinitionDeListe,
	erreursDeLaLigne,
	type ListeEnregistree,
	lignesDuProfil,
	MESSAGES_DE_LISTE,
	memeLigne,
	nettoyerLaLigne,
	schemaDeLaListe,
} from './liste'
import { identifiantDuProfil, type UtilisateurDeLEspace } from './mon-profil'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './resultat'

const estUneLigne = (valeur: unknown): valeur is Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

/**
 * Saves a list of the signed-in makeup artist (tickets 129 to 131), and tells the truth about it,
 * like the networks (src/lib/espace/enregistrer-reseaux.ts):
 *
 * - the request is read by the strict schema of the section: the rows, each with its texts and no
 *   other key. A key that is not a field refuses it whole;
 * - each row is trimmed and checked by the rule the form uses (src/lib/espace/liste.ts). The bounds
 *   are checked for every row. What a row requires is checked for a new row and a changed one only:
 *   an imported row with an empty field (SCHEMA.md §2) never blocks the save of another one;
 * - the profile written is hers, found by her account: the request holds no identifier of profile;
 * - the whole list is written, in the order sent. A row keeps the identifier the server gave it
 *   (rule L1, `identitesDesLignes`); a row sent without one is new. What the section does not edit
 *   (the options of an offer) is kept from the stored row;
 * - the write goes through the access rules and the hooks of the collection, as herself, so the server
 *   recomputes whether the profile is publishable (U04);
 * - the rows given back are those the database stored. A failure gives back a message in French and no
 *   row (E31).
 */
export async function enregistrerListe(
	payload: Payload,
	utilisateur: UtilisateurDeLEspace,
	saisie: unknown,
	definition: DefinitionDeListe,
	maintenant: Date = new Date()
): Promise<ResultatDEnregistrement<ListeEnregistree>> {
	const forme = schemaDeLaListe(definition).safeParse(saisie)
	if (!forme.success) return { ok: false, message: MESSAGE_ECHEC }
	try {
		const id = await identifiantDuProfil(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const profil = await payload.findByID({
			collection: 'profils',
			depth: 0,
			disableErrors: true,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		if (profil === null) return { ok: false, message: MESSAGE_ECHEC }
		const brutes: unknown = profil[definition.section]
		const stockees = new Map(
			(Array.isArray(brutes) ? brutes : [])
				.filter(estUneLigne)
				.flatMap(ligne => (typeof ligne.id === 'string' ? [[ligne.id, ligne] as const] : []))
		)

		const lignes: Record<string, unknown>[] = []
		for (const envoyee of forme.data.lignes) {
			const valeurs = nettoyerLaLigne(definition, envoyee.valeurs)
			const stockee = envoyee.id === undefined ? undefined : stockees.get(envoyee.id)
			const inchangee = stockee !== undefined && memeLigne(definition, definition.depuisLeStockage(stockee), valeurs)
			const erreurs = erreursDeLaLigne(definition, valeurs, { avecRequis: !inchangee, maintenant })
			const premiere = Object.values(erreurs)[0]
			if (premiere !== undefined)
				return {
					ok: false,
					message: MESSAGES_DE_LISTE.ligneInvalide(
						definition.nom(valeurs) || `${definition.singulier} n° ${lignes.length + 1}`,
						premiere
					),
				}
			lignes.push({
				...(stockee === undefined ? {} : { id: envoyee.id }),
				...definition.versLeStockage(valeurs),
				...(stockee === undefined ? {} : definition.garder?.(stockee)),
			})
		}

		const stocke = await payload.update({
			collection: 'profils',
			data: { [definition.section]: lignes } as Partial<Profil>,
			depth: 0,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		return { ok: true, valeurs: { lignes: lignesDuProfil(definition, stocke) } }
	} catch (erreur) {
		return echecDePayload(erreur, ['lignes'] as const, () => 'lignes')
	}
}
