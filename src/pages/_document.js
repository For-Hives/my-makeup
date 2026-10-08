import { Head, Html, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default function Document() {
	return (
		<Html lang="fr">
			<Head>
				<link rel="icon" href="/favicon.webp" />
				<Script
					async
					src="https://umami.wadefade.fr/script.js"
					strategy={'afterInteractive'}
					data-domains={'my-makeup.fr'}
					data-website-id="e7010ee5-a940-4add-80bf-5483d2c515db"
				></Script>
			</Head>
			<body className={'bg-neutral-50'}>
				<Main />
				<NextScript />
			</body>
		</Html>
	)
}
