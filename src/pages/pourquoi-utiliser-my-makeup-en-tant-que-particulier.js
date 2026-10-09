import Head from 'next/head'
import CTA from '@/components/Global/CTA'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import AdvantagesParticulier from '@/components/Particulier/AdvantagesParticulier'
import { urlAbsolue } from '@/lib/seo/url'

/**
 * @param props
 * @constructor
 */
function PourquoiUtiliserMyMakeupEnTantQueParticulier(_props) {
	return (
		<>
			<Head>
				<title>Pourquoi My-Makeup ? en tant que particulier</title>
				<meta
					name="description"
					content="Découvrez pourquoi vous devriez utiliser My-Makeup en tant que particulier & professionnel"
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href={urlAbsolue('/pourquoi-utiliser-my-makeup-en-tant-que-particulier')} />
			</Head>
			<Nav />

			<main className={'relative'}>
				<Hero
					imgBackgroundSrc={'/assets/back/maquilleuse_africaine_white.webp'}
					title={
						<>
							Pourquoi utiliser <span className={'text-indigo-900'}>My&nbsp;Makeup</span> en tant que particulier ?
						</>
					}
					description={
						<>
							Découvrez les avantages à utiliser notre plateforme pour développer votre activité et trouver des
							passionnées expérimentées !
						</>
					}
				/>
				<AdvantagesParticulier />
				<CTA />
			</main>

			<Footer />
		</>
	)
}

export default PourquoiUtiliserMyMakeupEnTantQueParticulier
