/**
 * Command line of the fake Strapi source of the bench (docs/tests/source-strapi.md).
 *
 *   bun run banc:source               creates the source (or creates it again), then prints its inventory and fingerprint
 *   bun run banc:source --empreinte   prints the fingerprint of the source as it is, without touching it
 *   bun run banc:source --effacer     drops the source: database, read-only role, objects
 *
 * The instance (name and ports) comes from BANC_INSTANCE and BANC_DECALAGE, as for every command of
 * the bench. Started with `--no-env-file`: a working `.env` never reaches the bench. Nothing printed
 * holds a hash, an email or a password: numbers and fingerprints only.
 */

import { BancRefuse } from '../tests/outils/banc'
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
} from '../tests/outils/source-strapi'
import { bancCourant, exigerBancDebout } from './banc'

const USAGE = 'Usage : bun run banc:source [--empreinte | --effacer]'

const secondes = (debut: number): string => ((performance.now() - debut) / 1000).toFixed(1).replace('.', ',')

function afficherEmpreinte({ empreinte, tables, objets }: EmpreinteDeLaSource): void {
	const lignes = Object.values(tables).reduce((somme, table) => somme + table.lignes, 0)
	console.log(
		[
			`Empreinte de la source : ${empreinte}`,
			`- ${Object.keys(tables).length} tables, ${lignes} lignes`,
			`- ${objets.cles} objets nommés par les fichiers, dont ${objets.presents} présents dans le stockage`,
		].join('\n')
	)
}

async function principal(argumentsDeLaCommande: string[]): Promise<number> {
	const [option, ...reste] = argumentsDeLaCommande
	if (reste.length > 0 || (option !== undefined && !['--empreinte', '--effacer'].includes(option))) {
		console.error(USAGE)
		return 2
	}
	const banc = bancCourant()
	await exigerBancDebout(banc)
	const source: SourceStrapi = sourceDuBanc({
		...banc.environnement,
		BANC_INSTANCE: banc.instance.nom,
		BANC_DECALAGE: String(banc.instance.decalage),
	})
	const debut = performance.now()

	if (option === '--effacer') {
		await effacerLaSourceStrapi(source)
		console.log(`Fausse base Strapi du banc « ${banc.instance.nom} » effacée : base, rôle en lecture seule et objets.`)
		return 0
	}
	if (option === '--empreinte') {
		afficherEmpreinte(await empreinteDeLaSource(source))
		return 0
	}

	await creerLaSourceStrapi(source)
	const etat = await lireLaSource(source)
	console.log(
		[
			`Fausse base Strapi du banc « ${banc.instance.nom} » créée en ${secondes(debut)} s.`,
			`- base « ${source.base} », lue par le rôle « ${source.role} », qui ne peut rien y écrire (STRAPI_SOURCE_URI)`,
			`- photos dans l’espace « ${source.stockage.bucket} » du stockage d’objets`,
			'',
			'Inventaire :',
			'',
			inventaireEnMarkdown(inventaire(etat)),
			'',
		].join('\n')
	)
	afficherEmpreinte(await empreinteDeLaSource(source))
	return 0
}

try {
	process.exit(await principal(process.argv.slice(2)))
} catch (erreur) {
	if (!(erreur instanceof BancRefuse)) throw erreur
	console.error(erreur.message)
	process.exit(1)
}
