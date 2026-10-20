/**
 * The location of a makeup artist, as she edits it in her space (ticket 123; plan 01 §3.3 P7.4;
 * plan 02 U14, U15, U16): her commune, chosen in the official list, her radius of 0 to 200 km, and
 * « à domicile ». One set of rules, read by the form in the browser and by the server.
 *
 * - The commune is only ever a code of the official list (INSEE). The request holds no name and no
 *   coordinates: the server takes them from the list (./referentiel-communes.ts). A text typed
 *   freely is never a commune, an address least of all.
 * - The radius is a whole number of kilometres, from `BORNES_DU_RAYON_KM.min` to `.max`, or empty.
 * - The bounds and the French messages are those of the collection (src/lib/profil/zone.ts): the
 *   same sentence under the field, whoever refuses.
 */

import { z } from 'zod'
import { BORNES_DU_RAYON_KM, departementDuCodeInsee, MESSAGES_DE_LA_ZONE } from '../profil/zone'

/** What the card and the panel call a commune: « Annecy (74) » (plan 02 U16). Never « Annecy () ». */
export function libelleDeLaCommune({ nom, departement }: { nom?: unknown; departement?: unknown }): string {
	const n = typeof nom === 'string' ? nom.trim() : ''
	const d = typeof departement === 'string' ? departement.trim() : ''
	if (n === '') return ''
	return d === '' ? n : `${n} (${d})`
}

/** A commune the list proposes: what the panel shows, and the code it sends back. */
export interface CommuneProposee {
	readonly codeInsee: string
	/** « Annecy (74) ». */
	readonly libelle: string
}

/** The shortest and the longest text the search accepts. */
export const RECHERCHE_MIN = 2
export const RECHERCHE_MAX = 60

/** What a search answers to the panel. */
export type ResultatDeRecherche =
	| {
			ok: true
			communes: CommuneProposee[]
			/** Why there is nothing to propose when the text itself is the reason. */
			motif?: 'adresse' | 'trop-court'
	  }
	| { ok: false; message: string }

/** The message when the list of communes does not answer. */
export const MESSAGE_SERVICE_DES_COMMUNES =
	'Le service qui donne la liste des communes ne répond pas pour le moment. Ta commune n’a pas été modifiée : réessaie dans un instant.'

export const MESSAGE_COMMUNE_A_CHOISIR = 'Choisis ta commune dans la liste qui s’affiche quand tu écris son nom.'

export const MESSAGE_ADRESSE_REFUSEE = 'Écris le nom de ta commune, pas ton adresse : elle ne s’enregistre jamais.'

/** The three values of the section as the form and the card read them. */
export type ValeursDeLaLocalisation = {
	/** The INSEE code of her commune, or '' when she has none yet. */
	codeInsee: string
	/** « Annecy (74) », or '' without a commune. */
	libelle: string
	/** Whole kilometres, or null when she has not said. */
	rayonKm: number | null
	aDomicile: boolean
}

const MESSAGE_DOMICILE = 'Dis si tu te déplaces à domicile, oui ou non.'

/**
 * What the server accepts: the code of a commune of the list, the radius and « à domicile », and
 * no other key (a name, coordinates, a département, a reserved field refuse the whole request).
 */
export const schemaDeLaLocalisationStrict = z.strictObject({
	codeInsee: z
		.string({ error: MESSAGE_COMMUNE_A_CHOISIR })
		.trim()
		.toUpperCase()
		.refine(code => departementDuCodeInsee(code) !== null, MESSAGE_COMMUNE_A_CHOISIR),
	rayonKm: z
		.number({ error: MESSAGES_DE_LA_ZONE.rayon })
		.int(MESSAGES_DE_LA_ZONE.rayon)
		.min(BORNES_DU_RAYON_KM.min, MESSAGES_DE_LA_ZONE.rayon)
		.max(BORNES_DU_RAYON_KM.max, MESSAGES_DE_LA_ZONE.rayon)
		.nullable(),
	aDomicile: z.boolean({ error: MESSAGE_DOMICILE }),
})
export type SaisieDeLaLocalisation = z.infer<typeof schemaDeLaLocalisationStrict>

/** The fields that can be refused, for the messages under them. */
export const CHAMPS_DE_LA_LOCALISATION = ['codeInsee', 'rayonKm', 'aDomicile'] as const
export type ChampDeLaLocalisation = (typeof CHAMPS_DE_LA_LOCALISATION)[number]

/** The message of each field that does not pass, the first one when a field has several. */
export function erreursParChamp(erreur: z.ZodError): Partial<Record<ChampDeLaLocalisation, string>> {
	const champs: Partial<Record<ChampDeLaLocalisation, string>> = {}
	for (const { path, message } of erreur.issues) {
		const champ = CHAMPS_DE_LA_LOCALISATION.find(nom => nom === path[0])
		if (champ !== undefined && champs[champ] === undefined) champs[champ] = message
	}
	return champs
}

/** What the form checks of the radius she typed: nothing, or whole kilometres within the bounds. */
export const schemaDuRayonSaisi = z
	.string({ error: MESSAGES_DE_LA_ZONE.rayon })
	.trim()
	.refine(
		texte => texte === '' || (/^\d{1,3}$/.test(texte) && Number(texte) <= BORNES_DU_RAYON_KM.max),
		MESSAGES_DE_LA_ZONE.rayon
	)

/** The radius typed as the server takes it: whole kilometres, or null when empty. */
export function rayonDuTexte(texte: string): number | null {
	const propre = texte.trim()
	return propre === '' ? null : Number(propre)
}
