/**
 * Where her profile stands, at the top of her space (ticket 138; plan 01 §3.3 P7.1; plan 02 U01-U08):
 * the percentage of completeness, the state, what the state changes for her, and what she lacks,
 * each point linked to the card of its section.
 *
 * Nothing is computed here: the score, the flags and the conditions come from the single definition
 * of a profile (src/lib/profil/completude.ts), read through the same mapping the server uses at
 * every save (`champsDuProfil`, src/lib/profil/etat.ts). This file only words them. Pure functions,
 * no server code: the page and the tests call them.
 */

import { PRIX_MAX, PRIX_MIN } from '../prix'
import {
	type Completude,
	CRITERES,
	type Critere,
	completude,
	DESCRIPTION_MIN,
	longueurDescription,
} from '../profil/completude'
import { champsDuProfil } from '../profil/etat'
import type { ProfilDeLEspace, Section } from './cards'
import { estDisponible } from './availability'

/** Where a profile stands for her: the four states the page names. */
export type EtatAffiche = 'vide' | 'incomplet' | 'publiable' | 'interne'

/** One point she lacks. */
export interface Manque {
	readonly critere: Critere
	/** What to do, in French. */
	readonly texte: string
	/** The card to go to: the link is `#carte-<section>`. */
	readonly section: Section
	/** True when the point stands between her profile and « publiable ». */
	readonly requis: boolean
}

export interface Avancement {
	readonly score: number
	readonly sur: 13
	/** `score` out of `sur`, rounded, 0 to 100. */
	readonly pourcentage: number
	readonly etat: EtatAffiche
	readonly titre: string
	/** What the state changes for her, in French. */
	readonly consequence: string
	/** What she lacks, in the display order of the criteria; the required ones first. */
	readonly manques: readonly Manque[]
}

/** The card where each criterion of the progress bar is edited. */
export const SECTION_DU_CRITERE: Record<Critere, Section> = {
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

const TEXTE_ABSENT: Record<Critere, string> = {
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
const CONDITION_DU_CRITERE = {
	photo: 'photoPrincipale',
	ville: 'villeExploitable',
	specialite: 'specialite',
	offres: 'offreChiffree',
	description: 'descriptionLongue',
	reseaux: 'canalDeContact',
} as const satisfies Partial<Record<Critere, keyof Completude['conditions']>>

function texteDuManque(critere: Critere, absent: boolean, profil: ProfilDeLEspace): string {
	if (absent) return TEXTE_ABSENT[critere]
	if (critere === 'description') {
		return `Allonge ta description : ${DESCRIPTION_MIN} caractères au moins pour être publiable (${longueurDescription(profil.description)} aujourd’hui).`
	}
	if (critere === 'offres') {
		return `Donne un prix en chiffres, entre ${PRIX_MIN} et ${PRIX_MAX.toLocaleString('fr-FR')} €, à l’une de tes prestations.`
	}
	return TEXTE_ABSENT[critere]
}

function etatDe(lecture: Completude): EtatAffiche {
	if (lecture.interne) return 'interne'
	if (lecture.publiable) return 'publiable'
	return lecture.entierementVide ? 'vide' : 'incomplet'
}

const TITRES: Record<EtatAffiche, string> = {
	vide: 'Ton profil est vide',
	incomplet: 'Ton profil n’est pas encore publiable',
	publiable: 'Ton profil est publiable',
	interne: 'Compte interne My Makeup',
}

const CONSEQUENCES: Record<EtatAffiche, string> = {
	vide: 'Un profil entièrement vide n’est pas listé dans la recherche. Dès qu’un des points ci-dessous « pour être publiable » est rempli, il y apparaît.',
	incomplet:
		'Ton profil apparaît dans la recherche, mais Google ne l’indexe pas encore : remplis les points « pour être publiable » ci-dessous.',
	publiable: 'Ton profil apparaît dans la recherche et Google peut l’indexer.',
	interne: 'Ce compte est celui de l’équipe : son profil n’est jamais publiable, ni indexé.',
}

const HORS_RECHERCHE =
	' Tu es pourtant marquée « pas disponible » : tant que tu l’es, tu n’apparais pas dans la recherche.'

/**
 * The progress of a profile, by the single definition: what the server stores at every save is
 * computed by the same function from the same fields (plan 02 I20).
 */
export function avancementDuProfil(profil: ProfilDeLEspace): Avancement {
	const lecture = completude(champsDuProfil(profil))
	const absents = new Set<Critere>(lecture.manquants)
	const manques = CRITERES.flatMap((critere): Manque[] => {
		const absent = absents.has(critere)
		const condition =
			critere in CONDITION_DU_CRITERE ? CONDITION_DU_CRITERE[critere as keyof typeof CONDITION_DU_CRITERE] : null
		const requis = condition !== null && !lecture.conditions[condition]
		if (!(absent || requis)) return []
		return [{ critere, texte: texteDuManque(critere, absent, profil), section: SECTION_DU_CRITERE[critere], requis }]
	})
	const etat = etatDe(lecture)
	const cacheeParLaDisponibilite = (etat === 'incomplet' || etat === 'publiable') && !estDisponible(profil.available)
	return {
		score: lecture.score,
		sur: lecture.sur,
		pourcentage: Math.round((lecture.score / lecture.sur) * 100),
		etat,
		titre: TITRES[etat],
		consequence: CONSEQUENCES[etat] + (cacheeParLaDisponibilite ? HORS_RECHERCHE : ''),
		manques: [...manques.filter(m => m.requis), ...manques.filter(m => !m.requis)],
	}
}
