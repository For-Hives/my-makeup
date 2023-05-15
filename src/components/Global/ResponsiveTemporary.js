import React from 'react'
import Image from 'next/image'

function ResponsiveTemporary(props) {
	return (
		<div
			className={
				'fixed z-50 flex h-screen w-screen items-center justify-center bg-white 2xl:hidden'
			}
		>
			<div className={'mx-4 flex flex-col items-center justify-center gap-10'}>
				<Image
					src={'/assets/phone.svg'}
					width={100}
					height={100}
					alt={'return phone'}
				/>
				<h2 className={'text-center'}>
					Tourner votre téléphone pour une meilleure expérience, ou revenez sur
					un écran plus grand.
				</h2>
			</div>
		</div>
	)
}

export default ResponsiveTemporary
