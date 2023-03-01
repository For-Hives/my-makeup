import Head from 'next/head'
import {Inter} from 'next/font/google'
import Hero from "@/components/hero";
import Nav from "@/components/nav";
import Presentation from "@/components/presentation";

const inter = Inter({subsets: ['latin']})

export default function Home() {
    return (
        <>
            <Head>
                <title>My Makeup</title>
                <meta name="description" content="Ma maquilleuse directement chez moi, ou pour un événement,
        vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation !"/>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
                <link rel="icon" href="/favicon.ico"/>
                <link rel="stylesheet"
                      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"/>

            </Head>
            <main>
                <Nav/>
                <Hero/>
                <Presentation/>
            </main>
        </>
    )
}
