import React from 'react'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'

/**
 * todo : add content
 * @param props
 * @constructor
 */
function Blog(props) {
	return (
		<>
			<div>
				<Nav />
				<main className={'flex h-screen w-full items-center justify-center'}>
					<h1 className={'text-center text-3xl text-gray-700'}>Blog</h1>
				</main>
				<Footer />
			</div>
		</>
	)
}

export default Blog
