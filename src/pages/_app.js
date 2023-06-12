import 'material-icons/iconfont/material-icons.css'
import '@/styles/globals.css'
import '@/styles/stars.css'
import '@/styles/loader.css'
import '@/styles/loader/escalator.css'
import '@/styles/blog.css'

import Head from 'next/head'
import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

export default function App({
	Component,
	pageProps: { session, ...pageProps },
}) {
	return (
		<>
			<Head>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</Head>
			<SessionProvider session={session}>
				<QueryClientProvider client={queryClient}>
					<Component {...pageProps} />
				</QueryClientProvider>
			</SessionProvider>
		</>
	)
}
