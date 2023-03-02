import Head from 'next/head'
import {Inter} from 'next/font/google'
import Hero from "@/components/Hero";
import Nav from "@/components/Nav";
import Presentation from "@/components/Presentation";
import Footer from "@/components/Footer";
import Script from "next/script";

const inter = Inter({subsets: ['latin']})

export default function Home() {
    return (
        <>
            <Head>
                <title>My Makeup</title>
                <meta name="description" content="Votre maquilleuse directement chez vous, pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation !"/>
            </Head>

            <main>
                <Nav/>
                <Hero/>
                <Presentation/>
                <Footer/>
            </main>
        </>
    )
}
