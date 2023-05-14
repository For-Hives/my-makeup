import { Head, Html, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default function Document() {
	return (
		<Html lang="fr">
			<Head>
				<link rel="icon" href="/favicon.webp" />
				<Script
					strategy={'afterInteractive'}
					src="https://www.googletagmanager.com/gtag/js?id=G-7M05RC6YDH"
				/>
				<Script id={'analytics'} strategy="afterInteractive">
					{`
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
    
                        gtag('config', 'G-7M05RC6YDH');
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
