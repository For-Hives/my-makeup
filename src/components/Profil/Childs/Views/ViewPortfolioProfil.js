import React, { useEffect } from 'react'

import { Swiper, SwiperSlide } from 'swiper/react'
// import required modules
import { Pagination } from 'swiper/modules'
import Image from 'next/image'

import 'swiper/css/pagination'
// Import Swiper styles
import 'swiper/css'

function ViewPortfolioProfil(props) {
	const [mySwiper, setMySwiper] = React.useState(null)

	const [user, setUser] = React.useState(null)
	const [imageGallery, setImageGallery] = React.useState([])

	useEffect(() => {
		if (props.user) {
			setUser(props.user)
			// check if user.image_gallery.data property exists
			if (user?.image_gallery?.data === undefined) {
				setImageGallery(user?.image_gallery)
			} else {
				// array to object conversion, {id: x, attributes: {...}} to {...} for each element
				setImageGallery(
					user?.image_gallery?.data?.map(image => image.attributes)
				)
			}
		}
	}, [props.user, user?.image_gallery])

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-gray-700'}>Portfolio</h2>
			<>
				<Swiper
					className="h-[500px] w-full"
					loop={true}
					modules={[Pagination]}
					onInit={ev => {
						setMySwiper(ev)
					}}
					pagination={{
						clickable: true,
					}}
					slidesPerView={'auto'}
					spaceBetween={32}
				>
					{
						// 	map on user?.image_gallery and return a SwiperSlide with the image
					}
					{imageGallery &&
						imageGallery?.length !== 0 &&
						imageGallery.map((image, index) => {
							return (
								<SwiperSlide
									className={'!h-[500px] !w-auto'}
									key={index}
									style={{
										aspectRatio: `${image?.width}/${image?.height}`,
										height: '100%',
									}}
								>
									<Image
										alt={image?.alternativeText ?? image?.name}
										className={'rounded object-cover'}
										fill={true}
										sizes="(min-width: 480px ) 50vw, (min-width: 728px) 33vw, (min-width: 976px) 25vw, 100vw"
										src={image?.url}
									/>
								</SwiperSlide>
							)
						})}
				</Swiper>
			</>
			{/* btn to go on next slide */}
			<div className={'flex w-full items-center justify-between'}>
				<div>
					<button
						className={'flex items-center justify-center gap-2'}
						onClick={() => {
							mySwiper.slidePrev()
						}}
					>
						<Image
							alt={'next'}
							className={'rotate-90'}
							height={20}
							src={'/assets/down-arrow.svg'}
							width={20}
						></Image>
						<span className={'font-semibold text-indigo-950'}>Précédent</span>
					</button>
				</div>
				<div>
					<button
						className={'flex items-center justify-center gap-2'}
						onClick={() => {
							mySwiper.slideNext()
						}}
					>
						<span className={'font-semibold text-indigo-950'}>Suivant</span>
						<Image
							alt={'next'}
							className={'-rotate-90'}
							height={20}
							src={'/assets/down-arrow.svg'}
							width={20}
						></Image>
					</button>
				</div>
			</div>
		</div>
	)
}

export default ViewPortfolioProfil
