/**
 * R02 (plan 02 §7.6, ticket 156): the profile addresses of the sitemap are exactly the publishable
 * profiles.
 *
 * The publishable profiles come from the weekly statistics route (ticket 149), behind a token of the
 * service: `publiables.slugs`. Without the token the probe cannot know, and says `inconnu`: never
 * `vert`, since nothing was compared. Equality is exact: same number, same addresses.
 *
 * The report never writes an address: a gap is told by counts and by the fingerprints of the
 * addresses (tests/probes/content.ts).
 */

import { profilePath } from '../../src/lib/slug'
import { fingerprint, profilePaths } from './content'
import { ForbiddenRequest, STATS_PATH } from './guard'
import type { Reader } from './reader'
import { type Finding, reasonOf } from './result'

export const SITEMAP_PATH = '/sitemap.xml'

/** How far back the statistics are asked for: the route needs a period, the profiles listed do not depend on it. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** How many fingerprints a gap names. */
const SHOWN_FINGERPRINTS = 5

export const TOKEN_NAME = 'PROBES_STATS_TOKEN'

/** The slugs of `publiables.slugs`, or nothing when the answer does not have that shape. */
export function slugPublishable(corps: string): string[] | undefined {
	let data: unknown
	try {
		data = JSON.parse(corps)
	} catch {
		return undefined
	}
	if (typeof data !== 'object' || data === null || !('publiables' in data)) return undefined
	const { publiables: publishable } = data
	if (typeof publishable !== 'object' || publishable === null || !('slugs' in publishable)) return undefined
	const { slugs } = publishable
	return Array.isArray(slugs) && slugs.every((slug): slug is string => typeof slug === 'string') ? slugs : undefined
}

const show = (chemins: readonly string[]): string =>
	chemins
		.slice(0, SHOWN_FINGERPRINTS)
		.map(chemin => `#${fingerprint(chemin)}`)
		.join(', ') + (chemins.length > SHOWN_FINGERPRINTS ? ', …' : '')

/** Compares two lists of profile paths; red lines are empty when they are the same set. */
export function compare(
	sitemap: readonly string[],
	publiables: readonly string[]
): { egal: boolean; constats: string[] } {
	const inPlan = new Set(sitemap)
	const publicOnes = new Set(publiables)
	const inToo = [...inPlan].filter(chemin => !publicOnes.has(chemin))
	const missing = [...publicOnes].filter(chemin => !inPlan.has(chemin))
	const findings = [`${inPlan.size} profils dans ${SITEMAP_PATH}, ${publicOnes.size} profils publiables`]
	if (inToo.length > 0)
		findings.push(
			`${inToo.length} dans le sitemap mais non publiable${inToo.length > 1 ? 's' : ''} (empreintes : ${show(inToo)})`
		)
	if (missing.length > 0)
		findings.push(
			`${missing.length} publiable${missing.length > 1 ? 's' : ''} absent${missing.length > 1 ? 's' : ''} du sitemap (empreintes : ${show(missing)})`
		)
	const equal = inToo.length === 0 && missing.length === 0 && inPlan.size === publicOnes.size
	if (equal) findings.push('égalité exacte')
	return { egal: equal, constats: findings }
}

export interface OptionsR02 {
	/** The token of the service, or nothing. */
	jeton: string | undefined
	maintenant: () => Date
}

export async function probeR02(lecteur: Reader, { jeton, maintenant }: OptionsR02): Promise<Finding> {
	if (jeton === undefined || jeton === '')
		return {
			verdict: 'inconnu',
			constats: [
				`pas de jeton (${TOKEN_NAME}) : la liste des profils publiables n’est pas lue, rien n’est comparé au sitemap`,
			],
		}
	try {
		const sitemap = await lecteur.lire(SITEMAP_PATH)
		if (sitemap.statut !== 200) return { verdict: 'rouge', constats: [`${SITEMAP_PATH} : réponse ${sitemap.statut}`] }

		const end = maintenant()
		const request = new URLSearchParams({
			from: new Date(end.getTime() - WEEK_MS).toISOString(),
			to: end.toISOString(),
		})
		const stats = await lecteur.lire(`${STATS_PATH}?${request}`, { authorization: `Bearer ${jeton}` })
		if (stats.statut === 401)
			return {
				verdict: 'rouge',
				constats: ['la route des statistiques refuse le jeton (401) : le jeton est faux ou périmé'],
			}
		if (stats.statut !== 200)
			return { verdict: 'rouge', constats: [`la route des statistiques répond ${stats.statut}, 200 attendu`] }
		const slugs = slugPublishable(stats.corps)
		if (slugs === undefined)
			return {
				verdict: 'rouge',
				constats: ['la réponse des statistiques n’a pas la forme attendue (publiables.slugs)'],
			}

		const { egal: equal, constats: findings } = compare(profilePaths(sitemap.corps), slugs.map(profilePath))
		return { verdict: equal ? 'vert' : 'rouge', constats: findings }
	} catch (error) {
		if (error instanceof ForbiddenRequest) throw error
		return { verdict: 'rouge', constats: [reasonOf(error)] }
	}
}
