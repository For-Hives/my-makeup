/**
 * The check of the pre-production (ticket 027, docs/preprod.md), run by the CI after each push on
 * v3 (.github/workflows/preprod.yml) or by hand:
 *
 *   PREPROD_BASIC_AUTH_USER=… PREPROD_BASIC_AUTH_PASSWORD=… bun run preprod:controle
 *
 * 1. It waits until the pre-production serves the commit it is given (CONTROLE_PREPROD_COMMIT,
 *    read in the `version` of /api/health): Coolify deploys each push on v3 by itself.
 * 2. It reads the public page of the fictional profile 21 of the fake Strapi source, which the
 *    pre-production imports when it starts on an empty database. Green when the page answers 200
 *    with the name of the profile in its only h1, in the HTML of the server.
 *
 * GET only, through the protected access of the pre-production. The credentials come from the
 * environment (the secrets of the repository, in the CI), travel in one header and are never
 * printed. The site is never a target: the address is the pre-production, or this machine for a
 * check of a local build (CONTROLE_PREPROD_ADRESSE).
 *
 * No dependency, `fetch` only: the CI runs it without `bun install`, so that no code of a
 * dependency runs next to the secrets.
 */

/** The fictional profile 21 of the fake source, as its public page shows it (tests/outils/source-strapi/donnees.ts). */
export const PROFIL_FICTIF = { slug: 'zoe-lefevre', nom: 'Zoé Lefèvre' } as const

/** The address of the pre-production: the default target. */
export const ADRESSE_DE_LA_PREPROD = 'https://preprod.my-makeup.fr'

/** How long the check waits for the pre-production to serve the commit: a build and a start on Coolify. */
export const ATTENTE_MAX_MS = 20 * 60_000

/** Time between two readings of /api/health while the deployment runs. */
export const INTERVALLE_MS = 15_000

/** Longest wait for one answer. */
const DELAI_DE_REPONSE_MS = 15_000

/** The variables the check reads, all optional but the credentials of the pre-production. */
export type Variables = Partial<
	Record<
		'CONTROLE_PREPROD_ADRESSE' | 'CONTROLE_PREPROD_COMMIT' | 'PREPROD_BASIC_AUTH_PASSWORD' | 'PREPROD_BASIC_AUTH_USER',
		string
	>
>

/** The check cannot run as it is set: the message names the variable, never its value. */
export class ControleRefuse extends Error {
	override readonly name = 'ControleRefuse'
}

export interface Reglages {
	adresse: string
	/** The `Authorization` header of the protected access: nothing for a local build. */
	autorisation?: string
	/** The 7 first characters of the commit the pre-production must serve, or nothing: any version. */
	commit?: string
}

/** A local build: plain http on this machine, a port and nothing after it. */
function estUneAdresseLocale(adresse: string): boolean {
	let url: URL
	try {
		url = new URL(adresse)
	} catch {
		return false
	}
	return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.origin === adresse
}

/** Reads the variables, or `ControleRefuse` with what to fix. */
export function lireLesReglages(variables: Variables): Reglages {
	const adresse = variables.CONTROLE_PREPROD_ADRESSE?.trim() || ADRESSE_DE_LA_PREPROD
	const locale = estUneAdresseLocale(adresse)
	if (adresse !== ADRESSE_DE_LA_PREPROD && !locale)
		throw new ControleRefuse(
			`CONTROLE_PREPROD_ADRESSE refusée : le contrôle ne lit que la préprod (${ADRESSE_DE_LA_PREPROD}) ou un build de ce poste (http://127.0.0.1:PORT), jamais le site.`
		)

	const utilisateur = variables.PREPROD_BASIC_AUTH_USER ?? ''
	const motDePasse = variables.PREPROD_BASIC_AUTH_PASSWORD ?? ''
	if (!locale && (utilisateur === '' || motDePasse === ''))
		throw new ControleRefuse(
			'PREPROD_BASIC_AUTH_USER et PREPROD_BASIC_AUTH_PASSWORD sont obligatoires pour lire la préprod : en CI, ce sont deux secrets du dépôt (docs/preprod.md).'
		)

	const commit = variables.CONTROLE_PREPROD_COMMIT?.trim()
	if (commit !== undefined && commit !== '' && !/^[0-9a-f]{7,40}$/.test(commit))
		throw new ControleRefuse('CONTROLE_PREPROD_COMMIT refusée : attendu un commit, de 7 à 40 caractères hexadécimaux.')

	return {
		adresse,
		...(utilisateur !== '' && { autorisation: `Basic ${btoa(`${utilisateur}:${motDePasse}`)}` }),
		...(commit && { commit: commit.slice(0, 7) }),
	}
}

export type Lire = (adresse: string, init: RequestInit) => Promise<Response>

export interface Outils {
	lire: Lire
	journal: (ligne: string) => void
	/** Waits this many milliseconds. */
	attendre: (ms: number) => Promise<void>
	/** The time, in milliseconds. */
	maintenant: () => number
	attenteMaxMs?: number
	intervalleMs?: number
}

/** A GET of the pre-production: the access header, no redirect followed, a time limit. */
function obtenir({ adresse, autorisation }: Reglages, chemin: string, lire: Lire): Promise<Response> {
	return lire(`${adresse}${chemin}`, {
		headers: autorisation ? { Authorization: autorisation } : {},
		redirect: 'manual',
		signal: AbortSignal.timeout(DELAI_DE_REPONSE_MS),
	})
}

/** What went wrong with a request: its code, never its text. */
function raison(erreur: unknown): string {
	const cause = (erreur as { cause?: { code?: unknown } } | null)?.cause
	const code = typeof cause?.code === 'string' ? cause.code : (erreur as { name?: unknown } | null)?.name
	return typeof code === 'string' && /^[\w-]{1,40}$/.test(code) ? code : 'erreur'
}

/**
 * Waits until /api/health answers 200 with the commit asked for, or with any version when none
 * is asked for. Each new answer is said once. Throws when the time is up.
 */
export async function attendreLaVersion(reglages: Reglages, outils: Outils): Promise<string> {
	const { lire, journal, attendre, maintenant, attenteMaxMs = ATTENTE_MAX_MS, intervalleMs = INTERVALLE_MS } = outils
	const fin = maintenant() + attenteMaxMs
	let derniere = ''
	for (;;) {
		let vue: string
		try {
			const reponse = await obtenir(reglages, '/api/health', lire)
			// Wrong or missing credentials do not get better by waiting.
			if (reponse.status === 401)
				throw new ControleRefuse(
					'La préprod refuse l’accès (401) : PREPROD_BASIC_AUTH_USER et PREPROD_BASIC_AUTH_PASSWORD ne sont pas ceux de son accès protégé.'
				)
			const corps = reponse.status === 200 ? ((await reponse.json()) as { version?: unknown }) : undefined
			const version = typeof corps?.version === 'string' ? corps.version : undefined
			if (version !== undefined && (reglages.commit === undefined || version === reglages.commit)) {
				journal(`Version servie : ${version}${reglages.commit ? ', celle du commit attendu' : ''}.`)
				return version
			}
			vue = version === undefined ? `/api/health répond ${reponse.status}` : `version servie ${version}`
		} catch (erreur) {
			if (erreur instanceof ControleRefuse) throw erreur
			vue = `/api/health ne répond pas (${raison(erreur)})`
		}
		if (vue !== derniere) {
			journal(
				`${vue} ; attendue : ${reglages.commit ?? 'une réponse 200'}. Nouvel essai toutes les ${intervalleMs / 1000} s.`
			)
			derniere = vue
		}
		if (maintenant() + intervalleMs > fin)
			throw new ControleRefuse(
				`La préprod ne sert pas ${reglages.commit ? `le commit ${reglages.commit}` : 'de version'} après ${Math.round(attenteMaxMs / 60_000)} minutes (${vue}) : le déploiement est en retard ou en échec, voir Coolify.`
			)
		await attendre(intervalleMs)
	}
}

/** The text of each h1 of the HTML, tags inside removed, the few entities React writes decoded. */
export function titresDeLaPage(html: string): string[] {
	const entites: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" }
	return [...html.matchAll(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/g)].map(([, contenu]) =>
		(contenu ?? '')
			.replace(/<[^>]*>/g, '')
			.replace(/&amp;|&lt;|&gt;|&quot;|&#x27;/g, entite => entites[entite] ?? entite)
			.trim()
	)
}

/** What is wrong with the page of the fictional profile: nothing when it answers 200 with the name in its only h1. */
export function defautsDeLaPage(statut: number, html: string): string[] {
	if (statut !== 200) return [`la page répond ${statut}, pas 200`]
	const titres = titresDeLaPage(html)
	if (titres.length !== 1) return [`la page porte ${titres.length} titres h1, il en faut un seul`]
	return titres[0] === PROFIL_FICTIF.nom ? [] : [`le h1 de la page n’est pas « ${PROFIL_FICTIF.nom} »`]
}

/** Reads the page of the fictional profile, once. Throws with what is wrong. */
export async function lireLeProfilFictif(reglages: Reglages, outils: Pick<Outils, 'lire' | 'journal'>): Promise<void> {
	const chemin = `/profil/${PROFIL_FICTIF.slug}`
	const reponse = await obtenir(reglages, chemin, outils.lire)
	const defauts = defautsDeLaPage(reponse.status, reponse.status === 200 ? await reponse.text() : '')
	if (defauts.length > 0) throw new ControleRefuse(`Profil fictif ${chemin} : ${defauts.join(' ; ')}.`)
	outils.journal(`Profil fictif ${chemin} : 200, « ${PROFIL_FICTIF.nom} » dans le seul h1 du HTML du serveur.`)
}

/** The whole check. Exit code 0 when the page is there, 1 otherwise. */
export async function controler(variables: Variables, outils: Outils): Promise<number> {
	try {
		const reglages = lireLesReglages(variables)
		outils.journal(`Contrôle de ${reglages.adresse}.`)
		await attendreLaVersion(reglages, outils)
		await lireLeProfilFictif(reglages, outils)
		return 0
	} catch (erreur) {
		const message =
			erreur instanceof ControleRefuse
				? erreur.message
				: `une requête a échoué (${raison(erreur)}), sans réponse lisible.`
		outils.journal(`Contrôle de la préprod en échec : ${message}`)
		return 1
	}
}

if (import.meta.main)
	process.exit(
		await controler(
			{
				CONTROLE_PREPROD_ADRESSE: process.env.CONTROLE_PREPROD_ADRESSE,
				CONTROLE_PREPROD_COMMIT: process.env.CONTROLE_PREPROD_COMMIT,
				PREPROD_BASIC_AUTH_PASSWORD: process.env.PREPROD_BASIC_AUTH_PASSWORD,
				PREPROD_BASIC_AUTH_USER: process.env.PREPROD_BASIC_AUTH_USER,
			},
			{
				lire: (adresse, init) => fetch(adresse, init),
				journal: ligne => console.log(ligne),
				attendre: ms => Bun.sleep(ms),
				maintenant: () => Date.now(),
			}
		)
	)
