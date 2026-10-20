import type { Payload } from 'payload'
import type { Profile } from '@/payload-types'
import {
	type DefinitionDeListe,
	erreursDeLaLigne,
	type LigneEnvoyee,
	type ListeEnregistree,
	lignesDuProfil,
	MESSAGES_DE_LISTE,
	memeLigne,
	nettoyerLaLigne,
	schemaDeLaListe,
} from './list'
import { identifiantDuProfilAEcrire, type UtilisateurDeLEspace } from './my-profile'
import { echecDePayload, MESSAGE_ECHEC, type ResultatDEnregistrement } from './result'

const estUneLigne = (valeur: unknown): valeur is Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

/** The stored rows of a list, by identifier. */
const parIdentifiant = (brutes: unknown): Map<string, Record<string, unknown>> =>
	new Map(
		(Array.isArray(brutes) ? brutes : [])
			.filter(estUneLigne)
			.flatMap(ligne => (typeof ligne.id === 'string' ? [[ligne.id, ligne] as const] : []))
	)

type Refus = { readonly message: string }

/**
 * The options of one row (ticket 132), checked and ready to store, or the refusal. Each option is
 * trimmed; its bounds are checked, what it requires only for a new or changed option; two options
 * that say the same are refused (rule L6). An option keeps its identifier only when it is one of
 * the stored options of this very row (rule L1).
 */
function optionsAEcrire(
	definition: DefinitionDeListe,
	nomDeLaLigne: string,
	envoyees: readonly LigneEnvoyee[],
	stockee: Record<string, unknown> | undefined,
	maintenant: Date
): Record<string, unknown>[] | Refus {
	const sous = definition.options
	if (sous === undefined) return []
	const connues = parIdentifiant(stockee?.options)
	const ecrites: Record<string, unknown>[] = []
	const vues: Record<string, string>[] = []
	for (const envoyee of envoyees) {
		const valeurs = nettoyerLaLigne(sous, envoyee.valeurs)
		const connue = envoyee.id === undefined ? undefined : connues.get(envoyee.id)
		const inchangee = connue !== undefined && memeLigne(sous, sous.depuisLeStockage(connue), valeurs)
		const premiere = Object.values(erreursDeLaLigne(sous, valeurs, { avecRequis: !inchangee, maintenant }))[0]
		const nom = sous.nom(valeurs) || `option n° ${ecrites.length + 1}`
		if (premiere !== undefined) return { message: MESSAGES_DE_LISTE.optionInvalide(nomDeLaLigne, nom, premiere) }
		if (vues.some(autre => memeLigne(sous, autre, valeurs)))
			return { message: MESSAGES_DE_LISTE.optionsEnDouble(nomDeLaLigne, nom) }
		vues.push(valeurs)
		ecrites.push({
			...(connue === undefined ? {} : { id: envoyee.id }),
			...sous.versLeStockage(valeurs),
		})
	}
	return ecrites
}

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
 *   (rule L1, `identitesDesLignes`); a row sent without one is new. The options of an offer (ticket
 *   132) are written as sent, in order, each with its own identifier; an offer sent with none of the
 *   key keeps the stored options;
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
		const id = await identifiantDuProfilAEcrire(payload, utilisateur)
		if (id === null) return { ok: false, message: MESSAGE_ECHEC }
		const profil = await payload.findByID({
			collection: 'profiles',
			depth: 0,
			disableErrors: true,
			id,
			overrideAccess: false,
			user: utilisateur,
		})
		if (profil === null) return { ok: false, message: MESSAGE_ECHEC }
		const stockees = parIdentifiant((profil as unknown as Record<string, unknown>)[definition.section])

		const lignes: Record<string, unknown>[] = []
		for (const envoyee of forme.data.lignes as readonly LigneEnvoyee[]) {
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
			// Options sent replace the stored ones; none sent keeps them.
			const options =
				envoyee.options === undefined
					? undefined
					: optionsAEcrire(definition, definition.nom(valeurs), envoyee.options, stockee, maintenant)
			if (options !== undefined && 'message' in options) return { ok: false, message: options.message }
			lignes.push({
				...(stockee === undefined ? {} : { id: envoyee.id }),
				...definition.versLeStockage(valeurs),
				...(options === undefined ? (stockee === undefined ? {} : definition.garder?.(stockee)) : { options }),
			})
		}

		const stocke = await payload.update({
			collection: 'profiles',
			data: { [definition.section]: lignes } as Partial<Profile>,
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
