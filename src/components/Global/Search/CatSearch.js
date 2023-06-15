import Image from 'next/image'
import React from 'react'

export function CatSearch() {
	return (
		<div className={'flex flex-col items-center justify-center gap-8'}>
			<Image
				src={'/assets/vectorials-used/catSearch.svg'}
				alt={'search'}
				width={300}
				height={300}
			/>
			<h2 className={'text-3xl text-gray-700'}>
				Complétez la recherche pour voir des résultats
			</h2>
		</div>
	)
}
