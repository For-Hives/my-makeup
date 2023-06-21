import Image from 'next/image'
import React from 'react'

export function CatSearch() {
	return (
		<div className={'flex flex-col items-center justify-center gap-8'}>
			<Image
				src={'/assets/vectorials-used/catSearch.svg'}
				alt={'search'}
				width={200}
				height={200}
			/>
			<h1 className={'text-center text-lg text-gray-700 md:text-xl'}>
				Complétez la recherche de maquilleuses pour voir des résultats
			</h1>
		</div>
	)
}
