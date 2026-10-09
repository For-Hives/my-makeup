import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import { demandeEnvoyeeProps, track } from '@/lib/analytics'

/**
 * Thank-you page the external quote form redirects to (F3a), e.g.
 * /demande-envoyee?pid=12&source=profil. Counts `demande_envoyee` once.
 */
function DemandeEnvoyee() {
	const router = useRouter()
	const counted = useRef(false)

	useEffect(() => {
		if (!router.isReady || counted.current) return
		counted.current = true
		track('demande_envoyee', demandeEnvoyeeProps(router.query))
	}, [router.isReady, router.query])

	return (
		<>
			<Head>
				<title>Demande envoyée - My-Makeup</title>
				<meta name="robots" content="noindex" />
			</Head>
			<Nav />
			<main className={'relative'}>
				<Hero
					title={<>Votre demande est transmise</>}
					description={'Vous recevrez une réponse sous 48 h. Merci de votre confiance !'}
					isSearchDisplayed={false}
					isCTALoginDisplayed={false}
					isSimpleVersionDisplayed={true}
				/>
				<div className="mx-auto my-24 flex max-w-2xl flex-col items-center gap-8 px-4 text-center md:px-0">
					<p className={'text-lg text-gray-700'}>
						{`Nous transmettons votre demande à la maquilleuse. Si elle n'est pas disponible, nous vous proposerons une autre maquilleuse de votre secteur, avec votre accord.`}
					</p>
					<Link href={'/search'} className={'btn-primary'}>
						Voir d&apos;autres maquilleuses
					</Link>
				</div>
			</main>
			<Footer />
		</>
	)
}

export default DemandeEnvoyee
