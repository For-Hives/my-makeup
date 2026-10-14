/**
 * The options of the command of the import (docs/migration/IMPORT.md). A dry run by default: the
 * import writes only when it is told so, with `--reel`.
 */

import { DRAPEAU_CIBLE_DISTANTE } from './cible'
import type { Mode } from './rapport'

export interface ArgumentsDImport {
	mode: Mode
	cibleDistante: boolean
	/** Where to write the report as JSON, besides printing it. */
	rapport?: string
	/** The file of the table of decisions (./decisions.ts). */
	decisions?: string
	/** The file of the kept answers of the referential of the communes (./referentiel.ts). */
	communes?: string
	/** Never ask the referential: every answer must be kept already. */
	horsLigne?: true
	/** Where to write the private list of review of the cities (./communes.ts). */
	revue?: string
}

/** The kept answers of the referential, when the command names no other file: local, never versioned. */
export const FICHIER_DES_COMMUNES_PAR_DEFAUT = '.migration/referentiel-communes.json'

/** The options that take a file, and the field each one fills. */
const AVEC_FICHIER = {
	'--rapport': 'rapport',
	'--decisions': 'decisions',
	'--communes': 'communes',
	'--revue': 'revue',
} as const satisfies Record<string, keyof ArgumentsDImport>

export const USAGE = [
	'Usage : bun scripts/migration/import.ts [--reel] [--cible-distante] [--decisions <fichier.json>] [--rapport <fichier.json>]',
	'                                        [--communes <fichier.json>] [--hors-ligne] [--revue <fichier.json>]',
	'  sans option     à blanc : lit la source et la cible, dit ce qu’il écrirait, n’écrit rien',
	'  --reel          écrit dans la base de DATABASE_URI, puis relit la cible pour prouver la parité',
	`  ${DRAPEAU_CIBLE_DISTANTE} accepte une base qui n’est pas sur ce poste`,
	'  --decisions     la table de décision des cas que l’import ne tranche pas seul (comptes au même email, profils d’un compte écarté ou sans compte)',
	'  --rapport       écrit aussi le rapport en JSON dans ce fichier (nombres, identifiants, empreintes)',
	`  --communes      les réponses gardées du référentiel des communes (par défaut : ${FICHIER_DES_COMMUNES_PAR_DEFAUT})`,
	'  --hors-ligne    ne demande rien au référentiel des communes : chaque réponse doit déjà être gardée',
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
		else if (option === '--hors-ligne') lus.horsLigne = true
		else if (Object.hasOwn(AVEC_FICHIER, option)) {
			const fichier = argumentsDeLaCommande[++rang]
			if (!fichier || fichier.startsWith('--')) return null
			lus[AVEC_FICHIER[option as keyof typeof AVEC_FICHIER]] = fichier
		} else return null
	}
	return lus
}
