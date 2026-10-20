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

import { ForbiddenRequest, STATS_PATH } from './guard'
import type { Reader } from './reader'
import { type Finding, reasonOf, type Verdict, worst } from './result'

/** The five headers every response of the v3 leaves with (src/lib/security-headers.ts, ticket 034). */
export const SECURITY_HEADERS = [
	'strict-transport-security',
	'x-content-type-options',
	'referrer-policy',
	'permissions-policy',
	'content-security-policy-report-only',
] as const

/** Lists of accounts and of their journal: an anonymous visitor gets neither a list nor a 404. */
export const PRIVATE_LISTS = ['/api/admins', '/api/pros', '/api/auth-events'] as const

/** Routes of the old site that the v3 does not have. */
export const OLD_ROUTES = ['/api/upload/files', '/api/users', '/documentation'] as const

/** What Strapi must keep answering to an anonymous visitor while it runs (plan 02 §7.6 R05). */
export const STRAPI_ROUTES: readonly { chemin: string; statut: number }[] = [
	{ chemin: '/api/upload/files', statut: 403 },
	{ chemin: '/api/users', statut: 403 },
	{ chemin: '/documentation', statut: 404 },
]

/** The headers missing from an answer, and the ones it must not have. */
export function headerDefaults(entetes: Headers): string[] {
	const defaults = SECURITY_HEADERS.filter(nom => !entetes.get(nom)).map(nom => `en-tête absent : ${nom}`)
	const nosniff = entetes.get('x-content-type-options')
	if (nosniff && nosniff.toLowerCase() !== 'nosniff') defaults.push('x-content-type-options n’est pas « nosniff »')
	if (entetes.has('x-powered-by')) defaults.push('en-tête x-powered-by présent')
	return defaults
}

async function statusOf(lecteur: Reader, chemin: string): Promise<{ statut?: number; erreur?: string }> {
	try {
		return { statut: (await lecteur.lire(chemin)).statut }
	} catch (error) {
		if (error instanceof ForbiddenRequest) throw error
		return { erreur: reasonOf(error) }
	}
}

/** One address that must answer one of `attendus`; the line says what it answered. */
async function demand(
	lecteur: Reader,
	chemin: string,
	attendus: readonly number[],
	sens: string
): Promise<{ verdict: Verdict; constat: string }> {
	const { statut: status, erreur: error } = await statusOf(lecteur, chemin)
	if (status === undefined) return { verdict: 'rouge', constat: `${chemin} : ${error}` }
	const ok = attendus.includes(status)
	return {
		verdict: ok ? 'vert' : 'rouge',
		constat: `${chemin} : ${ok ? status : `réponse ${status}, ${attendus.join(' ou ')} attendu`} (${sens})`,
	}
}

export interface OptionsR05 {
	/** The site. */
	site: Reader
	/** The Strapi API, while it runs. Nothing: that part is not played. */
	strapi?: Reader | undefined
}

export async function probeR05({ site, strapi }: OptionsR05): Promise<Finding> {
	const verdicts: Verdict[] = []
	const findings: string[] = []

	try {
		const home = await site.lire('/')
		const defaults = home.statut === 200 ? headerDefaults(home.entetes) : [`réponse ${home.statut}, 200 attendu`]
		verdicts.push(defaults.length === 0 ? 'vert' : 'rouge')
		findings.push(
			defaults.length === 0
				? `/ : les ${SECURITY_HEADERS.length} en-têtes de sécurité sont là, pas de x-powered-by`
				: `/ : ${defaults.join(' ; ')}`
		)
	} catch (error) {
		if (error instanceof ForbiddenRequest) throw error
		verdicts.push('rouge')
		findings.push(`/ : ${reasonOf(error)}`)
	}

	const toRead: { lecteur: Reader; chemin: string; attendus: readonly number[]; sens: string; devant: string }[] = [
		...PRIVATE_LISTS.map(chemin => ({
			lecteur: site,
			chemin,
			attendus: [401, 403],
			sens: 'liste privée fermée',
			devant: '',
		})),
		{ lecteur: site, chemin: STATS_PATH, attendus: [401], sens: 'statistiques fermées sans jeton', devant: '' },
		...OLD_ROUTES.map(chemin => ({
			lecteur: site,
			chemin,
			attendus: [404],
			sens: 'ancienne route disparue',
			devant: '',
		})),
		...(strapi
			? STRAPI_ROUTES.map(({ chemin: path, statut: status }) => ({
					lecteur: strapi,
					chemin: path,
					attendus: [status],
					sens: 'API Strapi',
					devant: 'Strapi ',
				}))
			: []),
	]
	// One at a time, in order: each reader paces itself.
	for (const { lecteur: reader, chemin: path, attendus: expected, sens, devant } of toRead) {
		const { verdict, constat: finding } = await demand(reader, path, expected, sens)
		verdicts.push(verdict)
		findings.push(`${devant}${finding}`)
	}
	if (!strapi) findings.push('partie Strapi non jouée (pas d’API Strapi à lire)')
	return { verdict: worst(verdicts), constats: findings }
}
