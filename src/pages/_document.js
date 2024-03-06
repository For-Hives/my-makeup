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
					data-website-id="e7010ee5-a940-4add-80bf-5483d2c515db"
				></Script>
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
			</Head>
			<body className={'bg-neutral-50'}>
				<Main />
				<NextScript />
			</body>
		</Html>
	)
}
