/**
 * Command line of the fake Strapi source of the bench (docs/tests/source-strapi.md).
 *
 *   bun run bench:source               creates the source (or creates it again), then prints its inventory and fingerprint
 *   bun run bench:source --fingerprint   prints the fingerprint of the source as it is, without touching it
 *   bun run bench:source --erase     drops the source: database, read-only role, objects
 *
 * The instance (name and ports) comes from BENCH_INSTANCE and BENCH_OFFSET, as for every command of
 * the bench. Started with `--no-env-file`: a working `.env` never reaches the bench. Nothing printed
 * holds a hash, an email or a password: numbers and fingerprints only.
 */

import { RefusedBench } from '../tests/support/bench'
import {
	benchSource,
	createSourceStrapi,
	eraseSourceStrapi,
	inventaire,
	inventaireEnMarkdown,
	readSource,
	type SourceFingerprint,
	type SourceStrapi,
	sourceFingerprint,
} from '../tests/support/source-strapi'
import { currentBench, requireRunningBench } from './bench'

const USAGE = 'Usage : bun run bench:source [--fingerprint | --erase]'

const seconds = (debut: number): string => ((performance.now() - debut) / 1000).toFixed(1).replace('.', ',')

function showFingerprint({ empreinte, tables, objets }: SourceFingerprint): void {
	const lines = Object.values(tables).reduce((somme, table) => somme + table.lignes, 0)
	console.log(
		[
			`Empreinte de la source : ${empreinte}`,
			`- ${Object.keys(tables).length} tables, ${lines} lignes`,
			`- ${objets.cles} objets nommés par les fichiers, dont ${objets.presents} présents dans le stockage`,
		].join('\n')
	)
}

async function principal(argumentsDeLaCommande: string[]): Promise<number> {
	const [option, ...rest] = argumentsDeLaCommande
	if (rest.length > 0 || (option !== undefined && !['--fingerprint', '--erase'].includes(option))) {
		console.error(USAGE)
		return 2
	}
	const bench = currentBench()
	await requireRunningBench(bench)
	const source: SourceStrapi = benchSource({
		...bench.environnement,
		BENCH_INSTANCE: bench.instance.nom,
		BENCH_OFFSET: String(bench.instance.decalage),
	})
	const start = performance.now()

	if (option === '--erase') {
		await eraseSourceStrapi(source)
		console.log(`Fausse base Strapi du banc « ${bench.instance.nom} » effacée : base, rôle en lecture seule et objets.`)
		return 0
	}
	if (option === '--fingerprint') {
		showFingerprint(await sourceFingerprint(source))
		return 0
	}

	await createSourceStrapi(source)
	const state = await readSource(source)
	console.log(
		[
			`Fausse base Strapi du banc « ${bench.instance.nom} » créée en ${seconds(start)} s.`,
			`- base « ${source.base} », lue par le rôle « ${source.role} », qui ne peut rien y écrire (STRAPI_SOURCE_URI)`,
			`- photos dans l’espace « ${source.stockage.bucket} » du stockage d’objets`,
			'',
			'Inventaire :',
			'',
			inventaireEnMarkdown(inventaire(state)),
			'',
		].join('\n')
	)
	showFingerprint(await sourceFingerprint(source))
	return 0
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (error) {
	if (!(error instanceof RefusedBench)) throw error
	console.error(error.message)
	process.exit(1)
}
