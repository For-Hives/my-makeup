import Head from 'next/head';
import React from 'react';
import Image from 'next/image';
import Nav from '@/components/Global/Nav';
import Footer from '@/components/Global/Footer';
import ResumeProfil from '@/components/Profil/ResumeProfil';

function Profil() {
	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="Page de profil sur my-makeup.fr la plateforme qui va révolutionner votre façon de travailler !"
				/>
			</Head>
			<main className={'relative'}>
				<Image
					src={'/assets/coming-soon.svg'}
					alt={'Coming soon'}
					width={'80'}
					height={'80'}
					className={
						'top-0 left-0 fixed z-50 m-4 p-2 bg-amber-300/75 rounded-full'
					}
				/>
				<Nav />
				<ResumeProfil />
				<Footer />
			</main>
		</>
	);
}

export default Profil;
