import { ToastContainer } from 'react-toastify'

import Script from 'next/script'

import SessionProvider from '@/components/Providers/SessionProvider'

import 'material-icons/iconfont/material-icons.css'
import 'react-toastify/dist/ReactToastify.css'
import '@/styles/burger_menu.css'
import '@/styles/globals.css'
import '@/styles/loader.css'
import '@/styles/stars.css'
import '@/styles/blog.css'

export const metadata = {
	description:
		"Trouvez la meilleure maquilleuse professionnelle à domicile près de chez. Une maquilleuse rien que pour vous,pour un événement, un shooting, ou une soirée, vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation ! Inscription gratuite.",
	title: 'My-Makeup',
}

export default function RootLayout({ children }) {
	return (
		<html lang="fr">
			<Script
				async
				data-domains={'my-makeup.fr'}
				data-website-id="e7010ee5-a940-4add-80bf-5483d2c515db"
				src="https://umami.wadefade.fr/script.js"
				strategy={'afterInteractive'}
			/>
			<Script
				src="https://www.googletagmanager.com/gtag/js?id=G-6Z5K42B5YH"
				strategy={'afterInteractive'}
			/>
			<Script id={'analytics'} strategy="afterInteractive">
				{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-6Z5K42B5YH');
        `}
			</Script>
			<body className={'bg-neutral-50'}>
				<main>
					<SessionProvider>
						{children}
						<ToastContainer />
					</SessionProvider>
				</main>
			</body>
		</html>
	)
}
