import Script from 'next/script'

import 'material-icons/iconfont/material-icons.css'
import '@/styles/globals.css'
import '@/styles/stars.css'
import '@/styles/loader.css'
import '@/styles/blog.css'
import '@/styles/burger_menu.css'
import 'react-toastify/dist/ReactToastify.css'

import { ToastContainer } from 'react-toastify'
import SessionProviderWrapper from 'providers/SessionProviderWrapper'

export const metadata = {
	title: 'My-Makeup',
	description:
		"Trouvez la meilleure maquilleuse professionnelle à domicile près de chez. Une maquilleuse rien que pour vous,pour un événement, un shooting, ou une soirée, vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation ! Inscription gratuite.",
}

export default function RootLayout({ children }) {
	return (
		<html lang="fr">
			<Script
				async
				src="https://umami.wadefade.fr/script.js"
				strategy={'afterInteractive'}
				data-domains={'my-makeup.fr'}
				data-website-id="e7010ee5-a940-4add-80bf-5483d2c515db"
			/>
			<Script
				strategy={'afterInteractive'}
				src="https://www.googletagmanager.com/gtag/js?id=G-6Z5K42B5YH"
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
					<SessionProviderWrapper>
						{children}
						<ToastContainer />
					</SessionProviderWrapper>
				</main>
			</body>
		</html>
	)
}
