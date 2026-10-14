/**
 * The cookies of the old authentication (NextAuth v4) and the 90 days during which the proxy
 * expires them (ticket 081; plan 01 §2.3 and §2.4 M4; plan 02 U65, U66).
 *
 * A makeup artist who comes back after the switch still holds these cookies for the same host. The
 * new site does not read them: it expires them on the first request, and the sign-in page tells her
 * once to sign in again. Without this, the old cookies would stay in every request for months.
 *
 * The code is removed at the end of the window (ticket 207).
 */

/** How long, from the day of the switch, the old cookies are expired. */
export const JOURS_DE_NETTOYAGE = 90

/** The day of the switch, `YYYY-MM-DD`, read by the proxy. Unset: the cleaning has no end date. */
export const VARIABLE_DE_BASCULE = 'BASCULE_LE'

/** A short-lived cookie of this site, set when the old cookies are expired away from the sign-in page. */
export const COOKIE_DE_MESSAGE = 'mm-reconnexion'

/** The request header the proxy gives the sign-in page when the message is due. The proxy strips it from every request first. */
export const ENTETE_DE_MESSAGE = 'x-mm-reconnexion'

/** How long the message waits for the visitor to reach the sign-in page. */
export const DUREE_DU_MESSAGE_EN_SECONDES = 60 * 60

/**
 * The cookies NextAuth v4 sets: the session token (cut into `.0`, `.1`… chunks when it is long),
 * the CSRF token and the callback URL. With `useSecureCookies` (an https site) the names carry
 * `__Secure-`, and `__Host-` for the CSRF token; without it (http) they carry nothing.
 */
const COOKIE_HERITE = /^(?:__Secure-|__Host-)?next-auth\.(?:session-token(?:\.\d+)?|csrf-token|callback-url)$/

export const estCookieHerite = (nom: string): boolean => COOKIE_HERITE.test(nom)

/** The names, among those a request carries, that belong to the old authentication. */
export const cookiesHeritesPresents = (noms: Iterable<string>): string[] => [...noms].filter(estCookieHerite)

/** What NextAuth set the cookie with, and so what its expiry must repeat: any other attribute and the browser keeps the cookie. */
export type AttributsDeCookie = {
	path: '/'
	httpOnly: true
	sameSite: 'lax'
	secure: boolean
	/** NextAuth sets no `Domain`: the cookie belongs to the host alone (and `__Host-` forbids one). */
	domain: undefined
}

/** `Secure` goes with the prefixes, which a browser refuses without it. */
export const attributsDePose = (nom: string): AttributsDeCookie => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	secure: nom.startsWith('__Secure-') || nom.startsWith('__Host-'),
	domain: undefined,
})

/** The cookie that expires `nom`: an empty value, `Max-Age=0`, the attributes of its setting. */
export const cookieDEffacement = (nom: string) => {
	const { domain: _domain, ...attributs } = attributsDePose(nom)
	return { name: nom, value: '', maxAge: 0, expires: new Date(0), ...attributs }
}

/** The last day of the cleaning: the day of the switch plus 90 days (UTC), or nothing when it is unset or unreadable. */
export function finDuNettoyage(basculeLe: string | undefined): Date | undefined {
	const texte = basculeLe?.trim()
	if (!texte || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return undefined
	const debut = new Date(`${texte}T00:00:00Z`)
	if (Number.isNaN(debut.getTime()) || debut.toISOString().slice(0, 10) !== texte) return undefined
	return new Date(debut.getTime() + JOURS_DE_NETTOYAGE * 24 * 3600 * 1000)
}

/** Whether the proxy still expires the old cookies. Unset: yes, without end (the window starts with the switch). */
export function nettoyageActif(maintenant: Date, basculeLe: string | undefined): boolean {
	const fin = finDuNettoyage(basculeLe)
	return fin === undefined || maintenant.getTime() < fin.getTime()
}

/**
 * The paths the cleaning does not touch: the back-office, the API, the files of Next and every
 * file with an extension. A cookie set there would also reach a cache (U64).
 */
export function cheminSansNettoyage(chemin: string): boolean {
	if (chemin === '/admin' || chemin.startsWith('/admin/')) return true
	if (chemin === '/api' || chemin.startsWith('/api/')) return true
	if (chemin === '/_next' || chemin.startsWith('/_next/')) return true
	return /\.[A-Za-z0-9]+$/.test(chemin.slice(chemin.lastIndexOf('/') + 1))
}

/** What the proxy does with a request for the cleaning. */
export type PlanDeNettoyage = {
	/** The old cookies to expire. */
	aEffacer: string[]
	/** Give the sign-in page the header that shows the message. */
	afficherLeMessage: boolean
	/** Set the cookie that remembers the message for the visitor's next visit to the sign-in page. */
	retenirLeMessage: boolean
	/** Expire the cookie of the message: it is shown once. */
	oublierLeMessage: boolean
}

/**
 * The message is shown once: on the sign-in page, when the old cookies come with this very request or when an
 * earlier request left the reminder. A prefetch (Next fetching a link in advance) neither shows it nor uses it up.
 */
export function planDeNettoyage(requete: {
	chemin: string
	noms: Iterable<string>
	prechargement: boolean
	maintenant: Date
	basculeLe: string | undefined
}): PlanDeNettoyage {
	const rien: PlanDeNettoyage = {
		aEffacer: [],
		afficherLeMessage: false,
		retenirLeMessage: false,
		oublierLeMessage: false,
	}
	const noms = [...requete.noms]
	const rappel = noms.includes(COOKIE_DE_MESSAGE)
	if (cheminSansNettoyage(requete.chemin) || !nettoyageActif(requete.maintenant, requete.basculeLe)) return rien
	const aEffacer = cookiesHeritesPresents(noms)
	if (aEffacer.length === 0 && !rappel) return rien
	const surLaConnexion = requete.chemin === '/auth/signin' && !requete.prechargement
	return {
		aEffacer,
		afficherLeMessage: surLaConnexion,
		retenirLeMessage: aEffacer.length > 0 && !surLaConnexion,
		oublierLeMessage: rappel && surLaConnexion,
	}
}
