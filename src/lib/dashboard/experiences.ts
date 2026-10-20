/**
 * The experiences of a makeup artist, edited row by row in her space (ticket 129; plan 02 U30, E31).
 * The description of the section for the list module (src/lib/dashboard/list.ts), read by the panel and
 * by the server action.
 *
 * - Required, for the row she adds or edits: the company, the job and the start day. The city, the
 *   end day and the description may stay empty (an experience still going on has no end).
 * - An end before the start is refused under the end field (U30), by the rule of the collection
 *   (`messageDeFin`, src/lib/profil/listes.ts): the form and the server cannot disagree.
 * - Texts: 70 characters at most, 2 000 for the description; dates are days (« YYYY-MM-DD »).
 */

import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM, messageDeDate, messageDeFin, messageDeTexte } from '../profile/lists'
import { texte } from '../profile/display-name'
import { periode } from '../profile/public-view'
import { formDay, type ListDefinition, type RowErrors, type RowValues } from './list'

const TEXTS: readonly [string, number][] = [
	['company', LONGUEUR_NOM],
	['jobTitle', LONGUEUR_NOM],
	['city', LONGUEUR_NOM],
	['description', LONGUEUR_DESCRIPTION],
]

const afterEmpty = (valeur: string | undefined): string | null =>
	valeur === undefined || valeur === '' ? null : valeur

function bounds(valeurs: RowValues): RowErrors {
	const errors: Record<string, string> = {}
	for (const [field, maximum] of TEXTS) {
		const message = messageDeTexte(valeurs[field], maximum)
		if (message !== null) errors[field] = message
	}
	const startDate = afterEmpty(valeurs.startDate)
	const endDate = afterEmpty(valeurs.endDate)
	const startMessage = messageDeDate(startDate)
	if (startMessage !== null) errors.startDate = startMessage
	const endMessage = messageDeFin(endDate, startMessage === null ? startDate : null)
	if (endMessage !== null) errors.endDate = endMessage
	return errors
}

const emptyToNull = (valeur: string | undefined): string | null => (valeur ? valeur : null)

export const EXPERIENCES: ListDefinition = {
	section: 'experiences',
	singulier: 'expérience',
	pluriel: 'expériences',
	designation: 'l’expérience',
	champs: [
		{ nom: 'jobTitle', libelle: 'Poste', genre: 'texte', exemple: 'Maquilleuse mariage' },
		{ nom: 'company', libelle: 'Entreprise', genre: 'texte', exemple: 'Studio Fictif' },
		{ nom: 'city', libelle: 'Ville', genre: 'texte' },
		{ nom: 'startDate', libelle: 'Début', genre: 'date' },
		{ nom: 'endDate', libelle: 'Fin', genre: 'date', aide: 'Laisse vide si tu y es encore.' },
		{ nom: 'description', libelle: 'Description', genre: 'long' },
	],
	requis: {
		company: 'Le nom de l’entreprise est requis.',
		jobTitle: 'Le nom du poste est requis.',
		startDate: 'La date de début de l’expérience est requise.',
	},
	doublon: 'Une expérience identique est déjà dans la liste.',
	bornes: bounds,
	resume: valeurs =>
		[
			valeurs.jobTitle,
			valeurs.company,
			valeurs.city,
			periode({ startDate: valeurs.startDate, endDate: valeurs.endDate }),
		]
			.map(texte)
			.filter(Boolean)
			.join(' - '),
	nom: valeurs => texte(valeurs.company) || texte(valeurs.jobTitle),
	retrait: nom => `Expérience ${nom} retirée`.replace(/\s+/g, ' '),
	depuisLeStockage: stockee => ({
		jobTitle: texte(stockee.jobTitle),
		company: texte(stockee.company),
		city: texte(stockee.city),
		startDate: formDay(stockee.startDate),
		endDate: formDay(stockee.endDate),
		description: typeof stockee.description === 'string' ? stockee.description.trim() : '',
	}),
	versLeStockage: valeurs => ({
		jobTitle: emptyToNull(valeurs.jobTitle),
		company: emptyToNull(valeurs.company),
		city: emptyToNull(valeurs.city),
		startDate: emptyToNull(valeurs.startDate),
		endDate: emptyToNull(valeurs.endDate),
		description: emptyToNull(valeurs.description),
	}),
}
