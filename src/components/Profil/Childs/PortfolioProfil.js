import React from 'react'
import { SwiperSlide, Swiper } from 'swiper/react'

// import required modules
import { Pagination } from 'swiper'
// Import Swiper styles
import 'swiper/css'
import 'swiper/css/pagination'
import Image from 'next/image'
import { classNames } from '@/services/utils'

export function PortfolioProfil(props) {
	const user = props.user

	const [mySwiper, setMySwiper] = React.useState(null)

	return (
		<div
			className={
				'flex w-full flex-col gap-4 rounded border border-slate-300 bg-white p-8'
			}
		>
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
					onSlideChange={swiper => {
						console.log(swiper.activeIndex)
					}}
					onInit={ev => {
						console.log(ev)
						setMySwiper(ev)
					}}
				>
					{
						// 	map on user?.image_gallery and return a SwiperSlide with the image
					}
					{user?.image_gallery?.map((image, index) => {
						return (
							<SwiperSlide
								key={index}
								style={{
									aspectRatio: `${image.width}/${image.height}`,
									height: '100%',
								}}
								className={'!h-[500px] !w-auto'}
							>
								<Image
									src={image.url}
									alt={image.alternativeText ?? image.name}
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
