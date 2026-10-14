/**
 * One run of the import (docs/migration/IMPORT.md): read the source, compare it with the target,
 * write the difference when the run is real, then read the target again to prove the parity.
 *
 * - The source is read in one read-only snapshot, and fingerprinted before and after the run.
 * - A case only a decision can settle (accounts that share one email, the profile of an account
 *   a decision sets aside) stops the run before any write, dry or real, and the report lists it
 *   by identifiers.
 * - A dry run (the default) reads the target and says what it would write; it writes nothing.
 * - A real run writes collection by collection, the accounts first, then their profiles, then
 *   the talents, and reads every collection again: its parity is complete when the target holds
 *   exactly what the source gives, with the same values.
 */

import type { Payload } from 'payload'
import type { GenreDeCible } from './cible'
import { ADAPTATEUR_COMPTES, comptesAttendus, lireLesComptes, repartitionDesComptes } from './comptes'
import { AUCUNE_DECISION, type Decisions } from './decisions'
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
import { ADAPTATEUR_PROFILS, lireLesProfils, profilsAttendus, profilsDesComptesEcartes } from './profils'
import type { BilanDeCollection, Mode, PariteDeCollection, Rapport } from './rapport'
import { empreinteDesTables, memesTables, type Source } from './source'
import { ADAPTATEUR_TALENTS, lireLesTalents, talentsAttendus } from './talents'

export interface OptionsDImport {
	payload: Payload
	source: Source
	mode: Mode
	cible: GenreDeCible
	/** The table of decisions (./decisions.ts). None: every case to decide stops the run. */
	decisions?: Decisions
	/** The password of a new account; random by default. Given by a test only. */
	tirerMotDePasse?: () => string
}

/** Counts the transformations of the expected documents, by reference. */
function compterLesEcarts(ecarts: Record<string, number>, attendus: readonly Attendu[]): void {
	for (const { ecarts: duDocument } of attendus)
		for (const { reference } of duDocument) ecarts[reference] = (ecarts[reference] ?? 0) + 1
}

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
	return { ...bilan, refuses: [...refuses, ...bilan.refuses], source, enTrop: plan.enTrop }
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
 * The identifier in Payload of each account the run takes, by its `strapiId`: `null` for an
 * account still to be created, in a dry run.
 */
async function idsDesComptesPris(payload: Payload, comptes: readonly Attendu[]): Promise<Map<number, number | null>> {
	const existants = new Map(
		(await lireLaCible(payload, ADAPTATEUR_COMPTES)).map(({ id, valeurs }) => [Number(valeurs.strapiId), id])
	)
	return new Map(comptes.map(({ strapiId }) => [strapiId, existants.get(strapiId) ?? null]))
}

/** How many documents of the target per status. */
function statutsDe(documents: readonly { valeurs: Readonly<Record<string, unknown>> }[]): Record<string, number> {
	const statuts: Record<string, number> = {}
	for (const { valeurs } of documents) statuts[String(valeurs.statut)] = (statuts[String(valeurs.statut)] ?? 0) + 1
	return statuts
}

export async function importer(options: OptionsDImport): Promise<Rapport> {
	const { payload, source, mode, cible, decisions = AUCUNE_DECISION, tirerMotDePasse } = options
	const avant = await source.lire(requete => empreinteDesTables(requete))
	const lu = await source.lire(async requete => ({
		comptes: await lireLesComptes(requete),
		profils: await lireLesProfils(requete),
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
	const desComptesEcartes = profilsDesComptesEcartes(lu.profils, comptes.ecartes, decisions.profilsEcartes)
	rapport.decisionsSansObjet = comptes.sansObjet + desComptesEcartes.sansObjet
	if (comptes.sansDecision.length > 0 || desComptesEcartes.sansDecision.length > 0) {
		rapport.arret = {
			emailsPartages: comptes.sansDecision,
			profilsDeComptesEcartes: desComptesEcartes.sansDecision,
		}
		rapport.collections.pros = {
			...bilanDuPlan({ actions: [], enTrop: [] }),
			source: lu.comptes.length,
			enTrop: [],
		}
	} else {
		const talents = talentsAttendus(lu.talents)
		for (const { attendus } of [comptes, talents]) compterLesEcarts(rapport.ecarts, attendus)

		rapport.collections.pros = {
			...(await importerLaCollection(options, ADAPTATEUR_COMPTES, lu.comptes.length, comptes.attendus)),
			ecartes: comptes.ecartes,
			nonConfirmes: comptes.nonConfirmes,
			repartition: repartitionDesComptes(comptes.attendus),
		}

		// Each profile points at its account in Payload, read once the accounts are written.
		const idsDesComptes = await idsDesComptesPris(payload, comptes.attendus)
		const profils = profilsAttendus(lu.profils, idsDesComptes, desComptesEcartes.ecartes)
		compterLesEcarts(rapport.ecarts, profils.attendus)
		rapport.collections.profils = {
			...(await importerLaCollection(options, ADAPTATEUR_PROFILS, lu.profils.length, profils.attendus)),
			ecartes: profils.ecartes,
			sansCompte: profils.sansCompte,
			statuts: profils.statuts,
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
				profils: { ...lesProfils.parite, statuts: statutsDe(lesProfils.cible) },
				talents: (await pariteDe(payload, ADAPTATEUR_TALENTS, talents.attendus, rapport.collections.talents)).parite,
			}
		}
	}

	const apres = await source.lire(requete => empreinteDesTables(requete))
	rapport.source = { avant, apres, inchangee: memesTables(avant, apres) }
	return rapport
}
