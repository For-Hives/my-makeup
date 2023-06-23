import Image from 'next/image'
import SearchBloc from '@/components/Global/Search/SearchBloc'

export default function Hero({
	imgBackgroundSrc = '/assets/back.png',
	title,
	description,
	isSearchDisplayed = true,
}) {
	return (
		<div className="relative bg-white 2xl:pt-[90px]">
			{isSearchDisplayed && (
				<div
					className={
						'absolute bottom-0 left-1/2 z-20 flex w-full -translate-x-1/2 transform items-end justify-center px-4'
					}
				>
					<SearchBloc />
				</div>
			)}
			<div className="mx-auto max-w-7xl">
				<div className="relative z-10 lg:w-full lg:max-w-2xl">
					<svg
						className="absolute inset-y-0 right-8 hidden h-full w-full translate-x-1/2 transform fill-white lg:block"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<polygon points="0,0 90,0 50,100 0,100" />
					</svg>
					{/* loop to repeat div */}
					<div className="relative z-10 px-6 py-32 pb-8 sm:py-40 sm:pb-24 lg:px-8 lg:pb-80 lg:pr-0 lg:pt-52">
						<div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
							<h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
								{title}
							</h1>
							<p className="mt-6 text-lg leading-8 text-slate-700">
								{description}
							</p>
						</div>
					</div>
				</div>
			</div>
			<div className="bg-white pb-24 md:pb-8 lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 lg:pb-0">
				<Image
					className="aspect-[3/2] object-cover md:object-center lg:aspect-auto lg:h-full lg:w-full xl:object-top "
					width={1000}
					height={1000}
					src={imgBackgroundSrc}
					alt="trouver une maquilleuse professionnelle freelance"
				/>
			</div>
		</div>
	)
}
