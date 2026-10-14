'use server'

import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { generatePayloadCookie, getPayload } from 'payload'
import { connecter } from '@/lib/auth/connexion'
import type { CodeErreur } from '@/lib/auth/erreurs'
import { finDeVieDuCookie, lireExpiration } from '@/lib/auth/etat-session'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { retourSur } from '@/lib/auth/retour'

export type EtatDeConnexion = { code: CodeErreur } | null

/**
 * The sign-in form (ticket 074). Gives back an error code, never the account nor the token; on
 * success the session cookie is set and the visitor is sent to the page she asked for.
 *
 * Next refuses a Server Action called from another origin before this code runs. The origin is
 * checked here as well against the origins Payload trusts, so that the rule is written down and
 * does not depend on a Next setting.
 */
export async function seConnecter(_precedent: EtatDeConnexion, formulaire: FormData): Promise<EtatDeConnexion> {
	const payload = await getPayload({ config })
	const entetes = await headers()
	const origine = entetes.get('origin')
	if (origine !== null && !payload.config.csrf.includes(origine)) return { code: 'identifiants-invalides' }

	const resultat = await connecter({
		ouvrir: data => ouvrirParMotDePasse(payload, 'pros', data),
		headers: entetes,
		email: formulaire.get('email'),
		password: formulaire.get('password'),
	})
	if (!resultat.ok) return { code: resultat.code }

	const auth = payload.collections.pros.config.auth
	const cookie = generatePayloadCookie({
		collectionAuthConfig: auth,
		cookiePrefix: payload.config.cookiePrefix,
		returnCookieAsObject: true,
		token: resultat.token,
	})
	// The cookie outlives its token, so that a visitor whose session ended is told so (ticket 080).
	const finDuJeton = lireExpiration(resultat.token)
	;(await cookies()).set(cookie.name, resultat.token, {
		domain: auth.cookies.domain,
		expires:
			finDuJeton === null ? (cookie.expires ? new Date(cookie.expires) : undefined) : finDeVieDuCookie(finDuJeton),
		httpOnly: true,
		sameSite: typeof auth.cookies.sameSite === 'string' ? (auth.cookies.sameSite.toLowerCase() as 'lax') : 'lax',
		secure: auth.cookies.secure || false,
	})

	const site = process.env.NEXT_PUBLIC_SITE_URL ?? origine ?? 'http://localhost'
	const destination = retourSur(formulaire.get('callbackUrl'), site)
	// `redirect` throws: it stays outside any try/catch.
	redirect(destination)
}
