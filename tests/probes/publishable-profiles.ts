/**
 * R02 (plan 02 §7.6, ticket 156): the profile addresses of the sitemap are exactly the publishable
 * profiles.
 *
 * The publishable profiles come from the weekly statistics route (ticket 149), behind a token of the
 * service: `publiables.slugs`. Without the token the probe cannot know, and says `inconnu`: never
 * `vert`, since nothing was compared. Equality is exact: same number, same addresses.
 *
 * The report never writes an address: a gap is told by counts and by the fingerprints of the
 * addresses (tests/sondes/contenu.ts).
 */

import { profilePath } from '../../src/lib/slug'
import { cheminsDeProfils, empreinte } from './content'
import { CHEMIN_DES_STATS, RequeteInterdite } from './guard'
import type { Lecteur } from './reader'
import { type Constat, raisonDe } from './result'

export const CHEMIN_DU_SITEMAP = '/sitemap.xml'

/** How far back the statistics are asked for: the route needs a period, the profiles listed do not depend on it. */
const SEMAINE_MS = 7 * 24 * 60 * 60 * 1000

/** How many fingerprints a gap names. */
const EMPREINTES_MONTREES = 5

export const NOM_DU_JETON = 'SONDES_STATS_TOKEN'

/** The slugs of `publiables.slugs`, or nothing when the answer does not have that shape. */
export function slugsPubliables(corps: string): string[] | undefined {
	let donnees: unknown
	try {
		donnees = JSON.parse(corps)
	} catch {
		return undefined
	}
	if (typeof donnees !== 'object' || donnees === null || !('publiables' in donnees)) return undefined
	const { publiables } = donnees
	if (typeof publiables !== 'object' || publiables === null || !('slugs' in publiables)) return undefined
	const { slugs } = publiables
	return Array.isArray(slugs) && slugs.every((slug): slug is string => typeof slug === 'string') ? slugs : undefined
}

const montrer = (chemins: readonly string[]): string =>
	chemins
		.slice(0, EMPREINTES_MONTREES)
		.map(chemin => `#${empreinte(chemin)}`)
		.join(', ') + (chemins.length > EMPREINTES_MONTREES ? ', …' : '')

/** Compares two lists of profile paths; red lines are empty when they are the same set. */
export function comparer(
	sitemap: readonly string[],
	publiables: readonly string[]
): { egal: boolean; constats: string[] } {
	const dansLePlan = new Set(sitemap)
	const publics = new Set(publiables)
	const enTrop = [...dansLePlan].filter(chemin => !publics.has(chemin))
	const manquants = [...publics].filter(chemin => !dansLePlan.has(chemin))
	const constats = [`${dansLePlan.size} profils dans ${CHEMIN_DU_SITEMAP}, ${publics.size} profils publiables`]
	if (enTrop.length > 0)
		constats.push(
			`${enTrop.length} dans le sitemap mais non publiable${enTrop.length > 1 ? 's' : ''} (empreintes : ${montrer(enTrop)})`
		)
	if (manquants.length > 0)
		constats.push(
			`${manquants.length} publiable${manquants.length > 1 ? 's' : ''} absent${manquants.length > 1 ? 's' : ''} du sitemap (empreintes : ${montrer(manquants)})`
		)
	const egal = enTrop.length === 0 && manquants.length === 0 && dansLePlan.size === publics.size
	if (egal) constats.push('égalité exacte')
	return { egal, constats }
}

export interface OptionsR02 {
	/** The token of the service, or nothing. */
	jeton: string | undefined
	maintenant: () => Date
}

export async function sondeR02(lecteur: Lecteur, { jeton, maintenant }: OptionsR02): Promise<Constat> {
	if (jeton === undefined || jeton === '')
		return {
			verdict: 'inconnu',
			constats: [
				`pas de jeton (${NOM_DU_JETON}) : la liste des profils publiables n’est pas lue, rien n’est comparé au sitemap`,
			],
		}
	try {
		const sitemap = await lecteur.lire(CHEMIN_DU_SITEMAP)
		if (sitemap.statut !== 200)
			return { verdict: 'rouge', constats: [`${CHEMIN_DU_SITEMAP} : réponse ${sitemap.statut}`] }

		const fin = maintenant()
		const requete = new URLSearchParams({
			from: new Date(fin.getTime() - SEMAINE_MS).toISOString(),
			to: fin.toISOString(),
		})
		const stats = await lecteur.lire(`${CHEMIN_DES_STATS}?${requete}`, { authorization: `Bearer ${jeton}` })
		if (stats.statut === 401)
			return {
				verdict: 'rouge',
				constats: ['la route des statistiques refuse le jeton (401) : le jeton est faux ou périmé'],
			}
		if (stats.statut !== 200)
			return { verdict: 'rouge', constats: [`la route des statistiques répond ${stats.statut}, 200 attendu`] }
		const slugs = slugsPubliables(stats.corps)
		if (slugs === undefined)
			return {
				verdict: 'rouge',
				constats: ['la réponse des statistiques n’a pas la forme attendue (publiables.slugs)'],
			}

		const { egal, constats } = comparer(cheminsDeProfils(sitemap.corps), slugs.map(profilePath))
		return { verdict: egal ? 'vert' : 'rouge', constats }
	} catch (erreur) {
		if (erreur instanceof RequeteInterdite) throw erreur
		return { verdict: 'rouge', constats: [raisonDe(erreur)] }
	}
}
