/**
 * Where the fictional set may be loaded (ticket 051): the local test bench, and nowhere else. There
 * is no staging environment (ticket 232): never the site in production, never a development database,
 * never a database the environment does not name.
 *
 * The set writes made-up accounts, profiles and photos: on the site, they would show among the
 * real makeup artists. So the environment says where it runs, by two keys that must agree:
 *
 * - `APP_ENV=test`, the bench: a database of this machine whose name ends with `_test`, the object
 *   storage of this machine in a bucket whose name ends with `-test`, and no deployed address.
 *
 * `APP_ENV=prod`, the address of the site, a missing or unknown `APP_ENV` (a development `.env`
 * has none) are refused. A refusal names the variable, never its value.
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import { isLocalDatabase } from '../lib/env'

/** Where the set is loaded: the test bench. */
export type DemoTarget = 'banc'

/** What the guard reads: the environment of the process, or what a test gives. */
export type DemoVariables = Readonly<Record<string, string | undefined>>

/** The address of the site in production: the set never goes there. */
export const SITE_ORIGIN = 'https://my-makeup.fr'

/** The set refuses to run here: nothing has been read nor written. */
export class DemoDataRefused extends Error {
	override name = 'JeuFictifRefuse'

	constructor(raison: string) {
		super(`Jeu fictif refusé : ${raison} Rien n’est lu ni écrit.`)
	}
}

const refuse = (raison: string): never => {
	throw new DemoDataRefused(raison)
}

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** True when the address can only be one of this machine. Anything unreadable is not. */
function localAddress(valeur: string | undefined): boolean {
	if (valeur === undefined) return false
	try {
		return LOCAL.has(new URL(valeur).hostname)
	} catch {
		return false
	}
}

/** The name of the database a connection string opens, or nothing when it names none. */
function databaseName(uri: string): string {
	try {
		return decodeURIComponent(new URL(uri).pathname.slice(1))
	} catch {
		return ''
	}
}

/** The bench: everything the set writes stays on this machine, in what is made to be thrown away. */
function checkBench(variables: DemoVariables): void {
	const base = variables.DATABASE_URI ?? ''
	if (!isLocalDatabase(base) || !databaseName(base).endsWith('_test'))
		refuse(
			'avec APP_ENV=test, DATABASE_URI doit désigner une base de ce poste dont le nom finit par « _test » : la base du banc de test.'
		)
	if (!localAddress(variables.S3_ENDPOINT) || !variables.S3_BUCKET?.endsWith('-test'))
		refuse(
			'avec APP_ENV=test, S3_ENDPOINT doit désigner le stockage de ce poste, et S3_BUCKET un espace dont le nom finit par « -test » : le stockage du banc de test.'
		)
	const site = variables.NEXT_PUBLIC_SITE_URL
	if (site !== undefined && site !== '' && !localAddress(site))
		refuse('avec APP_ENV=test, NEXT_PUBLIC_SITE_URL doit être une adresse de ce poste.')
}

/**
 * Where the set may be loaded in this environment, or `DemoDataRefused`. Called before anything is
 * read or written; `placeDemoProfiles` (./chargement.ts) also checks the database Payload is
 * really connected to.
 */
export function demoTarget(variables: DemoVariables = process.env): DemoTarget {
	const environment = variables.APP_ENV
	if (environment === 'prod') refuse('APP_ENV vaut « prod » : le jeu fictif ne va jamais sur le site en ligne.')
	if (variables.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN)
		refuse('NEXT_PUBLIC_SITE_URL est l’adresse du site en ligne : le jeu fictif n’y va jamais.')
	if (!variables.DATABASE_URI) refuse('DATABASE_URI manque.')
	if (environment === 'test') {
		// The bench always has its storage.
		if (!variables.S3_ENDPOINT)
			refuse('S3_ENDPOINT manque : les photos du jeu vont dans le stockage d’objets, et l’application n’en a pas.')
		checkBench(variables)
		return 'banc'
	}
	return refuse(
		environment === undefined || environment === ''
			? 'APP_ENV manque : le jeu fictif ne se charge que sur le banc de test (APP_ENV=test).'
			: 'APP_ENV n’est pas « test » : le jeu fictif ne se charge que sur le banc de test.'
	)
}
