import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

export default function Document() {
    return (<Html lang="fr">
        <Head>
            <link rel="icon" href="/favicon.webp"/>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"/>
            <Script strategy={"afterInteractive"} src="https://www.googletagmanager.com/gtag/js?id=G-7M05RC6YDH"/>
            <Script id={"analytics"} strategy="afterInteractive">
                {`
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
    
                        gtag('config', 'G-7M05RC6YDH');
                    `}
				</Script>
			</Head>
			<body>
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
