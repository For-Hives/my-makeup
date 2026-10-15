/**
 * The courses of a makeup artist, edited row by row in her space (ticket 130; plan 02 U30, E31). Same
 * model as the experiences (src/lib/espace/experiences.ts).
 *
 * - Required, for the row she adds or edits: the diploma and the school. The day it was obtained and
 *   the description may stay empty.
 * - A day more than a year ahead is refused under its field (U30), by the rule of the collection
 *   (`messageDObtention`, src/lib/profil/listes.ts): a course to come may be listed, not one made up
 *   far ahead.
 */

import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM, messageDeTexte, messageDObtention } from '../profil/listes'
import { texte } from '../profil/nom-affiche'
import { moisAnnee } from '../profil/vue-publique'
import { type DefinitionDeListe, type ErreursDeLigne, jourDuFormulaire, type ValeursDeLigne } from './liste'

function bornes(valeurs: ValeursDeLigne, maintenant: Date): ErreursDeLigne {
	const erreurs: Record<string, string> = {}
	for (const [champ, maximum] of [
		['diplome', LONGUEUR_NOM],
		['ecole', LONGUEUR_NOM],
		['description', LONGUEUR_DESCRIPTION],
	] as const) {
		const message = messageDeTexte(valeurs[champ], maximum)
		if (message !== null) erreurs[champ] = message
	}
	const message = messageDObtention(valeurs.obtenuLe ? valeurs.obtenuLe : null, maintenant)
	if (message !== null) erreurs.obtenuLe = message
	return erreurs
}

const enNull = (valeur: string | undefined): string | null => (valeur ? valeur : null)

export const FORMATIONS: DefinitionDeListe = {
	section: 'formations',
	singulier: 'formation',
	pluriel: 'formations',
	designation: 'la formation',
	champs: [
		{ nom: 'diplome', libelle: 'Diplôme', genre: 'texte', exemple: 'CAP esthétique' },
		{ nom: 'ecole', libelle: 'École', genre: 'texte' },
		{ nom: 'obtenuLe', libelle: 'Date d’obtention', genre: 'date' },
		{ nom: 'description', libelle: 'Description', genre: 'long' },
	],
	requis: {
		diplome: 'Le nom du diplôme est requis.',
		ecole: 'Le nom de l’école est requis.',
	},
	doublon: 'Une formation identique est déjà dans la liste.',
	bornes,
	resume: valeurs =>
		[valeurs.diplome, valeurs.ecole, moisAnnee(valeurs.obtenuLe)].map(texte).filter(Boolean).join(' - '),
	nom: valeurs => texte(valeurs.diplome) || texte(valeurs.ecole),
	retrait: nom => `Formation ${nom} retirée`.replace(/\s+/g, ' '),
	depuisLeStockage: stockee => ({
		diplome: texte(stockee.diplome),
		ecole: texte(stockee.ecole),
		obtenuLe: jourDuFormulaire(stockee.obtenuLe),
		description: typeof stockee.description === 'string' ? stockee.description.trim() : '',
	}),
	versLeStockage: valeurs => ({
		diplome: enNull(valeurs.diplome),
		ecole: enNull(valeurs.ecole),
		obtenuLe: enNull(valeurs.obtenuLe),
		description: enNull(valeurs.description),
	}),
}
