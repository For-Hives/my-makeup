/**
 * The options of the command of the import (docs/migration/IMPORT.md). A dry run by default: the
 * import writes only when it is told so, with `--real`.
 */

import type { Mode } from './report'
import { EXPECTED_DATABASE_FLAG, REMOTE_TARGET_FLAG, TARGET_IN_SERVICE_FLAG } from './target'

export interface ImportArguments {
	mode: Mode
	remoteTarget: boolean
	/** Run on a target the v3 already uses: the accounts it holds are left as they are (ticket 227). */
	targetInService?: true
	/** Where to write the report as JSON, besides printing it. */
	report?: string
	/** The file of the table of decisions (./decisions.ts). */
	decisions?: string
	/** The file of the kept answers of the referential of the communes (./reference.ts). */
	cities?: string
	/** Never ask the referential: every answer must be kept already. */
	offline?: true
	/** Give the run no storage of the photos: none is probed, none adopted, each one is listed « sans-stockage ». */
	withoutPhotos?: true
	/** Check that the target is the source: a dry run that exits 4 as soon as a real run would write or find a document too many. */
	check?: true
	/** Where to write the private list of review of the cities (./cities.ts). */
	review?: string
	/** The date of the switch, as written on the command line: the consent date of the contact details shown today (ticket 064). */
	consentDate?: string
	/** The name `current_database()` must give on the target (`--expected-database`). Required with `--remote-target` (ticket 233, L9). */
	expectedDatabase?: string
}

/** The kept answers of the referential, when the command names no other file: local, never versioned. */
export const DEFAULT_CITIES_FILE = '.migration/cities-reference.json'

/** The options that take a file, and the field each one fills. */
const WITH_FILE = {
	'--report': 'report',
	'--decisions': 'decisions',
	'--cities': 'cities',
	'--review': 'review',
	'--consent-date': 'consentDate',
	'--expected-database': 'expectedDatabase',
} as const satisfies Record<string, keyof ImportArguments>

export const USAGE = [
	'Usage : bun scripts/migration/import.ts [--real] [--remote-target --expected-database <nom>] [--target-in-service] [--decisions <fichier.json>] [--report <fichier.json>]',
	'                                        [--cities <fichier.json>] [--offline] [--review <fichier.json>]',
	'                                        [--consent-date <date>] [--without-photos] [--check]',
	'  sans option     à blanc : lit la source et la cible, dit ce qu’il écrirait, n’écrit rien',
	'  --real          écrit dans la base de DATABASE_URI, puis relit la cible pour prouver la parité',
	`  ${REMOTE_TARGET_FLAG} accepte une base qui n’est pas sur ce poste ; il exige ${EXPECTED_DATABASE_FLAG} <nom>`,
	`  ${EXPECTED_DATABASE_FLAG}  le nom que la base de la cible doit donner (current_database()) : le passage est refusé avant toute lecture si elle en porte un autre. Obligatoire avec ${REMOTE_TARGET_FLAG}`,
	`  ${TARGET_IN_SERVICE_FLAG} accepte une cible que la v3 utilise déjà (une connexion y a réussi) : les comptes déjà repris restent tels quels, seuls les manquants sont créés. Sans lui, une telle cible est refusée avant toute écriture`,
	'  --decisions     la table de décision des cas que l’import ne tranche pas seul (comptes au même email, profils d’un compte écarté ou sans compte)',
	'  --report       écrit aussi le rapport en JSON dans ce fichier (nombres, identifiants, empreintes)',
	`  --cities      les réponses gardées du référentiel des communes (par défaut : ${DEFAULT_CITIES_FILE})`,
	'  --offline    ne demande rien au référentiel des communes : chaque réponse doit déjà être gardée',
	'  --consent-date  la date de bascule (2026-11-02, ou avec heure et fuseau) : date du consentement des profils qui affichent déjà leurs coordonnées. Obligatoire dès qu’un profil en affiche',
	'  --without-photos   ne lit aucun stockage : aucune photo n’est sondée ni adoptée, chacune est listée « sans-stockage » (répétition sans réseau)',
	'  --check      à blanc, puis dit si la cible est la source : sort en 4 dès qu’un passage réel créerait ou modifierait un document, ou qu’elle en garde un que la source ne donne plus (sans --real)',
	'  --review         écrit la liste de revue privée des villes à revoir dans ce fichier',
].join('\n')

/** The options of the import that were renamed (ticket 244): old name and new name, without the dashes. */
const RENAMED_OPTIONS: readonly (readonly [string, string])[] = [
	['reel', 'real'],
	['cible-distante', 'remote-target'],
	['base-attendue', 'expected-database'],
	['cible-en-service', 'target-in-service'],
	['consentement-le', 'consent-date'],
	['rapport', 'report'],
	['controle', 'check'],
	['hors-ligne', 'offline'],
	['sans-photos', 'without-photos'],
	['communes', 'cities'],
	['revue', 'review'],
]

/** What to tell when the command line holds an old name of an option, or `null`. */
export function renamedOptionHint(argumentsDeLaCommande: readonly string[]): string | null {
	const found = RENAMED_OPTIONS.filter(([old]) => argumentsDeLaCommande.includes(`--${old}`))
	if (found.length === 0) return null
	return found.map(([old, current]) => `--${old} s’appelle maintenant --${current}.`).join('\n')
}

/** The options, or `null` when the command line is not understood. */
export function readArguments(argumentsDeLaCommande: readonly string[]): ImportArguments | null {
	const read: ImportArguments = { mode: 'dry-run', remoteTarget: false }
	const seen = new Set<string>()
	for (let position = 0; position < argumentsDeLaCommande.length; position++) {
		const option = argumentsDeLaCommande[position] ?? ''
		if (seen.has(option)) return null
		seen.add(option)
		if (option === '--real') read.mode = 'real'
		else if (option === REMOTE_TARGET_FLAG) read.remoteTarget = true
		else if (option === TARGET_IN_SERVICE_FLAG) read.targetInService = true
		else if (option === '--offline') read.offline = true
		else if (option === '--without-photos') read.withoutPhotos = true
		else if (option === '--check') read.check = true
		else if (Object.hasOwn(WITH_FILE, option)) {
			const file = argumentsDeLaCommande[++position]
			if (!file || file.startsWith('--')) return null
			// The readable review takes the name of the list with `.md`: a list named `.md` would be overwritten by it.
			if (option === '--review' && file.toLowerCase().endsWith('.md')) return null
			read[WITH_FILE[option as keyof typeof WITH_FILE]] = file
		} else return null
	}
	// A check writes nothing: it is a dry run, and `--real` would contradict it.
	if (read.check && read.mode === 'real') return null
	// With the accounts left as they are, a check would not compare them: « the target is the source » would be a false green.
	if (read.check && read.targetInService) return null
	return read
}
