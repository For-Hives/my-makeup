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

import { PUBLISHER } from '../legal'
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
export type DisplayedState = 'vide' | 'incomplet' | 'publiable' | 'interne' | 'masque'

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

/** The gauge as she reads it (ticket 306): the six essentials first, the bonus apart. */
export interface Gauge {
	readonly done: number
	readonly total: number
}

export interface Progress {
	readonly score: number
	readonly sur: 13
	/** `score` out of `sur`, rounded, 0 to 100. */
	readonly pourcentage: number
	/**
	 * The six conditions of a publishable page that are met, out of 6 (ticket 306): what the gauge counts first.
	 * Read from the six booleans of the single rule, never from the criteria: a description of 150 characters
	 * fills a criterion but not its condition.
	 */
	readonly essentials: Gauge
	/** The seven other criteria (names, skills, experiences, courses, languages, gallery) that are filled, out of 7: the bonus. */
	readonly bonus: Gauge
	readonly etat: DisplayedState
	readonly titre: string
	/** What the state changes for her, in French. */
	readonly consequence: string
	/** What she lacks, in the display order of the criteria; the required ones first. */
	readonly manques: readonly Missing[]
	/**
	 * True when she is listed but shows no way to reach her: the search puts her after the others
	 * (ticket 291). The card to fix it is `CONTACT_SECTION`.
	 */
	readonly rankedLast: boolean
	/** The reason the team wrote when hiding her page, trimmed; null when hidden without one or not hidden (ticket 292). */
	readonly reason: string | null
	/**
	 * True when she is listed in principle but set herself unavailable: her page stays online and the
	 * search leaves her out (ticket 292). The button « Reprendre les demandes » goes with it.
	 */
	readonly enPause: boolean
}

/** The card where she adds her contact details (ticket 291). */
export const CONTACT_SECTION: Section = 'coordonnees'

/** What the space says to a listed artist who shows no way to reach her (ticket 291). */
export const RANKED_LAST_TEXT = 'Sans moyen de contact, ton profil passe après les autres dans la recherche.'

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

/** The six conditions of « publiable », in the display order of the criteria. */
const ESSENTIAL_CONDITIONS = [
	'photoPrincipale',
	'villeExploitable',
	'specialite',
	'offreChiffree',
	'descriptionLongue',
	'canalDeContact',
] as const

/** What the gauge says when the six essentials are met. */
export const PAGE_READY_TEXT = 'ta page est prête'

/**
 * « 5/6 indispensables », or « 6/6 : ta page est prête » when her page is publishable (ticket 306).
 * A page the team hid, or an internal account, never says it is ready, whatever the six points.
 */
export function essentialsText({ done, total }: Gauge, publishable: boolean): string {
	return publishable && done === total ? `${done}/${total} : ${PAGE_READY_TEXT}` : `${done}/${total} indispensables`
}

/**
 * The percentage her space says (issues 1072 and 1073): « Ton profil est rempli à N % ». It is the share of the 13 criteria
 * of the single rule that are filled (`pourcentage`), never above 99 while a point that stands between her profile and
 * « publiable » is missing: the 13 criteria and the 6 conditions of a publishable page are not the same (a description can
 * fill its criterion and still be too short), and « 100 % » next to a missing point would be false.
 */
export const gaugePercent = (progress: Pick<Progress, 'pourcentage' | 'manques'>): number =>
	progress.manques.some(point => point.requis) ? Math.min(progress.pourcentage, 99) : progress.pourcentage

/** « Bonus : 2/7 » (ticket 306). */
export const bonusText = ({ done, total }: Gauge): string => `Bonus : ${done}/${total}`

/** True when the card « Ta page est en ligne ! » is shown: her page is publishable, so it is online (ticket 306). */
export const pageIsOnline = (avancement: Pick<Progress, 'etat'>): boolean => avancement.etat === 'publiable'

const MISSING_TEXT: Record<Criterion, string> = {
	nom: 'Ajoute ton prénom et ton nom.',
	specialite: 'Indique ta spécialité.',
	nom_artiste: 'Ajoute ton nom d’artiste.',
	ville: 'Choisis ta commune.',
	description: `Écris ta description : ${DESCRIPTION_MIN} caractères au moins.`,
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

/** The criteria that no condition of « publiable » carries: the bonus. */
const BONUS_CRITERIA = CRITERIA.filter(critere => !(critere in CRITERION_CONDITION))

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

/** The title when the team suspended the page (issue 1005): same effect as hidden, another word. */
const SUSPENDED_TITLE = 'Ta page est suspendue par l’équipe My Makeup : elle n’est plus visible.'

const TITLES: Record<DisplayedState, string> = {
	vide: 'Ton profil est vide',
	incomplet: 'Ton profil n’est pas encore publiable',
	publiable: 'Ton profil est publiable',
	interne: 'Compte interne My Makeup',
	masque: 'Ta page est masquée par l’équipe My Makeup : elle n’est plus visible.',
}

/** What the space says to a makeup artist who set herself unavailable (ticket 292): one sentence. */
export const PAUSE_TEXT = 'Tu es en pause : ta page reste en ligne, mais tu n’apparais pas dans la recherche.'

/** The address to write to about a hidden page (ticket 292). */
export const HIDDEN_CONTACT_EMAIL = PUBLISHER.email

function hiddenText(reason: string | null): string {
	const said = reason === null ? '' : `Motif : ${reason} `
	return `${said}Écris-nous à ${HIDDEN_CONTACT_EMAIL} pour en parler.`
}

const CONSEQUENCES: Record<DisplayedState, string> = {
	vide: 'Un profil entièrement vide n’est pas listé dans la recherche. Dès qu’un des points ci-dessous « pour être publiable » est rempli, il y apparaît.',
	incomplet:
		'Ton profil apparaît dans la recherche, mais Google ne peut pas encore te trouver : remplis les points « pour être publiable » ci-dessous.',
	publiable: 'Ton profil apparaît dans la recherche et Google peut maintenant te trouver.',
	interne: 'Ce compte est celui de l’équipe : son profil n’est jamais publiable, et Google ne le trouve pas.',
	masque: '',
}

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
	const hidden = profil.status === 'hidden'
	const state: DisplayedState = hidden ? 'masque' : stateOf(reading)
	const reason = hidden ? profil.reason?.trim() || null : null
	const paused = (state === 'incomplet' || state === 'publiable') && !isAvailable(profil.available)
	return {
		score: reading.score,
		sur: reading.sur,
		pourcentage: Math.round((reading.score / reading.sur) * 100),
		essentials: {
			done: ESSENTIAL_CONDITIONS.filter(condition => reading.conditions[condition]).length,
			total: ESSENTIAL_CONDITIONS.length,
		},
		bonus: {
			done: BONUS_CRITERIA.filter(critere => !absents.has(critere)).length,
			total: BONUS_CRITERIA.length,
		},
		etat: state,
		titre: hidden && profil.moderationAction === 'suspend' ? SUSPENDED_TITLE : TITLES[state],
		consequence: hidden ? hiddenText(reason) : paused ? PAUSE_TEXT : CONSEQUENCES[state],
		manques: [...missing.filter(m => m.requis), ...missing.filter(m => !m.requis)],
		reason,
		enPause: paused,
		rankedLast:
			(state === 'incomplet' || state === 'publiable') &&
			!reading.conditions.canalDeContact &&
			isAvailable(profil.available),
	}
}
