import 'material-icons/iconfont/material-icons.css'
import '@/styles/globals.css'
import '@/styles/stars.css'
import '@/styles/loader.css'
import '@/styles/blog.css'
import '@/styles/burger_menu.css'
import 'react-toastify/dist/ReactToastify.css'

import Head from 'next/head'
import { useRouter } from 'next/router'
import { useReportWebVitals } from 'next/web-vitals'
import { SessionProvider, useSession } from 'next-auth/react'
import { useEffect, useRef } from 'react'
import { ToastContainer } from 'react-toastify'
import { googleLoginResult, takeGoogleSignIn, track, trackWebVital } from '@/lib/analytics'
import { robotsPourChemin } from '@/lib/seo/robots'
import { webVitalsSampled } from '@/lib/web-vitals'

// Field Web Vitals (MES-10): drawn once per page load (10 % by default,
// NEXT_PUBLIC_WEB_VITALS_SAMPLE), and attributed to the page that was
// loaded, even when LCP, CLS or INP arrive after a client-side navigation.
const PAGE_CHARGEE = typeof window === 'undefined' ? null : window.location.pathname
const VITALS_ECHANTILLONNEES =
	PAGE_CHARGEE !== null && webVitalsSampled(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE, Math.random())

function reportWebVital(metric) {
	if (VITALS_ECHANTILLONNEES) trackWebVital(metric, PAGE_CHARGEE)
}

/**
 * `login_result` of a Google sign-in. Google sends the browser back to a new
 * page load, on any page of the site: the page asked for once signed in, the
 * sign-in page or /auth/error when it failed. The mark the Google button left
 * (markGoogleSignIn) is taken by the first page load that follows, whatever
 * its outcome, so one attempt is counted once and a reload counts nothing.
 * Renders nothing.
 */
function RetourGoogle() {
	const { status } = useSession()
	const router = useRouter()
	// null until the mark is read, then whether an outcome is still to count
	const aCompter = useRef(null)
	useEffect(() => {
		if (aCompter.current === null) aCompter.current = takeGoogleSignIn()
		// the outcome is read once the URL and the session are known
		if (!aCompter.current || !router.isReady || status === 'loading') return
		aCompter.current = false
		const resultat = googleLoginResult({
			pathname: router.pathname,
			error: router.query.error,
			status,
		})
		if (resultat) track('login_result', resultat)
	}, [router.isReady, router.pathname, router.query.error, status])
	return null
}

export default function App({ Component, pageProps: { session, ...pageProps }, router }) {
	// next/web-vitals: in Next 15 the reportWebVitals export of _app only
	// receives the Next.js marks, this hook gets LCP, CLS, INP, FCP and TTFB
	useReportWebVitals(reportWebVital)
	// /auth/*, /search and the error pages are never indexed (SEO-10)
	const robots = robotsPourChemin(router?.pathname)
	return (
		<>
			<Head>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				{robots && <meta key="robots" name="robots" content={robots} />}
			</Head>
			<SessionProvider
				session={session}
				// Session read every 15 min and when the tab gets the focus back;
				// Strapi itself is asked at most once per 15 min (A1, AUTH-06)
				refetchInterval={15 * 60}
				refetchOnWindowFocus={true}
			>
				<RetourGoogle />
				<Component {...pageProps} />
				<ToastContainer />
			</SessionProvider>
		</>
	)
}
