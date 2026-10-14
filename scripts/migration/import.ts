/**
 * Command line of the import of the old site (docs/migration/IMPORT.md).
 *
 *   bun scripts/migration/import.ts                    dry run: what it would write, nothing written
 *   bun scripts/migration/import.ts --reel             writes, then reads the target again (parity)
 *   bun scripts/migration/import.ts --rapport r.json   also writes the report as JSON
 *   bun scripts/migration/import.ts --decisions d.json the table of decisions (accounts that share an email)
 *   bun scripts/migration/import.ts --revue v.json     also writes the private list of the cities to review
 *   bun scripts/migration/import.ts --consentement-le 2026-11-02   the date of the switch: the consent date of the profiles that show a phone or an email today
 *
 * The cities become communes of the official list (geo.api.gouv.fr). Its answers are kept in a
 * file (`--communes`, by default .migration/referentiel-communes.json, never versioned): a second
 * run asks nothing again. `--hors-ligne` asks nothing at all, and stops on an answer not kept.
 *
 * It reads the Strapi database of STRAPI_SOURCE_URI, read-only, and writes into the database of
 * Payload that DATABASE_URI names, through the Local API. The photos are adopted where they are:
 * their objects are read by requests for headers at the public base of the photos of the
 * application (R2_PUBLIC_URL, or the storage of the bench), never written. A database that is not on this machine
 * is refused unless the command says `--cible-distante`, before Payload is even loaded. The
 * schema of the target is never changed: a target without the tables of the v3 is refused.
 *
 * Exit codes: 0 done; 1 refused before any write (an environment variable, the target, the table
 * of decisions, the referential of the communes that does not answer); 2 command line not understood; 3 stopped before any write, on cases only a
 * decision settles; 4 the source changed during the run, or the target differs from the source
 * by more than the refused documents; 5 documents refused, listed; 6 stopped by an error of the
 * database or an unexpected one, named by its type and its code only.
 *
 * What it prints, and the JSON report, hold numbers, identifiers of the old base and
 * fingerprints only: no name, no email, no hash. An error is never printed with its message
 * unless the import wrote that message itself: the error of a query carries its values.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { EnvError, mediaBaseUrl, serverEnv } from '../../src/lib/env'
import { FICHIER_DES_COMMUNES_PAR_DEFAUT, lireLesArguments, USAGE } from './import/arguments'
import {
	configurationSansChangementDeSchema,
	ImportRefuse,
	verifierLaCible,
	verifierLeSchemaDeLaCible,
} from './import/cible'
import { AUCUNE_DECISION, type Decisions, lireLesDecisions } from './import/decisions'
import { importer } from './import/importer'
import { ImportInterrompu, messageDUneErreurInattendue } from './import/moteur'
import { dateDeBascule } from './import/profils'
import { codeDeSortie, rapportEnTexte } from './import/rapport'
import {
	lireLesReponses,
	type ReferentielGarde,
	type ReponsesGardees,
	referentielGarde,
	referentielGeoApi,
	reponsesEnTexte,
} from './import/referentiel'
import { ouvrirLaSourceBun } from './import/source-bun'

/** The table of decisions from its file. The file is not printed: an error says what is wrong in it. */
function lireLeFichierDesDecisions(fichier: string): Decisions {
	let texte: string
	try {
		texte = readFileSync(fichier, 'utf8')
	} catch {
		throw new ImportRefuse('La table de décision donnée par --decisions ne se lit pas : rien n’est écrit.')
	}
	return lireLesDecisions(texte)
}

/**
 * The kept answers of the referential from their file: none when it does not exist yet, unless the
 * run is offline, which needs them all.
 */
function lireLeFichierDesReponses(fichier: string, horsLigne: boolean): ReponsesGardees {
	if (!existsSync(fichier)) {
		if (horsLigne)
			throw new ImportRefuse(
				'Hors ligne (--hors-ligne), le fichier des réponses gardées du référentiel des communes n’existe pas : rien n’est écrit.'
			)
		return new Map()
	}
	try {
		return lireLesReponses(readFileSync(fichier, 'utf8'))
	} catch (erreur) {
		if (erreur instanceof ImportRefuse) throw erreur
		throw new ImportRefuse('Le fichier des réponses du référentiel des communes ne se lit pas : rien n’est écrit.')
	}
}

/** Keeps the answers received during the run, even when it stopped: the next run asks them no more. */
function garderLesReponses(fichier: string, referentiel: ReferentielGarde): void {
	if (referentiel.nouvelles() === 0) return
	mkdirSync(path.dirname(fichier), { recursive: true })
	writeFileSync(fichier, reponsesEnTexte(referentiel.reponses), { mode: 0o600 })
}

async function principal(argumentsDeLaCommande: string[]): Promise<number> {
	const options = lireLesArguments(argumentsDeLaCommande)
	if (!options) {
		console.error(USAGE)
		return 2
	}
	// Before anything is loaded: the configuration of Payload connects to whatever DATABASE_URI names.
	const cible = verifierLaCible(process.env.DATABASE_URI, options)
	const adresseDeLaSource = process.env.STRAPI_SOURCE_URI
	if (!adresseDeLaSource)
		throw new ImportRefuse('STRAPI_SOURCE_URI manque : l’import ne sait pas quelle base Strapi lire. Rien n’est écrit.')
	const consentiLe = options.consentiLe === undefined ? undefined : dateDeBascule(options.consentiLe)
	if (consentiLe === null)
		throw new ImportRefuse(
			'La date de --consentement-le n’est pas une date (2026-11-02, ou 2026-11-02T08:00:00Z) : rien n’est écrit.'
		)
	const decisions = options.decisions ? lireLeFichierDesDecisions(options.decisions) : AUCUNE_DECISION
	const fichierDesCommunes = options.communes ?? FICHIER_DES_COMMUNES_PAR_DEFAUT
	const referentiel = referentielGarde(
		lireLeFichierDesReponses(fichierDesCommunes, options.horsLigne === true),
		options.horsLigne ? null : referentielGeoApi()
	)

	const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
	const payload = await getPayload({ config: configurationSansChangementDeSchema(await config) })
	await verifierLeSchemaDeLaCible(payload)
	// Where the photos are served from, as the application gives their addresses (src/payload.config.ts).
	const baseDesMedias = mediaBaseUrl(process.env.R2_PUBLIC_URL, serverEnv().storage)
	const source = ouvrirLaSourceBun(adresseDeLaSource)
	try {
		const rapport = await importer({
			payload,
			source,
			mode: options.mode,
			cible,
			decisions,
			consentiLe,
			referentiel,
			medias: { base: baseDesMedias },
			// Read by its owner only: what was asked of the referential for each city to review.
			surLaRevue: revue => {
				if (options.revue) writeFileSync(options.revue, `${JSON.stringify(revue, null, '\t')}\n`, { mode: 0o600 })
			},
		})
		console.log(rapportEnTexte(rapport))
		// Read by its owner only: it lists identifiers of the old base.
		if (options.rapport) writeFileSync(options.rapport, `${JSON.stringify(rapport, null, '\t')}\n`, { mode: 0o600 })
		return codeDeSortie(rapport)
	} finally {
		garderLesReponses(fichierDesCommunes, referentiel)
		await source.fermer()
	}
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (erreur) {
	// These messages are written by the import or the application, and name no value.
	if (erreur instanceof ImportRefuse || erreur instanceof EnvError) {
		console.error(erreur.message)
		process.exit(1)
	}
	console.error(erreur instanceof ImportInterrompu ? erreur.message : messageDUneErreurInattendue(erreur))
	process.exit(6)
}
