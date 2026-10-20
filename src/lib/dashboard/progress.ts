/**
 * Where her profile stands, at the top of her space (ticket 138; plan 01 §3.3 P7.1; plan 02 U01-U08):
 * the percentage of completeness, the state, what the state changes for her, and what she lacks,
 * each point linked to the card of its section.
 *
 * Nothing is computed here: the score, the flags and the conditions come from the single definition
 * of a profile (src/lib/profile/completeness.ts), read through the same mapping the server uses at
 * every save (`profileFields`, src/lib/profile/state.ts). This file only words them. Pure functions,
 * no server code: the page and the tests call them.
 */

import { PRICE_MAX, PRICE_MIN } from '../price'
import {
	type Completeness,
	CRITERIA,
	type Criterion,
	completeness,
	DESCRIPTION_MIN,
	descriptionLength,
} from '../profile/completeness'
import { profileFields } from '../profile/state'
import { isAvailable } from './availability'
import type { DashboardProfile, Section } from './cards'

/** Where a profile stands for her: the four states the page names. */
export type DisplayedState = 'vide' | 'incomplet' | 'publiable' | 'interne'

/** One point she lacks. */
export interface Missing {
	readonly critere: Criterion
	/** What to do, in French. */
	readonly texte: string
	/** The card to go to: the link is `#carte-<section>`. */
	readonly section: Section
	/** True when the point stands between her profile and « publiable ». */
	readonly requis: boolean
}

export interface Progress {
	readonly score: number
	readonly sur: 13
	/** `score` out of `sur`, rounded, 0 to 100. */
	readonly pourcentage: number
	readonly etat: DisplayedState
	readonly titre: string
	/** What the state changes for her, in French. */
	readonly consequence: string
	/** What she lacks, in the display order of the criteria; the required ones first. */
	readonly manques: readonly Missing[]
}

/** The card where each criterion of the progress bar is edited. */
export const CRITERION_SECTION: Record<Criterion, Section> = {
	nom: 'identite',
	specialite: 'identite',
	nom_artiste: 'identite',
	ville: 'localisation',
	description: 'description',
	photo: 'photo',
	competences: 'competences',
	experiences: 'experiences',
	formations: 'formations',
	offres: 'prestations',
	reseaux: 'reseaux',
	langues: 'langues',
	galerie: 'portfolio',
}

const MISSING_TEXT: Record<Criterion, string> = {
	nom: 'Ajoute ton prénom et ton nom.',
	specialite: 'Indique ta spécialité.',
	nom_artiste: 'Ajoute ton nom d’artiste.',
	ville: 'Choisis ta commune.',
	description: 'Écris ta description.',
	photo: 'Ajoute ta photo principale.',
	competences: 'Ajoute au moins une compétence.',
	experiences: 'Ajoute au moins une expérience.',
	formations: 'Ajoute au moins une formation.',
	offres: 'Ajoute au moins une prestation, avec un prix en chiffres.',
	reseaux:
		'Ajoute un moyen de te contacter : un réseau, ton site, ou ton téléphone ou ton email affichés sur ton profil.',
	langues: 'Ajoute au moins une langue.',
	galerie: 'Ajoute des photos à ton portfolio.',
}

/** Which of the six conditions of « publiable » a criterion carries, when it carries one. */
const CRITERION_CONDITION = {
	photo: 'photoPrincipale',
	ville: 'villeExploitable',
	specialite: 'specialite',
	offres: 'offreChiffree',
	description: 'descriptionLongue',
	reseaux: 'canalDeContact',
} as const satisfies Partial<Record<Criterion, keyof Completeness['conditions']>>

function missingText(critere: Criterion, absent: boolean, profil: DashboardProfile): string {
	if (absent) return MISSING_TEXT[critere]
	if (critere === 'description') {
		return `Allonge ta description : ${DESCRIPTION_MIN} caractères au moins pour être publiable (${descriptionLength(profil.description)} aujourd’hui).`
	}
	if (critere === 'offres') {
		return `Donne un prix en chiffres, entre ${PRICE_MIN} et ${PRICE_MAX.toLocaleString('fr-FR')} €, à l’une de tes prestations.`
	}
	return MISSING_TEXT[critere]
}

function stateOf(lecture: Completeness): DisplayedState {
	if (lecture.interne) return 'interne'
	if (lecture.publiable) return 'publiable'
	return lecture.entierementVide ? 'vide' : 'incomplet'
}

const TITLES: Record<DisplayedState, string> = {
	vide: 'Ton profil est vide',
	incomplet: 'Ton profil n’est pas encore publiable',
	publiable: 'Ton profil est publiable',
	interne: 'Compte interne My Makeup',
}

const CONSEQUENCES: Record<DisplayedState, string> = {
	vide: 'Un profil entièrement vide n’est pas listé dans la recherche. Dès qu’un des points ci-dessous « pour être publiable » est rempli, il y apparaît.',
	incomplet:
		'Ton profil apparaît dans la recherche, mais Google ne l’indexe pas encore : remplis les points « pour être publiable » ci-dessous.',
	publiable: 'Ton profil apparaît dans la recherche et Google peut l’indexer.',
	interne: 'Ce compte est celui de l’équipe : son profil n’est jamais publiable, ni indexé.',
}

const OUT_OF_SEARCH =
	' Tu es pourtant marquée « pas disponible » : tant que tu l’es, tu n’apparais pas dans la recherche.'

/**
 * The progress of a profile, by the single definition: what the server stores at every save is
 * computed by the same function from the same fields (plan 02 I20).
 */
export function profileProgress(profil: DashboardProfile): Progress {
	const reading = completeness(profileFields(profil))
	const absents = new Set<Criterion>(reading.manquants)
	const missing = CRITERIA.flatMap((critere): Missing[] => {
		const absent = absents.has(critere)
		const condition =
			critere in CRITERION_CONDITION ? CRITERION_CONDITION[critere as keyof typeof CRITERION_CONDITION] : null
		const required = condition !== null && !reading.conditions[condition]
		if (!(absent || required)) return []
		return [
			{ critere, texte: missingText(critere, absent, profil), section: CRITERION_SECTION[critere], requis: required },
		]
	})
	const state = stateOf(reading)
	const hiddenByAvailability = (state === 'incomplet' || state === 'publiable') && !isAvailable(profil.available)
	return {
		score: reading.score,
		sur: reading.sur,
		pourcentage: Math.round((reading.score / reading.sur) * 100),
		etat: state,
		titre: TITLES[state],
		consequence: CONSEQUENCES[state] + (hiddenByAvailability ? OUT_OF_SEARCH : ''),
		manques: [...missing.filter(m => m.requis), ...missing.filter(m => !m.requis)],
	}
}
