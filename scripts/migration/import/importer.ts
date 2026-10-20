/**
 * One run of the import (docs/migration/IMPORT.md): read the source, compare it with the target,
 * write the difference when the run is real, then read the target again to prove the parity.
 *
 * - The source is read in one read-only snapshot, and fingerprinted before and after the run.
 * - A case only a decision can settle (accounts that share one email, the profile of an account
 *   a decision sets aside, a profile without an account out of the list of the spam) stops the
 *   run before any write, dry or real, and the report lists it by identifiers.
 * - The city of each profile taken becomes a commune of the official list (./communes.ts), asked
 *   to the referential before any write: a referential that does not answer stops the run there.
 * - The files the profiles and the articles taken designate are adopted where they are
 *   (./medias.ts): the storage is read before any write, by requests for headers only, and a
 *   storage that does not answer stops the run there. Nothing is ever written in the storage.
 * - A dry run (the default) reads the target and says what it would write; it writes nothing.
 * - A real run writes collection by collection, in the order of plan 01 §5 (P4): the accounts
 *   first, then the media they own, the profiles with their sections and their photos, the
 *   articles, the talents, and reads every collection again: its parity is complete when the
 *   target holds exactly what the source gives, with the same values.
 */

import type { Payload } from 'payload'
import { markImportInProgress } from '../../../src/lib/import-context'
import {
	ACCOUNTS_ADAPTER,
	ACCOUNTS_IN_SERVICE_ADAPTER,
	accountDistribution,
	expectedAccounts,
	readAccounts,
} from './accounts'
import { ARTICLES_ADAPTER, expectedArticles, readArticles, splitArticles } from './articles'
import { type CaseToReview, profileCities } from './cities'
import { deletedAccountsInV3, refuseTargetInService, withoutDeletedAccounts } from './cutover-guard'
import { type Decisions, NO_DECISION } from './decisions'
import {
	type Adapter,
	type Expected,
	parity,
	planActions,
	planSummary,
	type Refusal,
	readTarget,
	write,
} from './engine'
import { REFERENCES } from './gaps'
import {
	classifyFiles,
	expectedMedia,
	filesSummary,
	httpProbe,
	MEDIA_ADAPTER,
	type Presence,
	type Probe,
	probeObjects,
	readFiles,
} from './media'
import {
	emptyToSource,
	expectedProfiles,
	keptConsents,
	PROFILES_ADAPTER,
	PROFILES_IN_SERVICE_ADAPTER,
	readProfiles,
	shownToSource,
	skippedProfiles,
} from './profiles'
import type { Reference } from './reference'
import type { CollectionParity, CollectionSummary, Mode, Report } from './report'
import { type Source, sameTables, tablesFingerprint } from './source'
import { expectedTalents, readTalents, TALENTS_ADAPTER } from './talents'
import { ImportRefuse, type TargetKind } from './target'

export interface OptionsDImport {
	payload: Payload
	source: Source
	mode: Mode
	cible: TargetKind
	/** The table of decisions (./decisions.ts). None: every case to decide stops the run. */
	decisions?: Decisions
	/** The official list of the communes (./referentiel.ts): the referential, or its kept answers. */
	referentiel: Reference
	/**
	 * Receives the private list of review: the profiles whose city is « à revoir », with what was
	 * asked and the communes they could be. The command writes it where `--revue` says.
	 */
	surLaRevue?: (revue: CaseToReview[]) => void
	/**
	 * The date of the switch, an ISO string (`dateDeBascule`, ./profils.ts): the date of the consent of
	 * the profiles that show a phone or an email on the old site (ticket 064). Required as soon as
	 * one profile taken does; the run stops before any write without it.
	 */
	consentiLe?: string
	/**
	 * Run on a target the v3 already uses (`--cible-en-service`, ./garde-bascule.ts): without it, such a
	 * target is refused before any write; with it, the accounts the target holds are left as they are.
	 */
	cibleEnService?: boolean
	/**
	 * The day the run is made, for the bound of the date a course was obtained (a year ahead at most,
	 * as the server reads it with its own clock). The clock by default; a test gives a fixed day.
	 */
	maintenant?: Date
	/** The password of a new account; random by default. Given by a test only. */
	tirerMotDePasse?: () => string
	/**
	 * The storage of the photos (./medias.ts): the public base of the photos (`mediaBaseUrl`,
	 * src/lib/env.ts), and how the headers of an object are read (`HEAD` by default). None: the run
	 * has no storage, and no file is adopted.
	 */
	medias?: MediaOptions
}

export interface MediaOptions {
	base: string
	sonder?: Probe
}

/** Counts the transformations of the expected documents, by reference. */
function countGaps(ecarts: Record<string, number>, attendus: readonly Expected[]): void {
	for (const { ecarts: documentGaps } of attendus)
		for (const { reference } of documentGaps) ecarts[reference] = (ecarts[reference] ?? 0) + 1
}

/**
 * The collections whose documents are all the import's: one that holds no `strapiId` was added by hand.
 * Media is left out on purpose: a photo uploaded in the v3 legitimately has none (IMPORT.md).
 */
const COLLECTIONS_WITHOUT_ORIGIN = new Set<string>(['pros', 'profiles', 'articles', 'talents'])

/** Plans one collection, writes it when the run is real, and gives what it did or would do. */
async function importerCollection(
	{ payload, mode }: OptionsDImport,
	adaptateur: Adapter,
	source: number,
	attendus: readonly Expected[],
	refuses: readonly Refusal[] = []
): Promise<CollectionSummary> {
	const plan = planActions(adaptateur, attendus, await readTarget(payload, adaptateur))
	const summary = mode === 'reel' ? await write(payload, adaptateur, plan) : planSummary(plan)
	// A document added by hand holds no `strapiId`: the plan never sees it, the check must count it.
	const withoutOrigin = COLLECTIONS_WITHOUT_ORIGIN.has(adaptateur.collection)
		? (
				await payload.count({
					collection: adaptateur.collection,
					where: { strapiId: { exists: false } },
					overrideAccess: true,
				})
			).totalDocs
		: 0
	return {
		...summary,
		refuses: [...refuses, ...summary.refuses],
		source,
		enTrop: plan.enTrop,
		sansOrigine: withoutOrigin,
	}
}

/** The parity of a collection: the expected documents, and those refused before or while writing, counted apart. */
async function parityOf(
	payload: Payload,
	adaptateur: Adapter,
	attendus: readonly Expected[],
	bilan: CollectionSummary
): Promise<{ parite: CollectionParity; cible: Awaited<ReturnType<typeof readTarget>> }> {
	const target = await readTarget(payload, adaptateur)
	return { parite: parity(adaptateur, attendus, target, bilan.refuses), cible: target }
}

/**
 * The identifier in Payload of each document the run takes in a collection, by its `strapiId`:
 * `null` for a document still to be created, in a dry run. A document Payload refused while
 * writing is left out: nothing may point at it.
 */
async function idsInTarget(
	payload: Payload,
	adaptateur: Adapter,
	attendus: readonly Expected[],
	refuses: readonly Refusal[] = []
): Promise<Map<number, number | null>> {
	const existing = new Map(
		(await readTarget(payload, adaptateur)).map(({ id, valeurs: values }) => [Number(values.strapiId), id])
	)
	const refusedByPayload = new Set(refuses.map(({ strapiId }) => strapiId))
	return new Map(
		attendus
			.filter(({ strapiId }) => !refusedByPayload.has(strapiId))
			.map(({ strapiId }) => [strapiId, existing.get(strapiId) ?? null])
	)
}

/** How many documents of the target per status. */
function statusesOf(documents: readonly { valeurs: Readonly<Record<string, unknown>> }[]): Record<string, number> {
	const statuses: Record<string, number> = {}
	for (const { valeurs: values } of documents)
		statuses[String(values.status)] = (statuses[String(values.status)] ?? 0) + 1
	return statuses
}

export async function importer(options: OptionsDImport): Promise<Report> {
	// The daily purges of the application wait while an import runs in this process (ticket 162).
	const importEnd = markImportInProgress()
	try {
		return await runImport(options)
	} finally {
		importEnd()
	}
}

async function runImport(options: OptionsDImport): Promise<Report> {
	const {
		payload,
		source,
		mode,
		cible: target,
		decisions = NO_DECISION,
		referentiel: cityReference,
		surLaRevue: onReview,
		tirerMotDePasse: drawPassword,
		medias: mediaDocs,
		consentiLe: consentDate = null,
		maintenant: now = new Date(),
		cibleEnService: targetInService = false,
	} = options
	const accountsAdapter = targetInService ? ACCOUNTS_IN_SERVICE_ADAPTER : ACCOUNTS_ADAPTER
	const before = await source.lire(requete => tablesFingerprint(requete))
	const rawRead = await source.lire(async requete => ({
		comptes: await readAccounts(requete),
		fichiers: await readFiles(requete),
		profils: await readProfiles(requete),
		articles: await readArticles(requete),
		talents: await readTalents(requete),
	}))

	// An account deleted in the v3 is gone for good: on a target in service the run neither takes it nor its profile.
	const deleted = await deletedAccountsInV3(payload)
	const read = targetInService ? withoutDeletedAccounts(rawRead, deleted) : rawRead
	const profilesAdapter = targetInService ? PROFILES_IN_SERVICE_ADAPTER : PROFILES_ADAPTER

	const report: Report = {
		mode,
		cible: target,
		arret: null,
		source: { avant: before, apres: before, inchangee: true },
		collections: {},
		ecarts: {},
		decisionsSansObjet: 0,
		parite: null,
	}

	const accounts = expectedAccounts(read.comptes, decisions, drawPassword)
	const skipped = skippedProfiles(read.profils, {
		comptesDeLaSource: new Set(read.comptes.map(({ id }) => id)),
		comptesEcartes: accounts.ecartes,
		profilsEcartes: decisions.profilsEcartes,
	})
	// Before any write, dry or real: a target the v3 already uses would get the old hash and email back.
	if (!targetInService)
		await refuseTargetInService(
			payload,
			accounts.attendus,
			rawRead.comptes.map(({ id }) => id)
		)
	report.decisionsSansObjet = accounts.sansObjet + skipped.sansObjet
	if (accounts.sansDecision.length > 0 || skipped.deComptesEcartes.length > 0 || skipped.sansCompte.length > 0) {
		report.arret = {
			emailsPartages: accounts.sansDecision,
			profilsDeComptesEcartes: skipped.deComptesEcartes,
			profilsSansCompte: skipped.sansCompte,
		}
		report.collections.pros = {
			...planSummary({ actions: [], enTrop: [] }),
			source: read.comptes.length,
			enTrop: [],
		}
	} else {
		const talents = expectedTalents(read.talents)
		const articles = splitArticles(read.articles)
		for (const { attendus: expected } of [accounts, talents]) countGaps(report.ecarts, expected)
		// This line of the register counts the accounts set aside, not the kept accounts that took a hash.
		if (accounts.ecartes.length > 0) report.ecarts[REFERENCES.comptesEmailPartage] = accounts.ecartes.length

		// Before any write: the referential may not answer, or a line of the table name an unknown commune.
		const notTaken = new Set<number>([...skipped.ecartes, ...skipped.spam])
		// Before any write: the consent of a profile that shows contact details needs its date.
		if (consentDate === null && read.profils.some(profil => !notTaken.has(profil.id) && shownToSource(profil)))
			throw new ImportRefuse(
				'Des profils affichent un téléphone ou un email sur l’ancien site : la date de bascule manque (--consentement-le). Rien n’est écrit.'
			)
		const cities = await profileCities(
			read.profils
				.filter(({ id }) => !notTaken.has(id))
				.map(profil => ({ id: profil.id, city: profil.city, videALaSource: emptyToSource(profil) })),
			cityReference,
			decisions.communes
		)
		report.decisionsSansObjet += cities.sansObjet
		onReview?.(cities.revue)

		// Before any write: which files are adopted, and what the storage holds of their objects, read
		// by requests for headers only. A storage that does not answer stops the run here.
		const takenProfiles = new Map(
			read.profils.flatMap(({ id, compte }) => (notTaken.has(id) || compte === null ? [] : [[id, compte] as const]))
		)
		const classification = classifyFiles(
			read.fichiers,
			{
				profils: takenProfiles,
				articles: new Set(articles.pris.map(({ id }) => id)),
				profilsDeLaSource: new Set(rawRead.profils.map(({ id }) => id)),
				articlesDeLaSource: new Set(read.articles.map(({ id }) => id)),
			},
			mediaDocs?.base ?? null
		)
		const presences: Map<number, Presence> = mediaDocs
			? await probeObjects(classification.adoptables, mediaDocs.base, mediaDocs.sonder ?? httpProbe)
			: new Map()
		const nonImages = classification.nonAdoptes.filter(({ motif }) => motif === 'pas-une-image').length
		if (nonImages > 0) report.ecarts[REFERENCES.fichiersNonImages] = nonImages

		report.collections.pros = {
			...(await importerCollection(options, accountsAdapter, read.comptes.length, accounts.attendus)),
			ecartes: accounts.ecartes,
			hashRattaches: accounts.hashRattaches,
			hashNonRattaches: accounts.hashNonRattaches,
			nonConfirmes: accounts.nonConfirmes,
			repartition: accountDistribution(accounts.attendus),
			supprimesDansLaV3: targetInService
				? [...deleted].filter(id => rawRead.comptes.some(c => c.id === id)).sort((a, b) => a - b)
				: [],
		}

		// Each profile, and each media of a profile, points at its account in Payload, read once the
		// accounts are written.
		const accountIds = await idsInTarget(payload, accountsAdapter, accounts.attendus)
		// A file whose account Payload refused is not adopted: written without an owner, it would pass
		// for a newsroom photo. It is listed, and the next run takes it once the account exists.
		const refusedAccounts = new Set(report.collections.pros.refuses.map(({ strapiId }) => strapiId))
		const adoptable = classification.adoptables.filter(({ fichier, compte }) => {
			const refuse = compte !== null && refusedAccounts.has(compte)
			if (refuse) classification.nonAdoptes.push({ fichier: fichier.id, motif: 'compte-refuse' })
			return !refuse
		})
		const allMedia = expectedMedia(adoptable, presences, accountIds)
		countGaps(report.ecarts, allMedia)
		report.collections.media = {
			...(await importerCollection(
				options,
				MEDIA_ADAPTER,
				read.fichiers.fichiers.length,
				allMedia,
				classification.refuses
			)),
			fichiers: filesSummary(classification, presences, mediaDocs === undefined),
		}

		// Each photo points at its media in Payload, read once the media are written.
		const mediaIds = await idsInTarget(payload, MEDIA_ADAPTER, allMedia, report.collections.media.refuses)
		const profiles = expectedProfiles(read.profils, accountIds, skipped, cities.communes, mediaIds, consentDate, now)
		if (skipped.spam.length > 0) report.ecarts[REFERENCES.profilsDuSpam] = skipped.spam.length
		const consents = targetInService ? [] : keptConsents(profiles.attendus, await readTarget(payload, PROFILES_ADAPTER))
		const profilesSummary = await importerCollection(options, profilesAdapter, read.profils.length, profiles.attendus)
		// Only the profiles the target holds are counted: a refused one carries no difference.
		countGaps(
			report.ecarts,
			profiles.attendus.filter(({ strapiId }) => !profilesSummary.refuses.some(refus => refus.strapiId === strapiId))
		)
		report.collections.profiles = {
			...profilesSummary,
			ecartes: skipped.ecartes,
			spam: skipped.spam,
			statuts: profiles.statuts,
			statutsDifferentsDeLaSource: profiles.statutsDifferentsDeLaSource,
			communes: cities.bilan,
			photosNonReprises: profiles.photosNonReprises,
			liensSansLigne: profiles.liensSansLigne,
			prix: profiles.prix,
			coordonneesARevoir: profiles.coordonneesARevoir,
			consentementsGardes: consents,
			rayonsARevoir: profiles.rayonsARevoir,
			lignesLaissees: profiles.lignesLaissees,
		}

		const allArticles = expectedArticles(articles.pris, read.fichiers.liens, mediaIds)
		report.collections.articles = {
			...(await importerCollection(
				options,
				ARTICLES_ADAPTER,
				read.articles.length,
				allArticles.attendus,
				articles.refuses
			)),
			photosNonReprises: allArticles.photosNonReprises,
		}

		report.collections.talents = await importerCollection(
			options,
			TALENTS_ADAPTER,
			read.talents.length,
			talents.attendus,
			talents.refuses
		)

		if (mode === 'reel') {
			const pros = await parityOf(payload, accountsAdapter, accounts.attendus, report.collections.pros)
			const allProfiles = await parityOf(payload, profilesAdapter, profiles.attendus, report.collections.profiles)
			report.parite = {
				pros: { ...pros.parite, repartition: accountDistribution(pros.cible) },
				media: (await parityOf(payload, MEDIA_ADAPTER, allMedia, report.collections.media)).parite,
				profiles: { ...allProfiles.parite, statuts: statusesOf(allProfiles.cible) },
				articles: (await parityOf(payload, ARTICLES_ADAPTER, allArticles.attendus, report.collections.articles)).parite,
				talents: (await parityOf(payload, TALENTS_ADAPTER, talents.attendus, report.collections.talents)).parite,
			}
		}
	}

	const after = await source.lire(requete => tablesFingerprint(requete))
	report.source = { avant: before, apres: after, inchangee: sameTables(before, after) }
	return report
}
