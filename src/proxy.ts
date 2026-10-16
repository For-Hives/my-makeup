import { type NextRequest, NextResponse } from 'next/server'
import {
	COOKIE_DE_MESSAGE,
	cookieDEffacement,
	DUREE_DU_MESSAGE_EN_SECONDES,
	ENTETE_DE_MESSAGE,
	planDeNettoyage,
	VARIABLE_DE_BASCULE,
} from '@/lib/auth/cookies-herites'
import { COOKIE_DE_SESSION, decisionDeLEspace, estPagePrivee } from '@/lib/auth/espace-ferme'
import { ipClient } from '@/lib/auth/ip-client'
import { COOKIE_DE_REINITIALISATION, planDuLien } from '@/lib/auth/mot-de-passe-oublie'
import { ENTETES_DE_RELAIS, pageDeRelais, venueDUnAutreSite } from '@/lib/auth/page-de-relais'
import { CHEMIN_DE_L_INSCRIPTION, CHEMIN_DU_REFUS, secondesAvantUneInscription } from '@/lib/auth/refus-inscription'
import {
	CHEMIN_DU_CONTACT,
	CHEMIN_DU_REFUS_DE_CONTACT,
	secondesAvantUnMessageDeCetteRequete,
} from '@/lib/contact/frein'
import { freinerLaRecherche } from '@/lib/recherche/frein'
import { robotsPourChemin } from '@/lib/seo/robots'
import { redirectionDeForme } from '@/lib/urls/forme'

/**
 * One proxy, no matcher: it runs for every request.
 * - A repeated slash or a final slash answers one redirect to the final address (ticket 072): Next's own
 *   redirect of the final slash is off (next.config.ts), so that no address makes two hops.
 * - The private pages of the space answer one redirection to the sign-in page when no session cookie
 *   comes with the request (ticket 075), or when its end date has passed (ticket 080: with the
 *   « session expirée » message). The authoritative check is the page's own (`exigerMaquilleuse`).
 * - The link of a forgotten-password mail (`/auth/reinitialiser?code=…`) answers one redirection to the bare
 *   page, the code kept in a cookie of that page only (ticket 085): it never reaches a page, the audience
 *   measurement, the history or a Referer.
 * - The search answers 429, in French, past 60 requests a minute from one address (ticket 100). No other
 *   page is braked.
 * - The cookies of the old authentication are expired on the first request, and the sign-in page tells
 *   once to sign in again (ticket 081). The back-office, the API and the files are left alone.
 * - A sign-up past the 5 an hour of its client address is sent to the route that answers 429 (ticket 084).
 * - A contact message past the 5 an hour of its client address, or the 20 a day of its mailbox (read from a
 *   copy of the body), is sent to the route that answers 429 (ticket 161). That path alone answers a promise.
 * - A private page asked with a session cookie by a navigation another site started (`Sec-Fetch-Site:
 *   cross-site`, a link in a mail) answers the relay page of the return from Google (ticket 223): Payload
 *   ignores the cookie of a cross-site request with no `Origin`, and the relay restarts the navigation
 *   from the site itself.
 * - A path that does not decode (`/profil/%E0%A4%A`) answers the 404 page of the site, not Next's error; under
 *   `/api/` it answers a JSON 400 (ticket 223).
 * - A response that carries a cookie of the cleaning is `private, no-store`: no shared cache keeps it (ticket 223).
 * - Every other response gets the robots directive (ticket 070). It reads APP_ENV at run time: the
 *   pre-production gets its variables after the build. The paths of the account and of the search
 *   answer noindex everywhere.
 */
function proxyDuSite(requete: NextRequest) {
	const { pathname, search } = requete.nextUrl
	if (pathname.startsWith('/api/') && !decodable(pathname)) {
		// Under the API Next would answer a 500 and an error-level line: a client error is a 400 in JSON.
		const refus = NextResponse.json({ errors: [{ message: 'Adresse illisible.' }] }, { status: 400 })
		refus.headers.set('X-Robots-Tag', 'noindex')
		return refus
	}
	if (cheminIllisible(pathname)) {
		// An address Next cannot decode answers its own error page: the 404 of the site is what a visitor expects.
		const introuvable = NextResponse.rewrite(new URL(CHEMIN_INTROUVABLE, requete.url ?? requete.nextUrl.href))
		introuvable.headers.set('X-Robots-Tag', 'noindex')
		return introuvable
	}
	// The path as the visitor wrote it: `nextUrl.pathname` may already have lost a repeated slash.
	const forme = redirectionDeForme(cheminEcrit(requete.url ?? requete.nextUrl.href) ?? pathname)
	if (forme) {
		// A new URL on the host of the request: cloning `nextUrl` would keep the final slash it had.
		const redirectionDeForme = NextResponse.redirect(
			new URL(`${forme.chemin}${search}`, requete.url ?? requete.nextUrl.href),
			forme.status
		)
		const consigneDeForme = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
		if (consigneDeForme) redirectionDeForme.headers.set('X-Robots-Tag', consigneDeForme)
		return redirectionDeForme
	}
	const freinee = freinerLaRecherche({ chemin: pathname, methode: requete.method, entetes: requete.headers })
	if (freinee) {
		const reponseFreinee = new NextResponse(freinee.corps, { status: freinee.status, headers: freinee.entetes })
		const consigneFreinee = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
		if (consigneFreinee) reponseFreinee.headers.set('X-Robots-Tag', consigneFreinee)
		return reponseFreinee
	}
	const nettoyage = planDeNettoyage({
		chemin: pathname,
		noms: requete.cookies.getAll().map(cookie => cookie.name),
		prechargement: requete.headers.has('next-router-prefetch') || requete.headers.get('purpose') === 'prefetch',
		maintenant: new Date(),
		basculeLe: process.env[VARIABLE_DE_BASCULE],
	})
	// The header is the proxy's alone: whatever a visitor sends under that name is dropped.
	const entetes = new Headers(requete.headers)
	entetes.delete(ENTETE_DE_MESSAGE)
	if (nettoyage.afficherLeMessage) entetes.set(ENTETE_DE_MESSAGE, '1')
	if (
		requete.method === 'POST' &&
		pathname === CHEMIN_DE_L_INSCRIPTION &&
		secondesAvantUneInscription(ipClient(requete.headers)) !== undefined
	) {
		// Past 5 sign-ups an hour from this address (ticket 084): a Server Action cannot answer 429
		// itself, so the request is sent to the route that does, before the action runs.
		return NextResponse.rewrite(new URL(CHEMIN_DU_REFUS, requete.url ?? requete.nextUrl.href))
	}
	const avecLeNettoyage = (reponse: NextResponse): NextResponse => {
		if (nettoyage.aEffacer.length > 0 || nettoyage.retenirLeMessage || nettoyage.oublierLeMessage)
			// A page that sets a cookie is for this visitor alone (ticket 223).
			reponse.headers.set('Cache-Control', 'private, no-store')
		for (const nom of nettoyage.aEffacer) reponse.cookies.set(cookieDEffacement(nom))
		if (nettoyage.retenirLeMessage)
			reponse.cookies.set({
				name: COOKIE_DE_MESSAGE,
				value: '1',
				maxAge: DUREE_DU_MESSAGE_EN_SECONDES,
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
			})
		if (nettoyage.oublierLeMessage)
			reponse.cookies.set({
				name: COOKIE_DE_MESSAGE,
				value: '',
				maxAge: 0,
				expires: new Date(0),
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
			})
		return reponse
	}
	const lien = planDuLien(pathname, requete.nextUrl.searchParams)
	if (lien) {
		const cible = requete.nextUrl.clone()
		cible.pathname = lien.aller
		cible.search = ''
		// 303: whatever the method, the next request is a GET of the bare page.
		const redirection = NextResponse.redirect(cible, 303)
		redirection.cookies.set({
			name: COOKIE_DE_REINITIALISATION,
			value: lien.cookie.valeur,
			maxAge: lien.cookie.maxAgeS,
			path: lien.aller,
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
		})
		redirection.headers.set('Cache-Control', 'private, no-store')
		redirection.headers.set('Referrer-Policy', 'no-referrer')
		const consigneDuLien = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
		if (consigneDuLien) redirection.headers.set('X-Robots-Tag', consigneDuLien)
		return avecLeNettoyage(redirection)
	}
	const vers = decisionDeLEspace(
		pathname,
		search,
		requete.cookies.get(COOKIE_DE_SESSION)?.value,
		Math.floor(Date.now() / 1000),
		requete.method
	)
	if (vers) {
		// Built from the URL of the request, so the host is the one the visitor used (the Host header the proxy forwards).
		const cible = requete.nextUrl.clone()
		const [chemin = '', recherche = ''] = vers.split('?')
		cible.pathname = chemin
		cible.search = recherche ? `?${recherche}` : ''
		const redirection = NextResponse.redirect(cible, 307)
		const consigneRedirection = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
		if (consigneRedirection) redirection.headers.set('X-Robots-Tag', consigneRedirection)
		return avecLeNettoyage(redirection)
	}
	if (requete.method === 'GET' && estPagePrivee(pathname) && venueDUnAutreSite(requete.headers)) {
		// She comes from another site with a session cookie that Payload would ignore (ticket 223): the
		// relay page restarts the navigation from this site, where the cookie counts.
		const relais = new NextResponse(pageDeRelais(`${pathname}${search}`), { status: 200, headers: ENTETES_DE_RELAIS })
		const consigneDuRelais = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
		if (consigneDuRelais) relais.headers.set('X-Robots-Tag', consigneDuRelais)
		return avecLeNettoyage(relais)
	}
	const reponse = avecLeNettoyage(NextResponse.next({ request: { headers: entetes } }))
	const consigne = robotsPourChemin(pathname, { APP_ENV: process.env.APP_ENV })
	if (consigne) reponse.headers.set('X-Robots-Tag', consigne)
	return reponse
}

/** Where an address that does not decode is sent: no page lives there, so Next answers its 404 page. */
const CHEMIN_INTROUVABLE = '/introuvable-adresse-illisible'

/** True when the path has a percent sequence that does not decode, outside the API and Next's own files. */
function cheminIllisible(chemin: string): boolean {
	if (chemin.startsWith('/api/') || chemin.startsWith('/_next/')) return false
	return !decodable(chemin)
}

function decodable(chemin: string): boolean {
	try {
		decodeURIComponent(chemin)
		return true
	} catch {
		return false
	}
}

/** The path of a request URL, with its repeated slashes: `new URL` keeps them, but not a base that swallows them. */
function cheminEcrit(url: string): string | undefined {
	const debut = url.indexOf('://')
	if (debut === -1) return undefined
	const reste = url.slice(url.indexOf('/', debut + 3))
	return reste.split(/[?#]/, 1)[0]
}

/**
 * Next calls this and awaits what it returns. The type says `NextResponse`, as every path but one answers at
 * once; a contact POST answers a promise of one (the mailbox is read from the body), which only Next
 * and `proxyDuContact` rely on.
 */
export function proxy(requete: NextRequest): NextResponse
export function proxy(requete: NextRequest): NextResponse | Promise<NextResponse> {
	const reponse = proxyDuSite(requete)
	if (requete.method !== 'POST' || requete.nextUrl.pathname !== CHEMIN_DU_CONTACT) return reponse
	// A redirect of form (repeated or final slash) comes first, as for every other path.
	if (reponse.headers.has('location')) return reponse
	return proxyDuContact(requete, reponse)
}

/** The contact POST: past a brake (ticket 161), the request is rewritten to the route that answers 429 (same device as the sign-up, ticket 084). */
export async function proxyDuContact(requete: NextRequest, reponse = proxyDuSite(requete)): Promise<NextResponse> {
	const attente = await secondesAvantUnMessageDeCetteRequete(requete, ipClient(requete.headers))
	if (attente === undefined) return reponse
	return NextResponse.rewrite(new URL(CHEMIN_DU_REFUS_DE_CONTACT, requete.url ?? requete.nextUrl.href))
}
