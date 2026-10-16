import { type ContenuPublic, type EtatPublic, PAGES_PUBLIQUES } from '../revalidation'
import { estUnSlug } from '../slug'
import { SITE_ORIGIN } from '../urls-gelees'
import { urlCanonique } from './url'

/**
 * IndexNow (ticket 219; plan 03 SEO-28): when a public page changes, the engines of the protocol
 * (Bing, Yandex, Seznam, Naver, Yep; not Google) are told its address, where the refresh of the pages
 * happens (src/collections/revalidation.ts).
 *
 * - The key is the variable INDEXNOW_KEY, never a file of the repository. The site serves it at
 *   `/<key>.txt` (src/app/api/indexnow/[cle]/route.ts). Without the variable, nothing is served and
 *   nothing is sent.
 * - Only the main host is ever named: every address is built from `SITE_ORIGIN`, and one that is not
 *   an https address of that host is dropped before the request.
 * - Nothing is sent from the test bench or a work station: the apex is not the
 *   address they are served from (`cleSiLEnvoiEstPermis`).
 * - A failed request never undoes a save: it leaves a line in the log, with no key and no address.
 *
 * No `next` import: this file is loaded by the Payload CLI, outside of Next, and tested without it.
 */

/** The endpoint shared by all the engines of the protocol: one request reaches them all. */
export const POINT_D_ENVOI = 'https://api.indexnow.org/indexnow'

/** The key as the frozen address `/<clé>.txt` allows it (docs/migration/URLS.md): 32 hexadecimal characters. */
export const FORMAT_DE_LA_CLE = /^[0-9a-f]{32}$/

/** The protocol takes at most 10 000 addresses in one request. */
export const ADRESSES_PAR_ENVOI = 10_000

/**
 * The wait before a request leaves, so that the save is committed when an engine comes to read the
 * page, and so that the addresses of several saves close together leave in one request.
 */
export const DELAI_AVANT_ENVOI_MS = 5000

/** Past this, a request is given up. */
export const DELAI_MAX_DE_L_ENVOI_MS = 10_000

/** The key of the variable, or nothing: unset, blank or unreadable. Read alone, like the other optional variables. */
export function cleIndexNow(valeur: string | undefined = process.env.INDEXNOW_KEY): string | undefined {
	const cle = valeur?.trim()
	return cle !== undefined && FORMAT_DE_LA_CLE.test(cle) ? cle : undefined
}

/** What the decision to send reads from the environment of the server. */
export interface EnvDeLEnvoi {
	INDEXNOW_KEY?: string | undefined
	NEXT_PUBLIC_SITE_URL?: string | undefined
	APP_ENV?: string | undefined
}

/**
 * The key to send under, or nothing when nothing must leave: no key, a server that is not the site
 * itself (a work station, the test bench), or an environment that says it is the bench.
 */
export function cleSiLEnvoiEstPermis(
	env: EnvDeLEnvoi = {
		INDEXNOW_KEY: process.env.INDEXNOW_KEY,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		APP_ENV: process.env.APP_ENV,
	}
): string | undefined {
	if (env.NEXT_PUBLIC_SITE_URL !== SITE_ORIGIN) return undefined
	if (env.APP_ENV?.trim() === 'test') return undefined
	return cleIndexNow(env.INDEXNOW_KEY)
}

/** Where the engines read the key: the file at the root of the main host. */
export const emplacementDeLaCle = (cle: string): string => `${SITE_ORIGIN}/${cle}.txt`

/** True for an https address of the main host, and nothing else. */
export function estUneAdresseDuSite(adresse: string): boolean {
	if (!URL.canParse(adresse)) return false
	const url = new URL(adresse)
	return url.protocol === 'https:' && url.origin === SITE_ORIGIN
}

/**
 * The addresses to tell the engines about for one save of a document, from its public state before
 * and after: the page of each version that was or is in the sitemap, so the old address and the new
 * one when the slug changed, and the address of a page that leaves the sitemap. Never a list page.
 * Nothing when the document was and is out of the sitemap, or has no real slug yet.
 */
export function adressesDuChangement(
	contenu: ContenuPublic,
	avant: EtatPublic | null,
	apres: EtatPublic | null
): string[] {
	const dansLeSitemap = [avant, apres].filter(
		(etat): etat is EtatPublic => etat !== null && etat.indexable !== false && etat.visible
	)
	const slugs = [...new Set(dansLeSitemap.map(({ slug }) => slug))].filter(estUnSlug)
	return slugs.map(slug => urlCanonique(PAGES_PUBLIQUES[contenu].page(slug))).filter(estUneAdresseDuSite)
}

/** The addresses a sitemap lists (`<loc>`), the ones of the main host only. */
export function adressesDuSitemap(xml: string): string[] {
	const decode = (texte: string) => texte.replace(/&amp;/g, '&')
	const locs = [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map(([, adresse]) => decode(adresse ?? ''))
	return [...new Set(locs.filter(estUneAdresseDuSite))]
}

/** The part of `fetch` the sending reads. */
export type Chercher = (adresse: string, options: RequestInit) => Promise<Pick<Response, 'status'>>

/** The log line of the sending: counts only, never the key and never an address. */
export interface Journal {
	info: (message: string) => void
	error: (message: string) => void
}

/**
 * Tells the engines about these addresses, in as many requests as the protocol needs (10 000 each).
 * Throws on a refusal or a network error, naming the status and never the key. 200 and 202 are
 * the answers of success.
 */
export async function envoyerAIndexNow(
	adresses: readonly string[],
	cle: string,
	chercher: Chercher = fetch
): Promise<void> {
	const aEnvoyer = [...new Set(adresses.filter(estUneAdresseDuSite))]
	for (let debut = 0; debut < aEnvoyer.length; debut += ADRESSES_PAR_ENVOI) {
		const reponse = await chercher(POINT_D_ENVOI, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
			body: JSON.stringify({
				host: new URL(SITE_ORIGIN).host,
				key: cle,
				keyLocation: emplacementDeLaCle(cle),
				urlList: aEnvoyer.slice(debut, debut + ADRESSES_PAR_ENVOI),
			}),
			signal: AbortSignal.timeout(DELAI_MAX_DE_L_ENVOI_MS),
		})
		if (reponse.status !== 200 && reponse.status !== 202) throw new Error(`IndexNow a répondu ${reponse.status}`)
	}
}

/** What the queue needs, all replaceable by a test. */
export interface DependancesDeLaFile {
	cle: string
	journal: Journal
	chercher?: Chercher
	delaiMs?: number
}

const enAttente = new Set<string>()
let minuteur: ReturnType<typeof setTimeout> | undefined
let dependances: DependancesDeLaFile | undefined

/**
 * Sends what is waiting, in one go. Never throws: a failure is logged and the addresses are given up
 * (the next change of the page tells the engines again).
 */
export async function viderLaFile(): Promise<void> {
	if (minuteur !== undefined) clearTimeout(minuteur)
	minuteur = undefined
	const adresses = [...enAttente]
	enAttente.clear()
	const courante = dependances
	if (adresses.length === 0 || courante === undefined) return
	try {
		await envoyerAIndexNow(adresses, courante.cle, courante.chercher)
		courante.journal.info(`[indexnow] ${adresses.length} address(es) sent`)
	} catch (erreur) {
		const raison = erreur instanceof Error ? erreur.message : 'unknown error'
		courante.journal.error(`[indexnow] ${adresses.length} address(es) not sent: ${raison}`)
	}
}

/**
 * Puts addresses in the queue; they leave together after a short wait, in one request, whatever the
 * number of saves that asked. The wait never keeps the process alive.
 */
export function signalerPlusTard(adresses: readonly string[], deps: DependancesDeLaFile): void {
	const valables = adresses.filter(estUneAdresseDuSite)
	if (valables.length === 0) return
	for (const adresse of valables) enAttente.add(adresse)
	dependances = deps
	if (minuteur !== undefined) return
	minuteur = setTimeout(() => void viderLaFile(), deps.delaiMs ?? DELAI_AVANT_ENVOI_MS)
	minuteur.unref?.()
}

/** The addresses waiting to leave. For the tests. */
export const adressesEnAttente = (): string[] => [...enAttente]

/** Forgets what is waiting, without sending. For the tests. */
export function oublierLaFile(): void {
	if (minuteur !== undefined) clearTimeout(minuteur)
	minuteur = undefined
	enAttente.clear()
	dependances = undefined
}
