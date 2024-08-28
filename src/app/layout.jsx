import SessionProvider from '@/components/Providers/SessionProvider'
import 'material-icons/iconfont/material-icons.css'
import '@/styles/globals.css'
import '@/styles/stars.css'
import '@/styles/loader.css'
import '@/styles/blog.css'
import '@/styles/burger_menu.css'
import 'react-toastify/dist/ReactToastify.css'

import { ToastContainer } from 'react-toastify'
import Script from 'next/script'

export const metadata = {
    title: 'My-Makeup',
    description: 'My-Makeup application',
}

export default function RootLayout({ children }) {
    return (
        <html lang="fr">
        <head>
            <link rel="icon" href="/favicon.webp" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body className={'bg-neutral-50'}>
        <SessionProvider>
            {children}
            <ToastContainer />
        </SessionProvider>
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
        </body>
        </html>
    )
}