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
import { type DefinitionDeListe, type ErreursDeLigne, jourDuFormulaire, type ValeursDeLigne } from './liste'

const TEXTES: readonly [string, number][] = [
	['entreprise', LONGUEUR_NOM],
	['poste', LONGUEUR_NOM],
	['ville', LONGUEUR_NOM],
	['description', LONGUEUR_DESCRIPTION],
]

const apresVide = (valeur: string | undefined): string | null => (valeur === undefined || valeur === '' ? null : valeur)

function bornes(valeurs: ValeursDeLigne): ErreursDeLigne {
	const erreurs: Record<string, string> = {}
	for (const [champ, maximum] of TEXTES) {
		const message = messageDeTexte(valeurs[champ], maximum)
		if (message !== null) erreurs[champ] = message
	}
	const debut = apresVide(valeurs.debut)
	const fin = apresVide(valeurs.fin)
	const messageDebut = messageDeDate(debut)
	if (messageDebut !== null) erreurs.debut = messageDebut
	const messageFin = messageDeFin(fin, messageDebut === null ? debut : null)
	if (messageFin !== null) erreurs.fin = messageFin
	return erreurs
}

const enNull = (valeur: string | undefined): string | null => (valeur ? valeur : null)

export const EXPERIENCES: DefinitionDeListe = {
	section: 'experiences',
	singulier: 'expérience',
	pluriel: 'expériences',
	designation: 'l’expérience',
	champs: [
		{ nom: 'poste', libelle: 'Poste', genre: 'texte', exemple: 'Maquilleuse mariage' },
		{ nom: 'entreprise', libelle: 'Entreprise', genre: 'texte', exemple: 'Studio Fictif' },
		{ nom: 'ville', libelle: 'Ville', genre: 'texte' },
		{ nom: 'debut', libelle: 'Début', genre: 'date' },
		{ nom: 'fin', libelle: 'Fin', genre: 'date', aide: 'Laisse vide si tu y es encore.' },
		{ nom: 'description', libelle: 'Description', genre: 'long' },
	],
	requis: {
		entreprise: 'Le nom de l’entreprise est requis.',
		poste: 'Le nom du poste est requis.',
		debut: 'La date de début de l’expérience est requise.',
	},
	doublon: 'Une expérience identique est déjà dans la liste.',
	bornes,
	resume: valeurs =>
		[valeurs.poste, valeurs.entreprise, valeurs.ville, periode({ debut: valeurs.debut, fin: valeurs.fin })]
			.map(texte)
			.filter(Boolean)
			.join(' - '),
	nom: valeurs => texte(valeurs.entreprise) || texte(valeurs.poste),
	retrait: nom => `Expérience ${nom} retirée`.replace(/\s+/g, ' '),
	depuisLeStockage: stockee => ({
		poste: texte(stockee.poste),
		entreprise: texte(stockee.entreprise),
		ville: texte(stockee.ville),
		debut: jourDuFormulaire(stockee.debut),
		fin: jourDuFormulaire(stockee.fin),
		description: typeof stockee.description === 'string' ? stockee.description.trim() : '',
	}),
	versLeStockage: valeurs => ({
		poste: enNull(valeurs.poste),
		entreprise: enNull(valeurs.entreprise),
		ville: enNull(valeurs.ville),
		debut: enNull(valeurs.debut),
		fin: enNull(valeurs.fin),
		description: enNull(valeurs.description),
	}),
}
