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
}

export const USAGE = [
	'Usage : bun scripts/migration/import.ts [--reel] [--cible-distante] [--decisions <fichier.json>] [--rapport <fichier.json>]',
	'  sans option     à blanc : lit la source et la cible, dit ce qu’il écrirait, n’écrit rien',
	'  --reel          écrit dans la base de DATABASE_URI, puis relit la cible pour prouver la parité',
	`  ${DRAPEAU_CIBLE_DISTANTE} accepte une base qui n’est pas sur ce poste`,
	'  --decisions     la table de décision des cas que l’import ne tranche pas seul (comptes au même email)',
	'  --rapport       écrit aussi le rapport en JSON dans ce fichier (nombres, identifiants, empreintes)',
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
		else if (option === '--rapport' || option === '--decisions') {
			const fichier = argumentsDeLaCommande[++rang]
			if (!fichier || fichier.startsWith('--')) return null
			lus[option === '--rapport' ? 'rapport' : 'decisions'] = fichier
		} else return null
	}
	return lus
}
