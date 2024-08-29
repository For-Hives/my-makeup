import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
	alternates: {
		canonical: 'https://my-makeup.fr/404',
	},
	description: "Oups, cette page n'existe pas !",
	title: 'My-Makeup',
}

function NotFound() {
	return (
		<>
			<div className="relative flex h-[95vh] max-h-screen overflow-hidden md:h-screen md:overflow-auto md:bg-white">
				<div className="flex flex-1 flex-col justify-center bg-white px-4 sm:px-6 md:py-12 md:pt-12 lg:flex-none lg:px-20 xl:px-24">
					<div className="mx-auto w-full max-w-sm lg:w-96">
						<Link href={'/'}>
							<span className="sr-only">My-Makeup</span>
							<Image
								alt="Logo My-Makeup"
								height={50}
								src="/assets/logo.webp"
								width={50}
							/>
						</Link>
						<div className={'mt-8'}>
							<h1 className={'my-8 text-2xl font-semibold text-slate-900'}>
								404 - Page non trouvée
							</h1>
							<p
								className={'text-gray-700'}
							>{`Oops ! La page que vous cherchez n'existe pas.`}</p>

							<Link className="btn-primary-large mt-8" href={'/'}>
								{`Retourner à l'accueil`}
							</Link>
						</div>
					</div>
				</div>
				<div className="relative hidden w-full flex-1 lg:block lg:object-contain">
					<div
						className={
							'absolute left-0 top-0 z-20 h-full w-full bg-gradient-to-r from-white via-transparent to-transparent'
						}
					></div>
					<Image
						alt={'background my-makeup 404'}
						className={'z-10 transform object-cover'}
						fill
						src="/assets/vectorials-used/cat404.svg"
					></Image>
				</div>
			</div>
		</>
	)
}

export default NotFound
