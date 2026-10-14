/**
 * Where the fictional set may be loaded (ticket 051): the local test bench, or the pre-production.
 * Nowhere else: never the site in production, never a development database, never a database the
 * environment does not name.
 *
 * The set writes made-up accounts, profiles and photos: on the site, they would show among the
 * real makeup artists. So the environment says where it runs, by two keys that must agree:
 *
 * - `APP_ENV=test`, the bench: a database of this machine whose name ends with `_test`, the object
 *   storage of this machine in a bucket whose name ends with `-test`, and no deployed address;
 * - `APP_ENV=preprod`, the pre-production: its own address, `https://preprod.my-makeup.fr`, and
 *   no other. It may have no object storage yet: the set is then loaded without its photos
 *   (./chargement.ts, ticket 053).
 *
 * `APP_ENV=prod`, the address of the site, a missing or unknown `APP_ENV` (a development `.env`
 * has none) are refused. A refusal names the variable, never its value.
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import { isLocalDatabase } from '../lib/env'

/** Where the set is loaded: the test bench, or the pre-production. */
export type CibleDuJeu = 'banc' | 'preprod'

/** What the guard reads: the environment of the process, or what a test gives. */
export type VariablesDuJeu = Readonly<Record<string, string | undefined>>

/** The address of the site in production: the set never goes there. */
export const ORIGINE_DU_SITE = 'https://my-makeup.fr'

/** The address of the pre-production: the only deployed site the set fills. */
export const ORIGINE_DE_LA_PREPROD = 'https://preprod.my-makeup.fr'

/** The set refuses to run here: nothing has been read nor written. */
export class JeuFictifRefuse extends Error {
	override name = 'JeuFictifRefuse'

	constructor(raison: string) {
		super(`Jeu fictif refusé : ${raison} Rien n’est lu ni écrit.`)
	}
}

const refuser = (raison: string): never => {
	throw new JeuFictifRefuse(raison)
}

const LOCAUX = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** True when the address can only be one of this machine. Anything unreadable is not. */
function adresseLocale(valeur: string | undefined): boolean {
	if (valeur === undefined) return false
	try {
		return LOCAUX.has(new URL(valeur).hostname)
	} catch {
		return false
	}
}

/** The name of the database a connection string opens, or nothing when it names none. */
function nomDeLaBase(uri: string): string {
	try {
		return decodeURIComponent(new URL(uri).pathname.slice(1))
	} catch {
		return ''
	}
}

/** The bench: everything the set writes stays on this machine, in what is made to be thrown away. */
function verifierLeBanc(variables: VariablesDuJeu): void {
	const base = variables.DATABASE_URI ?? ''
	if (!isLocalDatabase(base) || !nomDeLaBase(base).endsWith('_test'))
		refuser(
			'avec APP_ENV=test, DATABASE_URI doit désigner une base de ce poste dont le nom finit par « _test » : la base du banc de test.'
		)
	if (!adresseLocale(variables.S3_ENDPOINT) || !variables.S3_BUCKET?.endsWith('-test'))
		refuser(
			'avec APP_ENV=test, S3_ENDPOINT doit désigner le stockage de ce poste, et S3_BUCKET un espace dont le nom finit par « -test » : le stockage du banc de test.'
		)
	const site = variables.NEXT_PUBLIC_SITE_URL
	if (site !== undefined && site !== '' && !adresseLocale(site))
		refuser('avec APP_ENV=test, NEXT_PUBLIC_SITE_URL doit être une adresse de ce poste.')
}

/**
 * Where the set may be loaded in this environment, or `JeuFictifRefuse`. Called before anything is
 * read or written; `poserLesProfilsDuJeu` (./chargement.ts) also checks the database Payload is
 * really connected to.
 */
export function cibleDuJeu(variables: VariablesDuJeu = process.env): CibleDuJeu {
	const environnement = variables.APP_ENV
	if (environnement === 'prod') refuser('APP_ENV vaut « prod » : le jeu fictif ne va jamais sur le site en ligne.')
	if (variables.NEXT_PUBLIC_SITE_URL === ORIGINE_DU_SITE)
		refuser('NEXT_PUBLIC_SITE_URL est l’adresse du site en ligne : le jeu fictif n’y va jamais.')
	if (!variables.DATABASE_URI) refuser('DATABASE_URI manque.')
	if (environnement === 'test') {
		// The bench always has its storage; the pre-production may not have one yet (ticket 053).
		if (!variables.S3_ENDPOINT)
			refuser('S3_ENDPOINT manque : les photos du jeu vont dans le stockage d’objets, et l’application n’en a pas.')
		verifierLeBanc(variables)
		return 'banc'
	}
	if (environnement === 'preprod') {
		if (variables.NEXT_PUBLIC_SITE_URL !== ORIGINE_DE_LA_PREPROD)
			refuser(`avec APP_ENV=preprod, NEXT_PUBLIC_SITE_URL doit être ${ORIGINE_DE_LA_PREPROD}.`)
		return 'preprod'
	}
	return refuser(
		environnement === undefined || environnement === ''
			? 'APP_ENV manque : le jeu fictif ne se charge que sur le banc de test (APP_ENV=test) ou sur la préprod (APP_ENV=preprod).'
			: 'APP_ENV n’est ni « test » ni « preprod » : le jeu fictif ne se charge que sur le banc de test ou sur la préprod.'
	)
}
