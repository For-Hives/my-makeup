import { ToastContainer } from 'react-toastify'

import { SessionProvider } from 'next-auth/react'
import Head from 'next/head'

import 'material-icons/iconfont/material-icons.css'
import 'react-toastify/dist/ReactToastify.css'
import '@/styles/burger_menu.css'
import '@/styles/globals.css'
import '@/styles/loader.css'
import '@/styles/stars.css'
import '@/styles/blog.css'

export default function App({
	pageProps: { session, ...pageProps },
	Component,
}) {
	return (
		<>
			<Head>
				<meta content="width=device-width, initial-scale=1" name="viewport" />
			</Head>
			<SessionProvider session={session}>
				<Component {...pageProps} />
				<ToastContainer />
			</SessionProvider>
		</>
	)
}
