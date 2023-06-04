import Image from 'next/image'
import SearchBloc from '@/components/Global/SearchBloc'

export default function Hero(props) {
	return (
		<div className="relative bg-white pt-[90px]">
			<div
				className={
					'absolute bottom-0 left-1/2 z-20 flex w-full -translate-x-1/2 transform items-end justify-center'
				}
			>
				<SearchBloc />
			</div>
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
					<div className="relative z-10 px-6 py-32 sm:py-40 lg:px-8 lg:pb-80 lg:pr-0 lg:pt-52">
						<div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl">
							<h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
								{props.title}
							</h1>
							<p className="mt-6 text-lg leading-8 text-slate-700">
								{props.description}
							</p>
						</div>
					</div>
				</div>
			</div>
			<div className="bg-white lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
				<Image
					className="aspect-[3/2] object-cover lg:aspect-auto lg:h-full lg:w-full "
					width={1000}
					height={1000}
					src="/assets/back.png"
					alt="trouver une maquilleuse professionnelle freelance"
				/>
			</div>
		</div>
	)
}
