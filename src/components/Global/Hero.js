import Image from 'next/image'
import SearchBloc from '@/components/Global/Search/SearchBloc'
import Link from 'next/link'

export default function Hero({
	imgBackgroundSrc = '/assets/back.webp',
	title,
	description,
	isSearchDisplayed = true,
	isCTALoginDisplayed = false,
	isSimpleVersionDisplayed = false,
}) {
	return (
		<div className="relative bg-white 2xl:pt-[90px]">
			{isSimpleVersionDisplayed === false && (
				<div
					className={
						'absolute bottom-0 left-1/2 z-20 flex w-full -translate-x-1/2 transform items-end justify-center px-4'
					}
				>
					{isSearchDisplayed ? (
						<SearchBloc />
					) : (
						<>
							<div
								className={
									'mb-16 flex items-center justify-center rounded-full border-2 border-indigo-900 bg-white p-2 text-center text-lg text-indigo-900 md:mb-8 md:p-4'
								}
							>
								<span className="material-icons-round flex items-center justify-center text-center">
									expand_more
								</span>
							</div>
						</>
					)}
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
						<div className="mx-auto flex max-w-2xl flex-col gap-8 lg:mx-0 lg:max-w-xl">
							<div className={'flex flex-col gap-4'}>
								<h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
									{title}
								</h1>
								<p className="text-lg leading-8 text-gray-700">{description}</p>
							</div>
							{isCTALoginDisplayed && (
								<div>
									<Link href={'/auth/signin'} className={'btn-primary'}>
										{"S'incrire sur My-Makeup"}
									</Link>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
			<div className="bg-white pb-24 md:pb-8 lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 lg:pb-0">
				<Image
					className="aspect-[3/2] object-contain md:object-center lg:aspect-auto lg:h-full lg:w-full xl:object-top "
					width={1000}
					height={1000}
					src={imgBackgroundSrc}
					alt="trouver une maquilleuse professionnelle freelance"
				/>
			</div>
		</div>
	)
}
