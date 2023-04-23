import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'

function CentraliserSesRecherches(props) {
	return (
		<>
			<main>
				<Nav />
				<section className={'flex h-screen w-full items-center justify-center'}>
					<h1 className={'text-center text-3xl text-gray-700'}>
						Centraliser ses recherches
					</h1>
				</section>
				<Footer />
			</main>
		</>
	)
}

export default CentraliserSesRecherches
