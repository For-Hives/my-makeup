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
import { marquerUnImportEnCours } from '../../../src/lib/contexte-import'
import { ADAPTATEUR_ARTICLES, articlesAttendus, articlesRepartis, lireLesArticles } from './articles'
import { type GenreDeCible, ImportRefuse } from './cible'
import { type CasARevoir, communesDesProfils } from './communes'
import { ADAPTATEUR_COMPTES, comptesAttendus, lireLesComptes, repartitionDesComptes } from './comptes'
import { AUCUNE_DECISION, type Decisions } from './decisions'
import { REFERENCES } from './ecarts'
import {
	ADAPTATEUR_MEDIAS,
	bilanDesFichiers,
	classerLesFichiers,
	lireLesFichiers,
	mediasAttendus,
	type Presence,
	type Sonde,
	sondeHttp,
	sonderLesObjets,
} from './medias'
import {
	type Adaptateur,
	type Attendu,
	bilanDuPlan,
	ecrire,
	lireLaCible,
	parite,
	planifier,
	type Refus,
} from './moteur'
import {
	ADAPTATEUR_PROFILS,
	affichesALaSource,
	lireLesProfils,
	profilsAttendus,
	profilsLaisses,
	videALaSource,
} from './profils'
import type { BilanDeCollection, Mode, PariteDeCollection, Rapport } from './rapport'
import type { Referentiel } from './referentiel'
import { empreinteDesTables, memesTables, type Source } from './source'
import { ADAPTATEUR_TALENTS, lireLesTalents, talentsAttendus } from './talents'

export interface OptionsDImport {
	payload: Payload
	source: Source
	mode: Mode
	cible: GenreDeCible
	/** The table of decisions (./decisions.ts). None: every case to decide stops the run. */
	decisions?: Decisions
	/** The official list of the communes (./referentiel.ts): the referential, or its kept answers. */
	referentiel: Referentiel
	/**
	 * Receives the private list of review: the profiles whose city is « à revoir », with what was
	 * asked and the communes they could be. The command writes it where `--revue` says.
	 */
	surLaRevue?: (revue: CasARevoir[]) => void
	/**
	 * The date of the switch, an ISO string (`dateDeBascule`, ./profils.ts): the date of the consent of
	 * the profiles that show a phone or an email on the old site (ticket 064). Required as soon as
	 * one profile taken does; the run stops before any write without it.
	 */
	consentiLe?: string
	/** The password of a new account; random by default. Given by a test only. */
	tirerMotDePasse?: () => string
	/**
	 * The storage of the photos (./medias.ts): the public base of the photos (`mediaBaseUrl`,
	 * src/lib/env.ts), and how the headers of an object are read (`HEAD` by default). None: the run
	 * has no storage (the pre-production), and no file is adopted.
	 */
	medias?: OptionsDesMedias
}

export interface OptionsDesMedias {
	base: string
	sonder?: Sonde
}

/** Counts the transformations of the expected documents, by reference. */
function compterLesEcarts(ecarts: Record<string, number>, attendus: readonly Attendu[]): void {
	for (const { ecarts: duDocument } of attendus)
		for (const { reference } of duDocument) ecarts[reference] = (ecarts[reference] ?? 0) + 1
}

/**
 * The collections whose documents are all the import's: one that holds no `strapiId` was added by hand.
 * Media is left out on purpose: a photo uploaded in the v3 legitimately has none (IMPORT.md).
 */
const COLLECTIONS_SANS_ORIGINE = new Set<string>(['pros', 'profils', 'articles', 'talents'])

/** Plans one collection, writes it when the run is real, and gives what it did or would do. */
async function importerLaCollection(
	{ payload, mode }: OptionsDImport,
	adaptateur: Adaptateur,
	source: number,
	attendus: readonly Attendu[],
	refuses: readonly Refus[] = []
): Promise<BilanDeCollection> {
	const plan = planifier(adaptateur, attendus, await lireLaCible(payload, adaptateur))
	const bilan = mode === 'reel' ? await ecrire(payload, adaptateur, plan) : bilanDuPlan(plan)
	// A document added by hand holds no `strapiId`: the plan never sees it, the check must count it.
	const sansOrigine = COLLECTIONS_SANS_ORIGINE.has(adaptateur.collection)
		? (
				await payload.count({
					collection: adaptateur.collection,
					where: { strapiId: { exists: false } },
					overrideAccess: true,
				})
			).totalDocs
		: 0
	return { ...bilan, refuses: [...refuses, ...bilan.refuses], source, enTrop: plan.enTrop, sansOrigine }
}

/** The parity of a collection: the expected documents, and those refused before or while writing, counted apart. */
async function pariteDe(
	payload: Payload,
	adaptateur: Adaptateur,
	attendus: readonly Attendu[],
	bilan: BilanDeCollection
): Promise<{ parite: PariteDeCollection; cible: Awaited<ReturnType<typeof lireLaCible>> }> {
	const cible = await lireLaCible(payload, adaptateur)
	return { parite: parite(adaptateur, attendus, cible, bilan.refuses), cible }
}

/**
 * The identifier in Payload of each document the run takes in a collection, by its `strapiId`:
 * `null` for a document still to be created, in a dry run. A document Payload refused while
 * writing is left out: nothing may point at it.
 */
async function idsDansLaCible(
	payload: Payload,
	adaptateur: Adaptateur,
	attendus: readonly Attendu[],
	refuses: readonly Refus[] = []
): Promise<Map<number, number | null>> {
	const existants = new Map(
		(await lireLaCible(payload, adaptateur)).map(({ id, valeurs }) => [Number(valeurs.strapiId), id])
	)
	const refusesParPayload = new Set(refuses.map(({ strapiId }) => strapiId))
	return new Map(
		attendus
			.filter(({ strapiId }) => !refusesParPayload.has(strapiId))
			.map(({ strapiId }) => [strapiId, existants.get(strapiId) ?? null])
	)
}

/** How many documents of the target per status. */
function statutsDe(documents: readonly { valeurs: Readonly<Record<string, unknown>> }[]): Record<string, number> {
	const statuts: Record<string, number> = {}
	for (const { valeurs } of documents) statuts[String(valeurs.statut)] = (statuts[String(valeurs.statut)] ?? 0) + 1
	return statuts
}

export async function importer(options: OptionsDImport): Promise<Rapport> {
	// The daily purges of the application wait while an import runs in this process (ticket 162).
	const finDeLImport = marquerUnImportEnCours()
	try {
		return await passerLImport(options)
	} finally {
		finDeLImport()
	}
}

async function passerLImport(options: OptionsDImport): Promise<Rapport> {
	const {
		payload,
		source,
		mode,
		cible,
		decisions = AUCUNE_DECISION,
		referentiel,
		surLaRevue,
		tirerMotDePasse,
		medias,
		consentiLe = null,
	} = options
	const avant = await source.lire(requete => empreinteDesTables(requete))
	const lu = await source.lire(async requete => ({
		comptes: await lireLesComptes(requete),
		fichiers: await lireLesFichiers(requete),
		profils: await lireLesProfils(requete),
		articles: await lireLesArticles(requete),
		talents: await lireLesTalents(requete),
	}))

	const rapport: Rapport = {
		mode,
		cible,
		arret: null,
		source: { avant, apres: avant, inchangee: true },
		collections: {},
		ecarts: {},
		decisionsSansObjet: 0,
		parite: null,
	}

	const comptes = comptesAttendus(lu.comptes, decisions, tirerMotDePasse)
	const laisses = profilsLaisses(lu.profils, {
		comptesDeLaSource: new Set(lu.comptes.map(({ id }) => id)),
		comptesEcartes: comptes.ecartes,
		profilsEcartes: decisions.profilsEcartes,
	})
	rapport.decisionsSansObjet = comptes.sansObjet + laisses.sansObjet
	if (comptes.sansDecision.length > 0 || laisses.deComptesEcartes.length > 0 || laisses.sansCompte.length > 0) {
		rapport.arret = {
			emailsPartages: comptes.sansDecision,
			profilsDeComptesEcartes: laisses.deComptesEcartes,
			profilsSansCompte: laisses.sansCompte,
		}
		rapport.collections.pros = {
			...bilanDuPlan({ actions: [], enTrop: [] }),
			source: lu.comptes.length,
			enTrop: [],
		}
	} else {
		const talents = talentsAttendus(lu.talents)
		const articles = articlesRepartis(lu.articles)
		for (const { attendus } of [comptes, talents]) compterLesEcarts(rapport.ecarts, attendus)
		// This line of the register counts the accounts set aside, not the kept accounts that took a hash.
		if (comptes.ecartes.length > 0) rapport.ecarts[REFERENCES.comptesEmailPartage] = comptes.ecartes.length

		// Before any write: the referential may not answer, or a line of the table name an unknown commune.
		const nonPris = new Set<number>([...laisses.ecartes, ...laisses.spam])
		// Before any write: the consent of a profile that shows contact details needs its date.
		if (consentiLe === null && lu.profils.some(profil => !nonPris.has(profil.id) && affichesALaSource(profil)))
			throw new ImportRefuse(
				'Des profils affichent un téléphone ou un email sur l’ancien site : la date de bascule manque (--consentement-le). Rien n’est écrit.'
			)
		const communes = await communesDesProfils(
			lu.profils
				.filter(({ id }) => !nonPris.has(id))
				.map(profil => ({ id: profil.id, city: profil.city, videALaSource: videALaSource(profil) })),
			referentiel,
			decisions.communes
		)
		rapport.decisionsSansObjet += communes.sansObjet
		surLaRevue?.(communes.revue)

		// Before any write: which files are adopted, and what the storage holds of their objects, read
		// by requests for headers only. A storage that does not answer stops the run here.
		const profilsPris = new Map(
			lu.profils.flatMap(({ id, compte }) => (nonPris.has(id) || compte === null ? [] : [[id, compte] as const]))
		)
		const classement = classerLesFichiers(
			lu.fichiers,
			{
				profils: profilsPris,
				articles: new Set(articles.pris.map(({ id }) => id)),
				profilsDeLaSource: new Set(lu.profils.map(({ id }) => id)),
				articlesDeLaSource: new Set(lu.articles.map(({ id }) => id)),
			},
			medias?.base ?? null
		)
		const presences: Map<number, Presence> = medias
			? await sonderLesObjets(classement.adoptables, medias.base, medias.sonder ?? sondeHttp)
			: new Map()
		const nonImages = classement.nonAdoptes.filter(({ motif }) => motif === 'pas-une-image').length
		if (nonImages > 0) rapport.ecarts[REFERENCES.fichiersNonImages] = nonImages

		rapport.collections.pros = {
			...(await importerLaCollection(options, ADAPTATEUR_COMPTES, lu.comptes.length, comptes.attendus)),
			ecartes: comptes.ecartes,
			hashRattaches: comptes.hashRattaches,
			hashNonRattaches: comptes.hashNonRattaches,
			nonConfirmes: comptes.nonConfirmes,
			repartition: repartitionDesComptes(comptes.attendus),
		}

		// Each profile, and each media of a profile, points at its account in Payload, read once the
		// accounts are written.
		const idsDesComptes = await idsDansLaCible(payload, ADAPTATEUR_COMPTES, comptes.attendus)
		// A file whose account Payload refused is not adopted: written without an owner, it would pass
		// for a newsroom photo. It is listed, and the next run takes it once the account exists.
		const comptesRefuses = new Set(rapport.collections.pros.refuses.map(({ strapiId }) => strapiId))
		const adoptables = classement.adoptables.filter(({ fichier, compte }) => {
			const refuse = compte !== null && comptesRefuses.has(compte)
			if (refuse) classement.nonAdoptes.push({ fichier: fichier.id, motif: 'compte-refuse' })
			return !refuse
		})
		const lesMedias = mediasAttendus(adoptables, presences, idsDesComptes)
		compterLesEcarts(rapport.ecarts, lesMedias)
		rapport.collections.media = {
			...(await importerLaCollection(
				options,
				ADAPTATEUR_MEDIAS,
				lu.fichiers.fichiers.length,
				lesMedias,
				classement.refuses
			)),
			fichiers: bilanDesFichiers(classement, presences, medias === undefined),
		}

		// Each photo points at its media in Payload, read once the media are written.
		const idsDesMedias = await idsDansLaCible(payload, ADAPTATEUR_MEDIAS, lesMedias, rapport.collections.media.refuses)
		const profils = profilsAttendus(lu.profils, idsDesComptes, laisses, communes.communes, idsDesMedias, consentiLe)
		if (laisses.spam.length > 0) rapport.ecarts[REFERENCES.profilsDuSpam] = laisses.spam.length
		const bilanDesProfils = await importerLaCollection(options, ADAPTATEUR_PROFILS, lu.profils.length, profils.attendus)
		// Only the profiles the target holds are counted: a refused one carries no difference.
		compterLesEcarts(
			rapport.ecarts,
			profils.attendus.filter(({ strapiId }) => !bilanDesProfils.refuses.some(refus => refus.strapiId === strapiId))
		)
		rapport.collections.profils = {
			...bilanDesProfils,
			ecartes: laisses.ecartes,
			spam: laisses.spam,
			statuts: profils.statuts,
			statutsDifferentsDeLaSource: profils.statutsDifferentsDeLaSource,
			communes: communes.bilan,
			photosNonReprises: profils.photosNonReprises,
			liensSansLigne: profils.liensSansLigne,
			prix: profils.prix,
			coordonneesARevoir: profils.coordonneesARevoir,
		}

		const lesArticles = articlesAttendus(articles.pris, lu.fichiers.liens, idsDesMedias)
		rapport.collections.articles = {
			...(await importerLaCollection(
				options,
				ADAPTATEUR_ARTICLES,
				lu.articles.length,
				lesArticles.attendus,
				articles.refuses
			)),
			photosNonReprises: lesArticles.photosNonReprises,
		}

		rapport.collections.talents = await importerLaCollection(
			options,
			ADAPTATEUR_TALENTS,
			lu.talents.length,
			talents.attendus,
			talents.refuses
		)

		if (mode === 'reel') {
			const pros = await pariteDe(payload, ADAPTATEUR_COMPTES, comptes.attendus, rapport.collections.pros)
			const lesProfils = await pariteDe(payload, ADAPTATEUR_PROFILS, profils.attendus, rapport.collections.profils)
			rapport.parite = {
				pros: { ...pros.parite, repartition: repartitionDesComptes(pros.cible) },
				media: (await pariteDe(payload, ADAPTATEUR_MEDIAS, lesMedias, rapport.collections.media)).parite,
				profils: { ...lesProfils.parite, statuts: statutsDe(lesProfils.cible) },
				articles: (await pariteDe(payload, ADAPTATEUR_ARTICLES, lesArticles.attendus, rapport.collections.articles))
					.parite,
				talents: (await pariteDe(payload, ADAPTATEUR_TALENTS, talents.attendus, rapport.collections.talents)).parite,
			}
		}
	}

	const apres = await source.lire(requete => empreinteDesTables(requete))
	rapport.source = { avant, apres, inchangee: memesTables(avant, apres) }
	return rapport
}
