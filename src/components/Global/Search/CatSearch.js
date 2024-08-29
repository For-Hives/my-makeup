import React from 'react'

import Image from 'next/image'

export function CatSearch() {
	return (
		<div className={'flex flex-col items-center justify-center gap-8'}>
			<Image
				alt={'search'}
				height={200}
				src={'/assets/vectorials-used/catSearch.svg'}
				width={200}
			/>
			<h1 className={'px-8 text-center text-lg text-gray-700 md:text-xl'}>
				Complétez la recherche de maquilleuses pour voir des résultats
			</h1>
		</div>
	)
}
