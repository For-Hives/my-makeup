import 'material-icons/iconfont/material-icons.css'
import '@/styles/globals.css'
import '@/styles/stars.css'
import '@/styles/loader.css'
import '@/styles/blog.css'
import '@/styles/burger_menu.css'
import 'react-toastify/dist/ReactToastify.css'

import Head from 'next/head'
import { SessionProvider } from 'next-auth/react'
import { ToastContainer } from 'react-toastify'
import { robotsPourChemin } from '@/lib/seo/robots'

export default function App({
	Component,
	pageProps: { session, ...pageProps },
	router,
}) {
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
				<Component {...pageProps} />
				<ToastContainer />
			</SessionProvider>
		</>
	)
}
