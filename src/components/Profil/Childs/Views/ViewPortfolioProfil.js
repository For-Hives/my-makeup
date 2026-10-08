import React from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
// import required modules
import { Pagination } from 'swiper/modules'
// Import Swiper styles
import 'swiper/css'
import 'swiper/css/pagination'
import Image from 'next/image'
import { altRealisation, galerie, nomAffiche } from '@/lib/profil/vue-publique'

// read from the props only, so the pictures are in the server HTML
function ViewPortfolioProfil({ user }) {
	const [mySwiper, setMySwiper] = React.useState(null)
	const photos = galerie(user)
	const nom = nomAffiche(user)

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>Portfolio</h2>
			{photos.length > 0 && (
				<Swiper
					slidesPerView={'auto'}
					spaceBetween={32}
					pagination={{
						clickable: true,
					}}
					modules={[Pagination]}
					className="h-[500px] w-full"
					loop={photos.length > 2}
					onInit={ev => {
						setMySwiper(ev)
					}}
				>
					{photos.map((image, index) => (
						<SwiperSlide
							key={index}
							style={{
								...(image.width && image.height
									? { aspectRatio: `${image.width}/${image.height}` }
									: {}),
								height: '100%',
							}}
							className={'!h-[500px] !w-auto'}
						>
							<Image
								src={image.url}
								alt={altRealisation(nom, index + 1, photos.length)}
								fill={true}
								sizes="(min-width: 480px ) 50vw, (min-width: 728px) 33vw, (min-width: 976px) 25vw, 100vw"
								className={'rounded object-cover'}
							/>
						</SwiperSlide>
					))}
				</Swiper>
			)}
			{photos.length > 1 && (
				<div className={'flex w-full items-center justify-between'}>
					<button
						type="button"
						aria-label="Photo précédente"
						className={'flex min-h-[44px] items-center justify-center gap-2'}
						onClick={() => mySwiper?.slidePrev()}
					>
						<Image
							alt={''}
							src={'/assets/down-arrow.svg'}
							className={'rotate-90'}
							width={20}
							height={20}
						></Image>
						<span className={'font-semibold text-indigo-950'}>Précédent</span>
					</button>
					<button
						type="button"
						aria-label="Photo suivante"
						className={'flex min-h-[44px] items-center justify-center gap-2'}
						onClick={() => mySwiper?.slideNext()}
					>
						<span className={'font-semibold text-indigo-950'}>Suivant</span>
						<Image
							alt={''}
							src={'/assets/down-arrow.svg'}
							className={'-rotate-90'}
							width={20}
							height={20}
						></Image>
					</button>
				</div>
			)}
		</div>
	)
}

export default ViewPortfolioProfil
