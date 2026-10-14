import { type NextRequest, NextResponse } from 'next/server'
import { robotsPourChemin } from '@/lib/seo/robots'

/**
 * Adds the robots directive to every response (ticket 070). It runs for each request, so it reads
 * APP_ENV at run time: the pre-production gets its variables after the build. The paths of the
 * account and of the search answer noindex everywhere.
 */
export function proxy(requete: NextRequest) {
	const reponse = NextResponse.next()
	const consigne = robotsPourChemin(requete.nextUrl.pathname, { APP_ENV: process.env.APP_ENV })
	if (consigne) reponse.headers.set('X-Robots-Tag', consigne)
	return reponse
}
