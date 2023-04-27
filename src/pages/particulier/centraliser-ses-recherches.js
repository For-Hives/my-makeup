import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'

/**
 * todo : add content
 * @param props
 * @returns {JSX.Element}
 * @constructor
 */
function CentraliserSesRecherches(props) {
	return (
		<>
			<div>
				<Nav />
				<main className={'flex h-screen w-full items-center justify-center'}>
					<h1 className={'text-center text-3xl text-gray-700'}>
						Centraliser ses recherches
					</h1>
				</main>
				<Footer />
			</div>
		</>
	)
}

export default CentraliserSesRecherches
