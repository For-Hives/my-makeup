import React from 'react'
import { SwiperSlide, Swiper } from 'swiper/react'

// import required modules
import { Pagination } from 'swiper'
// Import Swiper styles
import 'swiper/css'
import 'swiper/css/pagination'
import Image from 'next/image'

export function PortfolioProfil(props) {
	const user = props.user
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
				>
					{
						// 	map on user.image_gallery and return a SwiperSlide with the image
					}
					{user.image_gallery.map((image, index) => {
						return (
							<SwiperSlide
								key={index}
								style={{
									aspectRatio: `${image.width}/${image.height}`,
									height: '100%',
								}}
								className={'h-[500px] !w-auto'}
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
		</div>
	)
}
