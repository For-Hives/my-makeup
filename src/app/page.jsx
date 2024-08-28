import Head from 'next/head'
import Hero from '@/components/Global/Hero'
import Presentation from '@/components/Home/Presentation'
import Talents from '@/components/Home/Talents'
import Collaboration from '@/components/Home/Collaboration'
import React from 'react'
import Project from '@/components/Home/Project'
import CTA from '@/components/Global/CTA'
import MOTD from '@/services/MOTD'
import Nav from "@/components/Global/Nav";

async function getTalents() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/talents`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
    })

    console.log(res)

    if (!res.ok) {
        throw new Error('Failed to fetch talents')
    }

    return res.json()
}

export default async function Home() {
    const talents = await getTalents()

    MOTD()

    return (
        <>
            <Head>
                <title>
                    Accueil - My-Makeup le moteur de recherche pour les maquilleuses
                </title>
                <meta
                    name="description"
                    content="Trouvez la meilleure maquilleuse professionnelle à domicile près de. Une maquilleuse rien que pour vous,pour un événement, un shooting, ou une soirée,
                    vous trouverez votre bonheur pour vous sublimer dans n'importe quelle situation ! Inscription gratuite."
                />
                <link rel="canonical" href="https://my-makeup.fr" />
            </Head>

            <Nav/>
            <main className={'relative'}>
                <Hero
                    title={
                        <>
                            Trouver la maquilleuse qui vous correspond n&apos;a jamais été
                            aussi simple
                        </>
                    }
                    description={
                        <>
                            Trouvez la maquilleuse spécialisée dans le domaine que vous
                            recherchez, maquillage pour les mariées, maquillage de soirée,
                            maquillage professionnel...
                        </>
                    }
                />
                <Presentation />
                <Talents talents={talents.data} />
                <Collaboration />
                <Project />
                <CTA />
            </main>
        </>
    )
}