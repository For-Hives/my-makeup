import Image from 'next/image'

export function CatSearch() {
	return (
		<div className={'flex flex-col items-center justify-center gap-8'}>
			<Image src={'/assets/vectorials-used/catSearch.svg'} alt={''} width={200} height={200} />
			{/* the h1 is the title of the search page */}
			<p className={'px-8 text-center text-lg text-gray-700 md:text-xl'}>
				Indiquez une prestation, une ville, ou les deux, pour voir les maquilleuses
			</p>
		</div>
	)
}
