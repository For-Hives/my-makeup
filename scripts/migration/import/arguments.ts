/**
 * The options of the command of the import (docs/migration/IMPORT.md). A dry run by default: the
 * import writes only when it is told so, with `--reel`.
 */

import { DRAPEAU_BASE_ATTENDUE, DRAPEAU_CIBLE_DISTANTE, DRAPEAU_CIBLE_EN_SERVICE } from './target'
import type { Mode } from './report'

export interface ArgumentsDImport {
	mode: Mode
	cibleDistante: boolean
	/** Run on a target the v3 already uses: the accounts it holds are left as they are (ticket 227). */
	cibleEnService?: true
	/** Where to write the report as JSON, besides printing it. */
	rapport?: string
	/** The file of the table of decisions (./decisions.ts). */
	decisions?: string
	/** The file of the kept answers of the referential of the communes (./referentiel.ts). */
	communes?: string
	/** Never ask the referential: every answer must be kept already. */
	horsLigne?: true
	/** Give the run no storage of the photos: none is probed, none adopted, each one is listed « sans-stockage ». */
	sansPhotos?: true
	/** Check that the target is the source: a dry run that exits 4 as soon as a real run would write or find a document too many. */
	controle?: true
	/** Where to write the private list of review of the cities (./communes.ts). */
	revue?: string
	/** The date of the switch, as written on the command line: the consent date of the contact details shown today (ticket 064). */
	consentiLe?: string
	/** The name `current_database()` must give on the target (`--base-attendue`). Required with `--cible-distante` (ticket 233, L9). */
	baseAttendue?: string
}

/** The kept answers of the referential, when the command names no other file: local, never versioned. */
export const FICHIER_DES_COMMUNES_PAR_DEFAUT = '.migration/referentiel-communes.json'

/** The options that take a file, and the field each one fills. */
const AVEC_FICHIER = {
	'--rapport': 'rapport',
	'--decisions': 'decisions',
	'--communes': 'communes',
	'--revue': 'revue',
	'--consentement-le': 'consentiLe',
	'--base-attendue': 'baseAttendue',
} as const satisfies Record<string, keyof ArgumentsDImport>

export const USAGE = [
	'Usage : bun scripts/migration/import.ts [--reel] [--cible-distante --base-attendue <nom>] [--cible-en-service] [--decisions <fichier.json>] [--rapport <fichier.json>]',
	'                                        [--communes <fichier.json>] [--hors-ligne] [--revue <fichier.json>]',
	'                                        [--consentement-le <date>] [--sans-photos] [--controle]',
	'  sans option     à blanc : lit la source et la cible, dit ce qu’il écrirait, n’écrit rien',
	'  --reel          écrit dans la base de DATABASE_URI, puis relit la cible pour prouver la parité',
	`  ${DRAPEAU_CIBLE_DISTANTE} accepte une base qui n’est pas sur ce poste ; il exige ${DRAPEAU_BASE_ATTENDUE} <nom>`,
	`  ${DRAPEAU_BASE_ATTENDUE}  le nom que la base de la cible doit donner (current_database()) : le passage est refusé avant toute lecture si elle en porte un autre. Obligatoire avec ${DRAPEAU_CIBLE_DISTANTE}`,
	`  ${DRAPEAU_CIBLE_EN_SERVICE} accepte une cible que la v3 utilise déjà (une connexion y a réussi) : les comptes déjà repris restent tels quels, seuls les manquants sont créés. Sans lui, une telle cible est refusée avant toute écriture`,
	'  --decisions     la table de décision des cas que l’import ne tranche pas seul (comptes au même email, profils d’un compte écarté ou sans compte)',
	'  --rapport       écrit aussi le rapport en JSON dans ce fichier (nombres, identifiants, empreintes)',
	`  --communes      les réponses gardées du référentiel des communes (par défaut : ${FICHIER_DES_COMMUNES_PAR_DEFAUT})`,
	'  --hors-ligne    ne demande rien au référentiel des communes : chaque réponse doit déjà être gardée',
	'  --consentement-le  la date de bascule (2026-11-02, ou avec heure et fuseau) : date du consentement des profils qui affichent déjà leurs coordonnées. Obligatoire dès qu’un profil en affiche',
	'  --sans-photos   ne lit aucun stockage : aucune photo n’est sondée ni adoptée, chacune est listée « sans-stockage » (répétition sans réseau)',
	'  --controle      à blanc, puis dit si la cible est la source : sort en 4 dès qu’un passage réel créerait ou modifierait un document, ou qu’elle en garde un que la source ne donne plus (sans --reel)',
	'  --revue         écrit la liste de revue privée des villes à revoir dans ce fichier',
].join('\n')

/** The options, or `null` when the command line is not understood. */
export function lireLesArguments(argumentsDeLaCommande: readonly string[]): ArgumentsDImport | null {
	const lus: ArgumentsDImport = { mode: 'a-blanc', cibleDistante: false }
	const vus = new Set<string>()
	for (let rang = 0; rang < argumentsDeLaCommande.length; rang++) {
		const option = argumentsDeLaCommande[rang] ?? ''
		if (vus.has(option)) return null
		vus.add(option)
		if (option === '--reel') lus.mode = 'reel'
		else if (option === DRAPEAU_CIBLE_DISTANTE) lus.cibleDistante = true
		else if (option === DRAPEAU_CIBLE_EN_SERVICE) lus.cibleEnService = true
		else if (option === '--hors-ligne') lus.horsLigne = true
		else if (option === '--sans-photos') lus.sansPhotos = true
		else if (option === '--controle') lus.controle = true
		else if (Object.hasOwn(AVEC_FICHIER, option)) {
			const fichier = argumentsDeLaCommande[++rang]
			if (!fichier || fichier.startsWith('--')) return null
			lus[AVEC_FICHIER[option as keyof typeof AVEC_FICHIER]] = fichier
		} else return null
	}
	// A check writes nothing: it is a dry run, and `--reel` would contradict it.
	if (lus.controle && lus.mode === 'reel') return null
	// With the accounts left as they are, a check would not compare them: « the target is the source » would be a false green.
	if (lus.controle && lus.cibleEnService) return null
	return lus
}
