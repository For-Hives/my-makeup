/**
 * The rows of a list she edits one by one in her space (tickets 129 to 131; docs/qualite.md §3,
 * rules L1 to L7): experiences, courses and offers. One module, read by the panel in the browser
 * and by the server action, so the two never disagree.
 *
 * A section is described once, by a `DefinitionDeListe` (src/lib/espace/experiences.ts, formations.ts,
 * prestations.ts): its fields, what it requires, its bounds, how a stored row is read and written.
 * This file holds what the three share.
 *
 * - A row travels as `{ id?, valeurs }`. `valeurs` holds texts only (a date is « YYYY-MM-DD », a price
 *   the text she typed); the server computes everything else. A key that is not a field of the section
 *   refuses the whole request (a row cannot carry an amount of price, for example).
 * - `id` is the identifier the server gave to the row (rule L1). A row she just added has none.
 * - Bounds (length, dates, amount) are checked for every row. What a row requires is checked for the
 *   row she adds or edits, and on the server for a new or changed row only: an imported row with an
 *   empty field (SCHEMA.md §2, rule 2) never blocks the save of another one.
 * - Every message is in French.
 */

import { z } from 'zod'
import { jourCalendaire } from '../profil/listes'

export type GenreDeChamp = 'texte' | 'date' | 'long'

export interface ChampDeLigne {
	readonly nom: string
	readonly libelle: string
	readonly genre: GenreDeChamp
	/** The sentence under the field. */
	readonly aide?: string
	readonly exemple?: string
}

/** The texts of one row, by field. */
export type ValeursDeLigne = Readonly<Record<string, string>>

/**
 * A row as the server stored it: its identifier and its texts. A section that holds a list in each row
 * (the options of an offer, ticket 132) also gives that list, in order.
 */
export interface LigneEnregistree {
	readonly id: string
	readonly valeurs: ValeursDeLigne
	readonly options?: readonly LigneEnregistree[]
}

/**
 * A row as the browser sends it: no identifier for a row just added. `options` is sent for a section
 * that has some, and replaces the stored ones; left out, the stored ones are kept.
 */
export interface LigneEnvoyee {
	readonly id?: string
	readonly valeurs: ValeursDeLigne
	readonly options?: readonly LigneEnvoyee[]
}

/** What a save sends, and what it gives back. */
export interface ListeEnvoyee extends Record<string, unknown> {
	readonly lignes: readonly LigneEnvoyee[]
}
export interface ListeEnregistree extends Record<string, unknown> {
	readonly lignes: readonly LigneEnregistree[]
}

export type ErreursDeLigne = Readonly<Record<string, string>>

export interface DefinitionDeListe {
	/** The field of the profile, and the prefix of the identifiers of the panel. */
	readonly section: 'experiences' | 'courses' | 'serviceOffers' | 'options'
	/** « expérience », « expériences », « l’expérience »: the words of the sentences. */
	readonly singulier: string
	readonly pluriel: string
	readonly designation: string
	/** The fields of the form, in display order. */
	readonly champs: readonly ChampDeLigne[]
	/** What the row requires: the message of each field that may not be empty. */
	readonly requis: Readonly<Record<string, string>>
	/** The sentence when the row she adds is already in the list (rule L6). */
	readonly doublon: string
	/** The bounds of the values of a row; the keys are fields. `maintenant` is the day it is checked. */
	readonly bornes: (valeurs: ValeursDeLigne, maintenant: Date) => ErreursDeLigne
	/** One line of the list: what the row says. */
	readonly resume: (valeurs: ValeursDeLigne) => string
	/** What names the row in a sentence (« Expérience Studio Fictif retirée »). */
	readonly nom: (valeurs: ValeursDeLigne) => string
	/** The sentence said to a screen reader when a row leaves the list (rule L5). */
	readonly retrait: (nom: string) => string
	/** The texts of the form for a row as the database stores it. */
	readonly depuisLeStockage: (stockee: Readonly<Record<string, unknown>>) => ValeursDeLigne
	/** The row as the database stores it, for the texts of the form (already trimmed). */
	readonly versLeStockage: (valeurs: ValeursDeLigne) => Record<string, unknown>
	/** The list held by each row, edited in the same panel (the options of an offer, ticket 132). */
	readonly options?: DefinitionDeListe
	/** What the section does not edit and must keep from the stored row (the options of an offer, when a request sends none). */
	readonly garder?: (stockee: Readonly<Record<string, unknown>>) => Record<string, unknown>
	/** A sentence that follows what she types, under the form. */
	readonly indice?: (valeurs: ValeursDeLigne) => string
}

/** The most rows a list holds in one request: far above what a profile has. */
export const LIGNES_MAX = 100

/** The most rows the list held by a row has (the options of one offer). */
export const OPTIONS_MAX = 30

export const MESSAGES_DE_LISTE = {
	aucune: (singulier: string) => `Aucune ${singulier} pour l’instant.`,
	enCours:
		'Tu as une ligne en cours de saisie : ajoute-la, ou vide le formulaire, avant d’enregistrer. Sinon elle serait perdue.',
	pasUnTexte: 'Ce champ doit être un texte.',
	ligneInvalide: (nom: string, message: string) => `La ligne « ${nom} » n’est pas valide : ${message}`,
	optionInvalide: (nom: string, option: string, message: string) =>
		`L’option « ${option} » de « ${nom} » n’est pas valide : ${message}`,
	optionsEnDouble: (nom: string, option: string) =>
		`« ${nom} » a deux options identiques : « ${option} ». Retire l’une des deux.`,
	tropDOptions: `Une prestation ne peut pas avoir plus de ${OPTIONS_MAX} options.`,
	optionEnCours:
		'Tu as une option en cours de saisie : ajoute-la, ou vide ses champs, avant de valider la prestation. Sinon elle serait perdue.',
} as const

/** The texts of a row, trimmed, with only the fields of the section (a field missing is empty). */
export function nettoyerLaLigne(definition: DefinitionDeListe, valeurs: ValeursDeLigne): Record<string, string> {
	return Object.fromEntries(definition.champs.map(({ nom }) => [nom, (valeurs[nom] ?? '').trim()]))
}

/** True when the two lists say the same, in the same order; the identifiers do not count. */
export function memesLignes(
	definition: DefinitionDeListe,
	a: readonly { readonly valeurs: ValeursDeLigne }[],
	b: readonly { readonly valeurs: ValeursDeLigne }[]
): boolean {
	return a.length === b.length && a.every((ligne, rang) => memeLigne(definition, ligne.valeurs, b[rang]?.valeurs ?? {}))
}

/** The row of an empty form. */
export function ligneVide(definition: DefinitionDeListe): Record<string, string> {
	return Object.fromEntries(definition.champs.map(({ nom }) => [nom, '']))
}

/**
 * What decides that two rows are the same: every field, trimmed; a date by the day it writes. The
 * case counts. The identifiers do not.
 */
function empreinte(definition: DefinitionDeListe, valeurs: ValeursDeLigne): string {
	return JSON.stringify(
		definition.champs.map(({ nom, genre }) => {
			const v = (valeurs[nom] ?? '').trim()
			return genre === 'date' ? (jourCalendaire(v) ?? v) : v
		})
	)
}

export const memeLigne = (definition: DefinitionDeListe, a: ValeursDeLigne, b: ValeursDeLigne): boolean =>
	empreinte(definition, a) === empreinte(definition, b)

/** True when the form is an empty row. */
export const ligneEstVide = (definition: DefinitionDeListe, valeurs: ValeursDeLigne): boolean =>
	memeLigne(definition, valeurs, ligneVide(definition))

/**
 * The refusals of a row, by field: the fields it requires and that are empty (`avecRequis`), then the
 * bounds of the values. The values are the trimmed ones.
 */
export function erreursDeLaLigne(
	definition: DefinitionDeListe,
	valeurs: ValeursDeLigne,
	{ avecRequis, maintenant }: { avecRequis: boolean; maintenant: Date }
): ErreursDeLigne {
	const manquants = avecRequis ? Object.entries(definition.requis).filter(([nom]) => (valeurs[nom] ?? '') === '') : []
	return { ...definition.bornes(valeurs, maintenant), ...Object.fromEntries(manquants) }
}

/** The day of a date field as the form writes it, « YYYY-MM-DD », or '' for nothing. */
export const jourDuFormulaire = (valeur: unknown): string => jourCalendaire(valeur) ?? ''

/**
 * Where the focus goes after a row is removed (rule L4): the row that takes its place, or the one
 * above when it was the last, or nothing when the list is empty.
 */
export function rangApresRetrait(restantes: number, rangRetire: number): number | null {
	if (restantes === 0) return null
	return Math.min(rangRetire, restantes - 1)
}

/** What the server accepts: the rows, each with its texts and no other key. */
export function schemaDeLaListe(definition: DefinitionDeListe) {
	const texte = z.string({ error: MESSAGES_DE_LISTE.pasUnTexte })
	const ligne = (def: DefinitionDeListe) => ({
		id: z.string().min(1).max(64).optional(),
		valeurs: z.strictObject(Object.fromEntries(def.champs.map(({ nom }) => [nom, texte]))),
	})
	const options = definition.options
	const lignes = z.strictObject({
		...ligne(definition),
		...(options === undefined
			? {}
			: {
					options: z
						.array(z.strictObject(ligne(options)))
						.max(OPTIONS_MAX)
						.optional(),
				}),
	})
	return z.strictObject({ lignes: z.array(lignes).max(LIGNES_MAX) })
}

const estUneLigne = (valeur: unknown): valeur is Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

/** The rows of a stored list, each with its identifier and the texts of the form (and its own list, if any). */
export function lignesDeLaListe(definition: DefinitionDeListe, brutes: unknown): LigneEnregistree[] {
	if (!Array.isArray(brutes)) return []
	return brutes.filter(estUneLigne).flatMap(ligne => {
		if (typeof ligne.id !== 'string' || ligne.id === '') return []
		const valeurs = definition.depuisLeStockage(ligne)
		return [
			definition.options === undefined
				? { id: ligne.id, valeurs }
				: { id: ligne.id, valeurs, options: lignesDeLaListe(definition.options, ligne.options) },
		]
	})
}

/** The rows of a section as the database stored them, each with its identifier and the texts of the form. */
export function lignesDuProfil(definition: DefinitionDeListe, profil: object | null): LigneEnregistree[] {
	return lignesDeLaListe(definition, (profil as Record<string, unknown> | null)?.[definition.section])
}
