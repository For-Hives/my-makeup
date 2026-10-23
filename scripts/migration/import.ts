/**
 * Command line of the import of the old site (docs/migration/IMPORT.md).
 *
 *   bun scripts/migration/import.ts                    dry run: what it would write, nothing written
 *   bun scripts/migration/import.ts --real             writes, then reads the target again (parity)
 *   bun scripts/migration/import.ts --report r.json   also writes the report as JSON
 *   bun scripts/migration/import.ts --decisions d.json the table of decisions (accounts that share an email)
 *   bun scripts/migration/import.ts --review v.json     also writes the private list of the zones to review, as JSON and as a document to read (v.md)
 *   bun scripts/migration/import.ts --check         dry run that says whether the target is the source: exit 4 if not
 *   bun scripts/migration/import.ts --without-photos      no storage of the photos: none is read, none adopted (a rehearsal with no network)
 *   bun scripts/migration/import.ts --consent-date 2026-11-02   the date of the switch: the consent date of the profiles that show a phone or an email today
 *   bun scripts/migration/import.ts --target-in-service  on a target the v3 already uses: the accounts it holds are left as they are (without it, such a target is refused)
 *
 * The cities become communes of the official list (geo.api.gouv.fr). Its answers are kept in a
 * file (`--cities`, by default .migration/cities-reference.json, never versioned): a second
 * run asks nothing again. `--offline` asks nothing at all, and stops on an answer not kept.
 *
 * It reads the Strapi database of STRAPI_SOURCE_URI, read-only, and writes into the database of
 * Payload that DATABASE_URI names, through the Local API. The photos are adopted where they are:
 * their objects are read by requests for headers at the public base of the photos of the
 * application (R2_PUBLIC_URL, or the storage of the bench), never written. A database that is not on this machine
 * is refused unless the command says `--remote-target`, before Payload is even loaded; that flag
 * demands `--expected-database <name>`, and a target whose `current_database()` differs is refused
 * before the first read (ticket 233). The
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
import { DEFAULT_CITIES_FILE, readArguments, renamedOptionHint, USAGE } from './import/arguments'
import { type Decisions, NO_DECISION, readDecisions } from './import/decisions'
import { InterruptedImport, unexpectedErrorMessage } from './import/engine'
import { importer } from './import/importer'
import { cutoverDate } from './import/profiles'
import {
	answersAsText,
	geoApiReference,
	type KeptAnswers,
	type KeptReference,
	keptReference,
	readAnswers,
} from './import/reference'
import { checkAsText, checkExitCode, exitCode, reportAsText } from './import/report'
import { writeReviewFiles } from './import/review'
import { openSourceBun } from './import/source-bun'
import {
	configurationWithoutSchemaChange,
	ImportRefuse,
	verifyExpectedDatabase,
	verifyTarget,
	verifyTargetSchema,
} from './import/target'

/** The table of decisions from its file. The file is not printed: an error says what is wrong in it. */
function readDecisionsFile(fichier: string): Decisions {
	let text: string
	try {
		text = readFileSync(fichier, 'utf8')
	} catch {
		throw new ImportRefuse('La table de décision donnée par --decisions ne se lit pas : rien n’est écrit.')
	}
	return readDecisions(text)
}

/**
 * The kept answers of the referential from their file: none when it does not exist yet, unless the
 * run is offline, which needs them all.
 */
function readAnswersFile(fichier: string, horsLigne: boolean): KeptAnswers {
	if (!existsSync(fichier)) {
		if (horsLigne)
			throw new ImportRefuse(
				'Hors ligne (--offline), le fichier des réponses gardées du référentiel des communes n’existe pas : rien n’est écrit.'
			)
		return new Map()
	}
	try {
		return readAnswers(readFileSync(fichier, 'utf8'))
	} catch (error) {
		if (error instanceof ImportRefuse) throw error
		throw new ImportRefuse('Le fichier des réponses du référentiel des communes ne se lit pas : rien n’est écrit.')
	}
}

/** Keeps the answers received during the run, even when it stopped: the next run asks them no more. */
function keepAnswers(fichier: string, referentiel: KeptReference): void {
	if (referentiel.nouvelles() === 0) return
	mkdirSync(path.dirname(fichier), { recursive: true })
	writeFileSync(fichier, answersAsText(referentiel.reponses), { mode: 0o600 })
}

async function principal(argumentsDeLaCommande: string[]): Promise<number> {
	const options = readArguments(argumentsDeLaCommande)
	if (!options) {
		const hint = renamedOptionHint(argumentsDeLaCommande)
		if (hint) console.error(hint)
		console.error(USAGE)
		return 2
	}
	// Before anything is loaded: the configuration of Payload connects to whatever DATABASE_URI names.
	const target = verifyTarget(process.env.DATABASE_URI, options)
	const sourceAddress = process.env.STRAPI_SOURCE_URI
	if (!sourceAddress)
		throw new ImportRefuse('STRAPI_SOURCE_URI manque : l’import ne sait pas quelle base Strapi lire. Rien n’est écrit.')
	const consentDate = options.consentDate === undefined ? undefined : cutoverDate(options.consentDate)
	if (consentDate === null)
		throw new ImportRefuse(
			'La date de --consent-date n’est pas une date (2026-11-02, ou 2026-11-02T08:00:00Z) : rien n’est écrit.'
		)
	const decisions = options.decisions ? readDecisionsFile(options.decisions) : NO_DECISION
	const citiesFile = options.cities ?? DEFAULT_CITIES_FILE
	const reference = keptReference(
		readAnswersFile(citiesFile, options.offline === true),
		options.offline ? null : geoApiReference()
	)

	const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
	const payload = await getPayload({ config: configurationWithoutSchemaChange(await config) })
	// Named by `--expected-database` (required with `--remote-target`): checked before the first read.
	if (options.expectedDatabase !== undefined) await verifyExpectedDatabase(payload, options.expectedDatabase)
	await verifyTargetSchema(payload)
	// Where the photos are served from, as the application gives their addresses (src/payload.config.ts).
	// `--without-photos`: no storage at all; nothing is asked of any host.
	const mediaBase = options.withoutPhotos ? null : mediaBaseUrl(process.env.R2_PUBLIC_URL, serverEnv().storage)
	// A check without storage cannot conclude on the photos: every file is « sans-stockage », so no
	// media document is expected and the verdict would be a false green. Refused outright.
	if (options.withoutPhotos && options.check)
		throw new ImportRefuse(
			'--without-photos ne va pas avec --check : sans stockage, aucune photo n’est comparée et le contrôle ne pourrait pas conclure sur les médias. Rien n’est écrit ; relance avec le stockage, sans --without-photos.'
		)
	// Without storage, a real pass would drop every photo link of the profiles and leave the media behind.
	if (options.withoutPhotos && options.mode === 'real') {
		const { totalDocs } = await payload.count({ collection: 'media', overrideAccess: true })
		if (totalDocs > 0)
			throw new ImportRefuse(
				'--without-photos ne va pas avec --real sur une cible qui garde déjà des médias : le passage retirerait les photos des profils. Rien n’est écrit ; relance avec le stockage, sans --without-photos.'
			)
	}
	const source = openSourceBun(sourceAddress)
	try {
		const report = await importer({
			payload,
			source,
			mode: options.mode,
			target: target,
			decisions,
			consentDate: consentDate,
			targetInService: options.targetInService === true,
			reference: reference,
			media: mediaBase === null ? undefined : { base: mediaBase },
			// Read by its owner only: what was asked of the referential for each city to review.
			onReview: revue => {
				if (options.review) writeReviewFiles(options.review, revue)
			},
		})
		console.log(reportAsText(report))
		if (options.check) console.log(checkAsText(report))
		// Read by its owner only: it lists identifiers of the old base.
		if (options.report) writeFileSync(options.report, `${JSON.stringify(report, null, '\t')}\n`, { mode: 0o600 })
		return options.check ? checkExitCode(report) : exitCode(report)
	} finally {
		keepAnswers(citiesFile, reference)
		await source.fermer()
	}
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (error) {
	// These messages are written by the import or the application, and name no value.
	if (error instanceof ImportRefuse || error instanceof EnvError) {
		console.error(error.message)
		process.exit(1)
	}
	console.error(error instanceof InterruptedImport ? error.message : unexpectedErrorMessage(error))
	process.exit(6)
}
