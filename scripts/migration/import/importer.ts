/**
 * One run of the import (docs/migration/IMPORT.md): read the source, compare it with the target,
 * write the difference when the run is real, then read the target again to prove the parity.
 *
 * - The source is read in one read-only snapshot, and fingerprinted before and after the run.
 * - A dry run (the default) reads the target and says what it would write; it writes nothing.
 * - A real run writes collection by collection, then reads every collection again: its parity is
 *   complete when the target holds exactly what the source gives, with the same values.
 */

import type { Payload } from 'payload'
import type { GenreDeCible } from './cible'
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
import type { BilanDeCollection, Mode, Rapport } from './rapport'
import { empreinteDesTables, memesTables, type Source } from './source'
import { ADAPTATEUR_TALENTS, lireLesTalents, talentsAttendus } from './talents'

export interface OptionsDImport {
	payload: Payload
	source: Source
	mode: Mode
	cible: GenreDeCible
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
	refuses: readonly Refus[]
): Promise<BilanDeCollection> {
	const plan = planifier(adaptateur, attendus, await lireLaCible(payload, adaptateur))
	const bilan = mode === 'reel' ? await ecrire(payload, adaptateur, plan) : bilanDuPlan(plan)
	return { ...bilan, refuses: [...refuses, ...bilan.refuses], source, enTrop: plan.enTrop }
}

export async function importer(options: OptionsDImport): Promise<Rapport> {
	const { payload, source, mode, cible } = options
	const avant = await source.lire(requete => empreinteDesTables(requete))
	const lu = await source.lire(async requete => ({ talents: await lireLesTalents(requete) }))

	const rapport: Rapport = {
		mode,
		cible,
		source: { avant, apres: avant, inchangee: true },
		collections: {},
		ecarts: {},
		parite: null,
	}

	const talents = talentsAttendus(lu.talents)
	compterLesEcarts(rapport.ecarts, talents.attendus)
	rapport.collections.talents = await importerLaCollection(
		options,
		ADAPTATEUR_TALENTS,
		lu.talents.length,
		talents.attendus,
		talents.refuses
	)

	if (mode === 'reel') {
		// The documents refused while writing are not expected: they are listed for a decision.
		const refusesEnEcrivant = new Set(rapport.collections.talents.refuses.map(({ strapiId }) => strapiId))
		rapport.parite = {
			talents: parite(
				ADAPTATEUR_TALENTS,
				talents.attendus.filter(({ strapiId }) => !refusesEnEcrivant.has(strapiId)),
				await lireLaCible(payload, ADAPTATEUR_TALENTS)
			),
		}
	}

	const apres = await source.lire(requete => empreinteDesTables(requete))
	rapport.source = { avant, apres, inchangee: memesTables(avant, apres) }
	return rapport
}
