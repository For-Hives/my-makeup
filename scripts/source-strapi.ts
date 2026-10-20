/**
 * Command line of the fake Strapi source of the bench (docs/tests/source-strapi.md).
 *
 *   bun run banc:source               creates the source (or creates it again), then prints its inventory and fingerprint
 *   bun run banc:source --fingerprint   prints the fingerprint of the source as it is, without touching it
 *   bun run banc:source --erase     drops the source: database, read-only role, objects
 *
 * The instance (name and ports) comes from BANC_INSTANCE and BANC_DECALAGE, as for every command of
 * the bench. Started with `--no-env-file`: a working `.env` never reaches the bench. Nothing printed
 * holds a hash, an email or a password: numbers and fingerprints only.
 */

import { BancRefuse } from '../tests/support/bench'
import {
	creerLaSourceStrapi,
	type EmpreinteDeLaSource,
	effacerLaSourceStrapi,
	empreinteDeLaSource,
	inventaire,
	inventaireEnMarkdown,
	lireLaSource,
	type SourceStrapi,
	sourceDuBanc,
} from '../tests/support/source-strapi'
import { bancCourant, exigerBancDebout } from './bench'

const USAGE = 'Usage : bun run banc:source [--fingerprint | --erase]'

const seconds = (debut: number): string => ((performance.now() - debut) / 1000).toFixed(1).replace('.', ',')

function showFingerprint({ empreinte, tables, objets }: EmpreinteDeLaSource): void {
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
	const bench = bancCourant()
	await exigerBancDebout(bench)
	const source: SourceStrapi = sourceDuBanc({
		...bench.environnement,
		BANC_INSTANCE: bench.instance.nom,
		BANC_DECALAGE: String(bench.instance.decalage),
	})
	const start = performance.now()

	if (option === '--erase') {
		await effacerLaSourceStrapi(source)
		console.log(`Fausse base Strapi du banc « ${bench.instance.nom} » effacée : base, rôle en lecture seule et objets.`)
		return 0
	}
	if (option === '--fingerprint') {
		showFingerprint(await empreinteDeLaSource(source))
		return 0
	}

	await creerLaSourceStrapi(source)
	const state = await lireLaSource(source)
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
	showFingerprint(await empreinteDeLaSource(source))
	return 0
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (error) {
	if (!(error instanceof BancRefuse)) throw error
	console.error(error.message)
	process.exit(1)
}
