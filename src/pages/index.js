import Head from 'next/head'
import {Inter} from 'next/font/google'
import Hero from "@/components/Global/Hero";
import Nav from "@/components/Global/Nav";
import Presentation from "@/components/Home/Presentation";
import Footer from "@/components/Global/Footer";
import Talents from "@/components/Home/Talents";
import Collaboration from "@/components/Home/Collaboration";

const inter = Inter({subsets: ['latin']})

export default function Home() {
    return (<>
        <Head>
            <title>My Makeup</title>
            <meta name="description" content="Votre maquilleuse directement chez vous, pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation !"/>
        </Head>
        <main>
            <Nav/>
            <Hero/>
            <Presentation/>
            <Talents/>
            <Collaboration/>
            <Footer/>
        </main>
    </>)
}
