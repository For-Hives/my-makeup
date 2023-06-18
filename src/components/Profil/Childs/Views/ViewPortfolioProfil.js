import React from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
// import required modules
import { Pagination } from 'swiper'
// Import Swiper styles
import 'swiper/css'
import 'swiper/css/pagination'
import Image from 'next/image'

function ViewPortfolioProfil(props) {
	const [mySwiper, setMySwiper] = React.useState(null)

	const user = props.user

	let imageGallery = []
	// check if user.image_gallery.data property exists
	if (user.image_gallery.data === undefined) {
		imageGallery = user?.image_gallery
	} else {
		// array to object conversion, {id: x, attributes: {...}} to {...} for each element
		imageGallery = user?.image_gallery?.data?.map(image => image.attributes)
	}

	return (
		<div className={'flex w-full flex-col gap-4'}>
			<h2 className={'text-xl font-bold text-slate-700'}>Portfolio</h2>
			<>
				<Swiper
					slidesPerView={'auto'}
					spaceBetween={32}
					pagination={{
						clickable: true,
					}}
					modules={[Pagination]}
					className="h-[500px] w-full"
					onInit={ev => {
						setMySwiper(ev)
					}}
				>
					{
						// 	map on user?.image_gallery and return a SwiperSlide with the image
					}
					{imageGallery?.length &&
						imageGallery.map((image, index) => {
							return (
								<SwiperSlide
									key={index}
									style={{
										aspectRatio: `${image?.width}/${image?.height}`,
										height: '100%',
									}}
									className={'!h-[500px] !w-auto'}
								>
									<Image
										src={image?.url}
										alt={image?.alternativeText ?? image?.name}
										fill={true}
										className={'rounded object-cover'}
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
							if (mySwiper.activeIndex === 0) {
								// 	go to the last slide
								mySwiper.slideTo(mySwiper.slides.length - 1)
							} else {
								mySwiper.slidePrev()
							}
						}}
					>
						<Image
							alt={'next'}
							src={'/assets/down-arrow.svg'}
							className={'rotate-90'}
							width={20}
							height={20}
						></Image>
						<span className={'font-semibold text-indigo-950'}>Précédent</span>
					</button>
				</div>
				<div>
					<button
						className={'flex items-center justify-center gap-2'}
						onClick={() => {
							if (mySwiper.activeIndex === mySwiper.slides.length - 1) {
								// 	go to the first slide
								mySwiper.slideTo(0)
							} else {
								mySwiper.slideNext()
							}
						}}
					>
						<span className={'font-semibold text-indigo-950'}>Suivant</span>
						<Image
							alt={'next'}
							src={'/assets/down-arrow.svg'}
							className={'-rotate-90'}
							width={20}
							height={20}
						></Image>
					</button>
				</div>
			</div>
		</div>
	)
}

export default ViewPortfolioProfil