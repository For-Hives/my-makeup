/**
 * The courses of a makeup artist, edited row by row in her space (ticket 130; plan 02 U30, E31). Same
 * model as the experiences (src/lib/dashboard/experiences.ts).
 *
 * - Required, for the row she adds or edits: the diploma and the school. The day it was obtained and
 *   the description may stay empty.
 * - A day more than a year ahead is refused under its field (U30), by the rule of the collection
 *   (`obtainMessage`, src/lib/profile/lists.ts): a course to come may be listed, not one made up
 *   far ahead.
 */

import { text } from '../profile/display-name'
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, obtainMessage, textMessage } from '../profile/lists'
import { monthYear } from '../profile/public-view'
import { formDay, type ListDefinition, type RowErrors, type RowValues } from './list'

function bounds(valeurs: RowValues, maintenant: Date): RowErrors {
	const errors: Record<string, string> = {}
	for (const [field, maximum] of [
		['diploma', NAME_MAX_LENGTH],
		['school', NAME_MAX_LENGTH],
		['description', DESCRIPTION_MAX_LENGTH],
	] as const) {
		const message = textMessage(valeurs[field], maximum)
		if (message !== null) errors[field] = message
	}
	const message = obtainMessage(valeurs.graduatedAt ? valeurs.graduatedAt : null, maintenant)
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
		[valeurs.diploma, valeurs.school, monthYear(valeurs.graduatedAt)].map(text).filter(Boolean).join(' - '),
	nom: valeurs => text(valeurs.diploma) || text(valeurs.school),
	retrait: nom => `Formation ${nom} retirée`.replace(/\s+/g, ' '),
	depuisLeStockage: stockee => ({
		diploma: text(stockee.diploma),
		school: text(stockee.school),
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
