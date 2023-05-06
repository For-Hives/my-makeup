import React from 'react'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'

/**
 * todo : add content
 * @param props
 * @constructor
 */
function Particulier(props) {
	return (
		<>
			<div>
				<Nav />
				<main
					className={
						'relative flex h-screen w-full items-center justify-center'
					}
				>
					<ResponsiveTemporary />
					<h1 className={'text-center text-3xl text-gray-700'}>Particulier</h1>
				</main>
				<Footer />
			</div>
		</>
	)
}

export default Particulier
