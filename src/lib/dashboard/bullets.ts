/**
 * The lists of chips of her space: her languages (ticket 127) and her skills (ticket 128). One
 * module, read by the editor in the browser and by the server actions, so the two never disagree.
 * A chip is a name, kept in a list that has an order; a skill row also holds a description that
 * the chips never touch (`enregistrer-puces.ts` keeps it).
 *
 * - A name is trimmed, never empty, and 70 characters at most (E30, the bound of the collection).
 * - A name already in the list is not added a second time: the same name once the spaces around it
 *   and the case are left out (« anglais » and « Anglais » are one language). Chips stored twice
 *   before (an import, the old site) stay: each is removed on its own.
 * - A chip has its own identifier (rule L1 of docs/qualite.md §3): the server gives it when the chip
 *   is stored and keeps it; a chip added in the editor has a local one that no other chip shares,
 *   and that is never sent.
 * - A « ; » ends a name, as on the current site: « Anglais; Espagnol; » adds two chips.
 * - Every message is in French, in the tone of the site (« tu »).
 */

import { z } from 'zod'
import { LONGUEUR_NOM } from '../profil/listes'
import { texte } from '../profil/nom-affiche'

export const LONGUEUR_PUCE = LONGUEUR_NOM
/** More chips than any makeup artist lists: a request beyond it is not a list she edited. */
export const NOMBRE_MAX_DE_PUCES = 100

/** The two lists that are edited as chips. `champ` is the field of the collection `profiles`. */
export type ChampDePuces = 'languages' | 'skills'

/** A chip as the editor holds it: a name and an identifier that no other chip shares. */
export interface Puce {
	readonly id: string
	readonly nom: string
}

/** What the editor sends and what the server gives back, in the order of the list. */
export interface ValeursDesPuces extends Record<string, unknown> {
	readonly puces: readonly Puce[]
}

export interface SorteDePuces {
	readonly champ: ChampDePuces
	/** The value of `section` of the event `profile_save` (the catalogue of the measure keeps its French words). */
	readonly mesure: 'langues' | 'competences'
	/** The name of the field, in the label and the title of the panel. */
	readonly libelle: string
	readonly titre: string
	readonly bouton: string
	readonly requis: string
	readonly tropLong: string
	readonly doublon: string
	readonly invalide: string
	readonly explication: string
	/** The title of the list of chips, and what the panel says while it is empty. */
	readonly ajoutees: string
	readonly vide: string
	readonly retiree: (nom: string) => string
	readonly enregistre: string
}

export const LANGUES: SorteDePuces = {
	champ: 'languages',
	mesure: 'langues',
	libelle: 'Langue',
	titre: 'Modifier mes langues',
	bouton: 'Modifier mes langues',
	requis: 'Écris une langue avant de l’ajouter.',
	tropLong: `Une langue ne doit pas dépasser ${LONGUEUR_PUCE} caractères.`,
	doublon: 'Cette langue est déjà dans ta liste.',
	invalide: 'Une langue n’est pas valide : corrige-la, puis enregistre à nouveau.',
	explication:
		'Écris une langue, puis appuie sur Entrée ou sur « Ajouter ». Tu peux en écrire plusieurs en les séparant par un point-virgule.',
	ajoutees: 'Langues dans ta liste',
	vide: 'Aucune langue pour l’instant.',
	retiree: nom => `Langue ${nom} retirée`,
	enregistre: 'Tes langues sont enregistrées.',
}

export const COMPETENCES: SorteDePuces = {
	champ: 'skills',
	mesure: 'competences',
	libelle: 'Compétence',
	titre: 'Modifier mes compétences',
	bouton: 'Modifier mes compétences',
	requis: 'Écris une compétence avant de l’ajouter.',
	tropLong: `Une compétence ne doit pas dépasser ${LONGUEUR_PUCE} caractères.`,
	doublon: 'Cette compétence est déjà dans ta liste.',
	invalide: 'Une compétence n’est pas valide : corrige-la, puis enregistre à nouveau.',
	explication:
		'Écris une compétence, puis appuie sur Entrée ou sur « Ajouter ». Tu peux en écrire plusieurs en les séparant par un point-virgule.',
	ajoutees: 'Compétences dans ta liste',
	vide: 'Aucune compétence pour l’instant.',
	retiree: nom => `Compétence ${nom} retirée`,
	enregistre: 'Tes compétences sont enregistrées.',
}

/** The name as it is compared: without the spaces around it, without case. */
const cle = (nom: unknown): string => (typeof nom === 'string' ? nom.trim().toLowerCase() : '')

/** Whether this name is already one of the chips (the same name once spaces and case are left out). */
export function dejaDansLaListe(puces: readonly { readonly nom: string }[], nom: unknown): boolean {
	const cherche = cle(nom)
	return cherche !== '' && puces.some(puce => cle(puce.nom) === cherche)
}

/** The refusal of a name by its own rule (empty, too long), or `null`. The list is not looked at. */
export function refusDuNom(nom: string, sorte: SorteDePuces): string | null {
	const propre = nom.trim()
	if (propre === '') return sorte.requis
	return propre.length > LONGUEUR_PUCE ? sorte.tropLong : null
}

export type AjoutDeNoms =
	| { ok: true; noms: string[]; reste: string }
	| { ok: false; noms: string[]; reste: string; message: string }

/**
 * What a text typed in the field gives. Every name before a « ; » is added, in order; what follows
 * the last « ; » stays in the field (`reste`). With `finale`, the whole text is a name (Enter, the
 * button « Ajouter »). The first refused name stops the reading: it stays in the field with the
 * names after it, those before it are added.
 */
export function lireLesNoms(
	saisie: string,
	puces: readonly { readonly nom: string }[],
	sorte: SorteDePuces,
	finale: boolean
): AjoutDeNoms {
	const morceaux = saisie.split(';')
	const reste = finale ? '' : (morceaux.pop() ?? '')
	const noms: string[] = []
	for (const [rang, morceau] of morceaux.entries()) {
		const nom = morceau.trim()
		// An empty piece between two separators says nothing: it is skipped, not refused.
		if (nom === '' && (morceaux.length > 1 || !finale)) continue
		const refus =
			refusDuNom(nom, sorte) ??
			(dejaDansLaListe([...puces, ...noms.map(n => ({ nom: n }))], nom) ? sorte.doublon : null)
		if (refus !== null) {
			return { ok: false, noms, reste: [...morceaux.slice(rang), ...(finale ? [] : [reste])].join(';'), message: refus }
		}
		noms.push(nom)
	}
	return { ok: true, noms, reste }
}

const schemaDUnePuce = z.strictObject({ id: z.string().max(200).optional(), nom: z.string() })

/** The request of a save: the chips in order, and nothing else. A key that is not one refuses it whole. */
export const schemaDesPucesStrict = z.strictObject({
	puces: z.array(schemaDUnePuce).max(NOMBRE_MAX_DE_PUCES),
})

export interface PuceEnvoyee {
	/** Present when the chip was stored: the server keeps it when it is one of this profile. */
	readonly id?: string
	readonly nom: string
}

export type LectureDesPuces = { ok: true; puces: PuceEnvoyee[] } | { ok: false; message: string }

/**
 * The chips of a request, each name trimmed and checked against its bound (E30). Whether the name
 * duplicates another chip is decided by the caller, which knows what is stored.
 */
export function lireLesPuces(sorte: SorteDePuces, saisie: unknown): LectureDesPuces {
	const forme = schemaDesPucesStrict.safeParse(saisie)
	if (!forme.success) return { ok: false, message: sorte.invalide }
	const puces: PuceEnvoyee[] = []
	for (const { id, nom } of forme.data.puces) {
		const refus = refusDuNom(nom, sorte)
		if (refus !== null) return { ok: false, message: refus }
		puces.push(id === undefined || id === '' ? { nom: nom.trim() } : { id, nom: nom.trim() })
	}
	return { ok: true, puces }
}

/** The chips of a stored list: a row without a name says nothing and is left out. */
export function pucesDeLaListe(lignes: readonly { name?: unknown; id?: unknown }[] | null | undefined): Puce[] {
	return (lignes ?? []).flatMap(({ id, name }) => {
		const propre = texte(name).trim()
		return propre === '' || typeof id !== 'string' || id === '' ? [] : [{ id, nom: propre }]
	})
}
