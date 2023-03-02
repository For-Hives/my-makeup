import {Html, Head, Main, NextScript} from 'next/document'
import Script from "next/script";

export default function Document() {
    return (
        <Html lang="fr">
            <Head>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
                <link rel="icon" href="/favicon.ico"/>
                <link rel="stylesheet"
                      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=optional"/>
                <Script async src="https://www.googletagmanager.com/gtag/js?id=G-7M05RC6YDH"></Script>
                <Script id={"script"}>
                    dangerouslySetInnerHTML={{
                    __html: `
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());

                    gtag('config', 'G-7M05RC6YDH');
                    `,
                }}
                </Script>
            </Head>

            <body>
            <Main/>
            <NextScript/>
            </body>
        </Html>
    )
}
