/**
 * The offers of a makeup artist, edited row by row in her space (ticket 131; plan 01 §3.3 P7.4,
 * plan 02 U29, U04). Same model as the experiences (src/lib/espace/experiences.ts).
 *
 * - Required, for the row she adds or edits: the name. The description and the price may stay empty.
 * - The price is one text, as typed: « 80 », « 80 € », « à partir de 80 » or « sur devis ». The server
 *   reads the amount from it by the single price rule (`parsePrice`, src/lib/prix.ts) and stores both:
 *   the text as typed and the amount, if there is one. The amount makes the offer count towards a
 *   publishable profile (U04). A request cannot carry an amount: the schema has no such field.
 * - Several prices of one offer are typed with « ; » between them, and stored one per line, as on
 *   the old site.
 * - The options of an offer (ticket 132) are edited in the same panel: each has a name (required), a
 *   description and a price, read by the same rules as the offer's own. A request that sends no
 *   `options` for an offer keeps the stored ones.
 */

import { formatMontant, formatPrix, parsePrice } from '../prix'
import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM, messageDeTexte } from '../profil/listes'
import { texte } from '../profil/nom-affiche'
import type { DefinitionDeListe, ErreursDeLigne, ValeursDeLigne } from './liste'

/** The price as typed (« ; » between several), as the one text that is stored (one per line). */
export function prixDeLaSaisie(saisie: string): string {
	return saisie
		.split(/[;\n]/)
		.map(ligne => ligne.trim())
		.filter(Boolean)
		.join('\n')
}

/** The price as it is typed again in the form: the lines of the stored text, « ; » between them. */
const prixEnSaisie = (stocke: unknown): string => (typeof stocke === 'string' ? stocke.split('\n').join(' ; ') : '')

export const MESSAGES_DES_PRESTATIONS = {
	montant: (montant: string) => `Montant retenu pour ton profil : ${montant}.`,
	sansMontant:
		'Aucun montant retenu : l’offre est affichée telle quelle, mais elle ne compte pas pour rendre ton profil publiable. Écris par exemple « à partir de 80 € ».',
} as const

function bornes(valeurs: ValeursDeLigne): ErreursDeLigne {
	const erreurs: Record<string, string> = {}
	const nom = messageDeTexte(valeurs.nom, LONGUEUR_NOM)
	if (nom !== null) erreurs.nom = nom
	const description = messageDeTexte(valeurs.description, LONGUEUR_DESCRIPTION)
	if (description !== null) erreurs.description = description
	const prix = messageDeTexte(prixDeLaSaisie(valeurs.prix ?? ''), LONGUEUR_NOM)
	if (prix !== null) erreurs.prix = prix
	return erreurs
}

/** The two stored fields of a price typed in the form. */
const prixStocke = (saisie: string | undefined) => parsePrice(prixDeLaSaisie(saisie ?? ''))

/** What an offer and an option share: their three fields, bounds, price reading and storage. */
const COMMUN = {
	champs: [
		{ nom: 'nom', libelle: 'Nom', genre: 'texte' },
		{ nom: 'description', libelle: 'Description', genre: 'long' },
		{
			nom: 'prix',
			libelle: 'Prix',
			genre: 'texte',
			exemple: 'à partir de 80 €',
			aide: 'Un montant (80, 80 €, à partir de 80) ou un texte (sur devis). Pour plusieurs formules, sépare-les par un point-virgule.',
		},
	],
	bornes,
	resume: (valeurs: ValeursDeLigne) =>
		[valeurs.nom, formatPrix(prixStocke(valeurs.prix)).replace(/\n/g, ', ')].map(texte).filter(Boolean).join(' - '),
	nom: (valeurs: ValeursDeLigne) => texte(valeurs.nom),
	depuisLeStockage: (stockee: Readonly<Record<string, unknown>>) => ({
		nom: texte(stockee.nom),
		description: typeof stockee.description === 'string' ? stockee.description.trim() : '',
		prix: prixEnSaisie(
			// An amount stored without its text (an imported offer) is typed back as the amount.
			texte(stockee.prixTexte) !== ''
				? stockee.prixTexte
				: typeof stockee.prixAPartirDe === 'number'
					? String(stockee.prixAPartirDe)
					: ''
		),
	}),
	versLeStockage: (valeurs: ValeursDeLigne) => {
		const { prixTexte, prixAPartirDe } = prixStocke(valeurs.prix)
		return { nom: valeurs.nom || null, description: valeurs.description || null, prixTexte, prixAPartirDe }
	},
	indice: (valeurs: ValeursDeLigne) => {
		if (prixDeLaSaisie(valeurs.prix ?? '') === '') return ''
		const { prixAPartirDe } = prixStocke(valeurs.prix)
		return prixAPartirDe === null
			? MESSAGES_DES_PRESTATIONS.sansMontant
			: MESSAGES_DES_PRESTATIONS.montant(formatMontant(prixAPartirDe))
	},
} as const

/** The options of an offer (ticket 132): the same three fields, the name required. */
export const OPTIONS_DE_PRESTATION: DefinitionDeListe = {
	...COMMUN,
	section: 'options',
	singulier: 'option',
	pluriel: 'options',
	designation: 'l’option',
	champs: [
		{ ...COMMUN.champs[0], libelle: 'Nom de l’option', exemple: 'Essai avant le jour J' },
		...COMMUN.champs.slice(1),
	],
	requis: { nom: 'Le nom de l’option est requis.' },
	doublon: 'Une option identique est déjà dans la liste.',
	retrait: nom => `Option ${nom} retirée`.replace(/\s+/g, ' '),
}

export const PRESTATIONS: DefinitionDeListe = {
	...COMMUN,
	section: 'prestations',
	singulier: 'prestation',
	pluriel: 'prestations',
	designation: 'la prestation',
	champs: [
		{ ...COMMUN.champs[0], libelle: 'Nom de la prestation', exemple: 'Maquillage de mariée' },
		...COMMUN.champs.slice(1),
	],
	requis: { nom: 'Le nom de la prestation est requis.' },
	doublon: 'Une prestation identique est déjà dans la liste.',
	retrait: nom => `Prestation ${nom} retirée`.replace(/\s+/g, ' '),
	options: OPTIONS_DE_PRESTATION,
	garder: stockee => ({ options: Array.isArray(stockee.options) ? stockee.options : [] }),
}
