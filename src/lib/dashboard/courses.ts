/**
 * The courses of a makeup artist, edited row by row in her space (ticket 130; plan 02 U30, E31). Same
 * model as the experiences (src/lib/dashboard/experiences.ts).
 *
 * - Required, for the row she adds or edits: the diploma and the school. The day it was obtained and
 *   the description may stay empty.
 * - A day more than a year ahead is refused under its field (U30), by the rule of the collection
 *   (`messageDObtention`, src/lib/profil/listes.ts): a course to come may be listed, not one made up
 *   far ahead.
 */

import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM, messageDeTexte, messageDObtention } from '../profile/lists'
import { texte } from '../profile/display-name'
import { moisAnnee } from '../profile/public-view'
import { formDay, type ListDefinition, type RowErrors, type RowValues } from './list'

function bounds(valeurs: RowValues, maintenant: Date): RowErrors {
	const errors: Record<string, string> = {}
	for (const [field, maximum] of [
		['diploma', LONGUEUR_NOM],
		['school', LONGUEUR_NOM],
		['description', LONGUEUR_DESCRIPTION],
	] as const) {
		const message = messageDeTexte(valeurs[field], maximum)
		if (message !== null) errors[field] = message
	}
	const message = messageDObtention(valeurs.graduatedAt ? valeurs.graduatedAt : null, maintenant)
	if (message !== null) errors.graduatedAt = message
	return errors
}

const emptyToNull = (valeur: string | undefined): string | null => (valeur ? valeur : null)

export const COURSES: ListDefinition = {
	section: 'courses',
	singulier: 'formation',
	pluriel: 'formations',
	designation: 'la formation',
	champs: [
		{ nom: 'diploma', libelle: 'Diplôme', genre: 'texte', exemple: 'CAP esthétique' },
		{ nom: 'school', libelle: 'École', genre: 'texte' },
		{ nom: 'graduatedAt', libelle: 'Date d’obtention', genre: 'date' },
		{ nom: 'description', libelle: 'Description', genre: 'long' },
	],
	requis: {
		diploma: 'Le nom du diplôme est requis.',
		school: 'Le nom de l’école est requis.',
	},
	doublon: 'Une formation identique est déjà dans la liste.',
	bornes: bounds,
	resume: valeurs =>
		[valeurs.diploma, valeurs.school, moisAnnee(valeurs.graduatedAt)].map(texte).filter(Boolean).join(' - '),
	nom: valeurs => texte(valeurs.diploma) || texte(valeurs.school),
	retrait: nom => `Formation ${nom} retirée`.replace(/\s+/g, ' '),
	depuisLeStockage: stockee => ({
		diploma: texte(stockee.diploma),
		school: texte(stockee.school),
		graduatedAt: formDay(stockee.graduatedAt),
		description: typeof stockee.description === 'string' ? stockee.description.trim() : '',
	}),
	versLeStockage: valeurs => ({
		diploma: emptyToNull(valeurs.diploma),
		school: emptyToNull(valeurs.school),
		graduatedAt: emptyToNull(valeurs.graduatedAt),
		description: emptyToNull(valeurs.description),
	}),
}
