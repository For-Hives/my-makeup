import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'

/**
 * todo : add content
 * @param props
 * @returns {JSX.Element}
 * @constructor
 */
function Cgv(props) {
	return (
		<>
			<main>
				<Nav />
				<section className={'flex h-screen w-full items-center justify-center'}>
					<h1 className={'text-center text-3xl text-gray-700'}>CGV</h1>
				</section>
				<Footer />
			</main>
		</>
	)
}

export default Cgv