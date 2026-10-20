/**
 * The experiences of a makeup artist, edited row by row in her space (ticket 129; plan 02 U30, E31).
 * The description of the section for the list module (src/lib/espace/liste.ts), read by the panel and
 * by the server action.
 *
 * - Required, for the row she adds or edits: the company, the job and the start day. The city, the
 *   end day and the description may stay empty (an experience still going on has no end).
 * - An end before the start is refused under the end field (U30), by the rule of the collection
 *   (`messageDeFin`, src/lib/profil/listes.ts): the form and the server cannot disagree.
 * - Texts: 70 characters at most, 2 000 for the description; dates are days (« YYYY-MM-DD »).
 */

import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM, messageDeDate, messageDeFin, messageDeTexte } from '../profil/listes'
import { texte } from '../profil/nom-affiche'
import { periode } from '../profil/vue-publique'
import { type DefinitionDeListe, type ErreursDeLigne, jourDuFormulaire, type ValeursDeLigne } from './list'

const TEXTES: readonly [string, number][] = [
	['company', LONGUEUR_NOM],
	['jobTitle', LONGUEUR_NOM],
	['city', LONGUEUR_NOM],
	['description', LONGUEUR_DESCRIPTION],
]

const apresVide = (valeur: string | undefined): string | null => (valeur === undefined || valeur === '' ? null : valeur)

function bornes(valeurs: ValeursDeLigne): ErreursDeLigne {
	const erreurs: Record<string, string> = {}
	for (const [champ, maximum] of TEXTES) {
		const message = messageDeTexte(valeurs[champ], maximum)
		if (message !== null) erreurs[champ] = message
	}
	const startDate = apresVide(valeurs.startDate)
	const endDate = apresVide(valeurs.endDate)
	const messageDebut = messageDeDate(startDate)
	if (messageDebut !== null) erreurs.startDate = messageDebut
	const messageFin = messageDeFin(endDate, messageDebut === null ? startDate : null)
	if (messageFin !== null) erreurs.endDate = messageFin
	return erreurs
}

const enNull = (valeur: string | undefined): string | null => (valeur ? valeur : null)

export const EXPERIENCES: DefinitionDeListe = {
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
	bornes,
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
		startDate: jourDuFormulaire(stockee.startDate),
		endDate: jourDuFormulaire(stockee.endDate),
		description: typeof stockee.description === 'string' ? stockee.description.trim() : '',
	}),
	versLeStockage: valeurs => ({
		jobTitle: enNull(valeurs.jobTitle),
		company: enNull(valeurs.company),
		city: enNull(valeurs.city),
		startDate: enNull(valeurs.startDate),
		endDate: enNull(valeurs.endDate),
		description: enNull(valeurs.description),
	}),
}
