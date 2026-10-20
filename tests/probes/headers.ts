/**
 * R05 (plan 02 §7.6, ticket 156): the security headers are there, the private lists are closed, the
 * old routes are gone. While Strapi still runs, its own API is read too.
 *
 * Everything is a GET of an address a visitor could type, answered at its first answer (a redirect is
 * not followed). Nothing is written, nothing is signed in.
 *
 * The addresses are those of the v3: `/api/admins`, `/api/pros` and `/api/auth-events` are lists
 * of accounts and of their journal, closed to anyone who is not signed in as an admin. The routes of
 * the old site (`/api/upload/files`, `/api/users`, `/documentation`) must be gone.
 */

import { CHEMIN_DES_STATS, RequeteInterdite } from './guard'
import type { Lecteur } from './reader'
import { type Constat, pire, raisonDe, type Verdict } from './result'

/** The five headers every response of the v3 leaves with (src/lib/security-headers.ts, ticket 034). */
export const ENTETES_DE_SECURITE = [
	'strict-transport-security',
	'x-content-type-options',
	'referrer-policy',
	'permissions-policy',
	'content-security-policy-report-only',
] as const

/** Lists of accounts and of their journal: an anonymous visitor gets neither a list nor a 404. */
export const LISTES_PRIVEES = ['/api/admins', '/api/pros', '/api/auth-events'] as const

/** Routes of the old site that the v3 does not have. */
export const ANCIENNES_ROUTES = ['/api/upload/files', '/api/users', '/documentation'] as const

/** What Strapi must keep answering to an anonymous visitor while it runs (plan 02 §7.6 R05). */
export const ROUTES_DE_STRAPI: readonly { chemin: string; statut: number }[] = [
	{ chemin: '/api/upload/files', statut: 403 },
	{ chemin: '/api/users', statut: 403 },
	{ chemin: '/documentation', statut: 404 },
]

/** The headers missing from an answer, and the ones it must not have. */
export function defautsDEntetes(entetes: Headers): string[] {
	const defauts = ENTETES_DE_SECURITE.filter(nom => !entetes.get(nom)).map(nom => `en-tête absent : ${nom}`)
	const nosniff = entetes.get('x-content-type-options')
	if (nosniff && nosniff.toLowerCase() !== 'nosniff') defauts.push('x-content-type-options n’est pas « nosniff »')
	if (entetes.has('x-powered-by')) defauts.push('en-tête x-powered-by présent')
	return defauts
}

async function statutDe(lecteur: Lecteur, chemin: string): Promise<{ statut?: number; erreur?: string }> {
	try {
		return { statut: (await lecteur.lire(chemin)).statut }
	} catch (erreur) {
		if (erreur instanceof RequeteInterdite) throw erreur
		return { erreur: raisonDe(erreur) }
	}
}

/** One address that must answer one of `attendus`; the line says what it answered. */
async function exiger(
	lecteur: Lecteur,
	chemin: string,
	attendus: readonly number[],
	sens: string
): Promise<{ verdict: Verdict; constat: string }> {
	const { statut, erreur } = await statutDe(lecteur, chemin)
	if (statut === undefined) return { verdict: 'rouge', constat: `${chemin} : ${erreur}` }
	const ok = attendus.includes(statut)
	return {
		verdict: ok ? 'vert' : 'rouge',
		constat: `${chemin} : ${ok ? statut : `réponse ${statut}, ${attendus.join(' ou ')} attendu`} (${sens})`,
	}
}

export interface OptionsR05 {
	/** The site. */
	site: Lecteur
	/** The Strapi API, while it runs. Nothing: that part is not played. */
	strapi?: Lecteur | undefined
}

export async function sondeR05({ site, strapi }: OptionsR05): Promise<Constat> {
	const verdicts: Verdict[] = []
	const constats: string[] = []

	try {
		const accueil = await site.lire('/')
		const defauts =
			accueil.statut === 200 ? defautsDEntetes(accueil.entetes) : [`réponse ${accueil.statut}, 200 attendu`]
		verdicts.push(defauts.length === 0 ? 'vert' : 'rouge')
		constats.push(
			defauts.length === 0
				? `/ : les ${ENTETES_DE_SECURITE.length} en-têtes de sécurité sont là, pas de x-powered-by`
				: `/ : ${defauts.join(' ; ')}`
		)
	} catch (erreur) {
		if (erreur instanceof RequeteInterdite) throw erreur
		verdicts.push('rouge')
		constats.push(`/ : ${raisonDe(erreur)}`)
	}

	const aLire: { lecteur: Lecteur; chemin: string; attendus: readonly number[]; sens: string; devant: string }[] = [
		...LISTES_PRIVEES.map(chemin => ({
			lecteur: site,
			chemin,
			attendus: [401, 403],
			sens: 'liste privée fermée',
			devant: '',
		})),
		{ lecteur: site, chemin: CHEMIN_DES_STATS, attendus: [401], sens: 'statistiques fermées sans jeton', devant: '' },
		...ANCIENNES_ROUTES.map(chemin => ({
			lecteur: site,
			chemin,
			attendus: [404],
			sens: 'ancienne route disparue',
			devant: '',
		})),
		...(strapi
			? ROUTES_DE_STRAPI.map(({ chemin, statut }) => ({
					lecteur: strapi,
					chemin,
					attendus: [statut],
					sens: 'API Strapi',
					devant: 'Strapi ',
				}))
			: []),
	]
	// One at a time, in order: each reader paces itself.
	for (const { lecteur, chemin, attendus, sens, devant } of aLire) {
		const { verdict, constat } = await exiger(lecteur, chemin, attendus, sens)
		verdicts.push(verdict)
		constats.push(`${devant}${constat}`)
	}
	if (!strapi) constats.push('partie Strapi non jouée (pas d’API Strapi à lire)')
	return { verdict: pire(verdicts), constats }
}
