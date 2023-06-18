import React, { useState } from 'react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { Dialog } from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import Image from 'next/image'
import PopoverComponent from '@/components/Global/Popover'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import _ from 'lodash'
import { Signature } from '@/components/Global/Signature'

const navigation = [
	{
		name: 'Particulier',
		href: '/particulier',
		mode: 'dropdown',
		children: [
			{
				name: 'Pourquoi My Makeup ?',
				href: '/particulier',
				icon: 'handshake',
				description:
					'My Makeup est une plateforme de mise en relation entre les particuliers et les professionnels de la beauté.',
			},
			{
				name: 'Trouver des maquilleuses',
				href: '/particulier/trouver-une-maquilleuse',
				icon: 'diversity_1',
				description:
					'Trouvez la maquilleuse qui vous correspond parmi les profils disponibles.',
			},
			{
				name: 'Centraliser ses recherches',
				href: '/particulier/centraliser-ses-recherches',
				icon: 'query_stats',
				description:
					'Centralisez vos recherches pour comparer et trouver la maquilleuse qui vous correspond.',
			},
			{
				name: 'Explorer les profils',
				href: '/particulier/explorer-les-profils',
				icon: 'person_search',
				description: 'Cherchez par critères et par villes !',
			},
		],
	},
	{
		name: 'Maquilleuse',
		href: '/maquilleuse',
		mode: 'dropdown',
		children: [
			{
				name: 'Pourquoi My Makeup ?',
				href: '/maquilleuse',
				icon: 'brush',
				description:
					'Rejoignez la communauté My Makeup pour développer votre activité, trouver de nouveaux clients,' +
					' gagner en visibilité. Et facilité votre gestion quotidienne !',
			},
			{
				name: 'Communauté & Partenariats',
				href: '/maquilleuse/partenariats',
				icon: 'group',
				description:
					'Nous sommes là pour vous accompagner dans votre développement !',
			},
			// {
			// 	name: 'Nos partenaires',
			// 	href: '/maquilleuse/partenaires',
			// 	icon: 'leaderboard',
			// 	description:
			// 		'Utilisez les outils de nos partenaires pour développer votre activité ! ' +
			// 		'Et Facilitez votre vie !',
			// },
		],
	},
	{
		name: 'Solutions',
		href: '/solutions',
		mode: 'dropdown',
		children: [
			{
				name: 'Pour les particuliers',
				href: '/solutions/pour-les-particuliers',
				icon: 'groups',
				description:
					"Trouvez la maquilleuse de vos rêves, n'a jamais été aussi simple !",
			},
			{
				name: 'Pour les maquilleuses',
				href: '/solutions/pour-les-maquilleuses',
				icon: 'diversity_2',
				description:
					'Le seul endroit pour trouver des clients, développer votre activité et trouver des opportunités !',
			},
		],
	},
	{
		name: 'Blog',
		href: '/blog',
	},
]

function Nav({ isSignOutVisible = false }) {
	const { data: session } = useSession()

	const [mobileMenuOpen, setMobileMenuOpen] = useState(true)

	console.log(mobileMenuOpen)
	return (
		<>
			<div
				className={
					'fixed left-0 top-0 z-30 flex w-full items-center justify-center bg-white lg:h-[90px] ' +
					(mobileMenuOpen ? 'h-screen' : '')
				}
			>
				{/* Desktop view */}
				<div className="mx-auto hidden h-full w-full lg:block">
					<div className="relative z-20 lg:w-full">
						<div className="relative px-6 py-6 lg:border-b lg:border-slate-300 lg:px-16">
							<nav
								className="flex justify-between sm:h-10 sm:items-center lg:justify-start"
								aria-label="Global"
							>
								<Link href="/" className="-m-1.5 p-1.5">
									<span className="sr-only">My Makeup</span>
									<Image
										alt="Logo My Makeup"
										width={50}
										height={50}
										src="/assets/logo_2.webp"
									/>
								</Link>
								<div className="flex flex-col lg:ml-10 lg:w-full lg:flex-row lg:justify-between">
									<div
										className={'lg:flex lg:w-full lg:items-center lg:gap-10'}
									>
										{navigation.map(item => {
											if (item.mode === 'dropdown') {
												return (
													<PopoverComponent
														key={item.name}
														name={item.name}
														translate={'30%'}
														content={item.children}
													/>
												)
											} else {
												return (
													<Link
														key={item.name}
														href={item.href}
														className="text-sm font-semibold leading-6 text-slate-900"
													>
														{item.name}
													</Link>
												)
											}
										})}
									</div>
									<div
										className={
											'lg:flex lg:w-full lg:items-center lg:justify-end lg:gap-10'
										}
									>
										<Link className={'btn-primary-with-icon'} href={'/search'}>
											<MagnifyingGlassIcon
												className="mr-2 h-5 w-5 text-indigo-900"
												aria-hidden="true"
											/>
											Trouver une maquilleuse
										</Link>
										{session && session.user && !_.isEmpty(session.user) ? (
											<>
												{isSignOutVisible && (
													<Link
														onClick={() => {
															signOut()
														}}
														className=""
														href={'/auth/signin'}
													>
														<span
															className={
																'btn-primary-simple border-red-500  text-red-600'
															}
														>
															Me déconnecter
														</span>
													</Link>
												)}
												<Link className="" href={'/auth/profil'}>
													<span className={'btn-primary'}>Profil</span>
												</Link>
											</>
										) : (
											<Link href="/auth/signin" className="">
												<span className={'btn-primary-simple'}>
													Me connecter
												</span>
											</Link>
										)}
									</div>
								</div>
							</nav>
						</div>
					</div>
				</div>
				{/* Mobile view */}
				<div className="mx-auto block h-full w-full lg:hidden">
					<div className={'relative flex h-full w-full flex-col'}>
						<div className={'absolute right-0 top-0 m-6'}>
							{/*	btn switch nav */}
						</div>
						{/* Content mobile view */}
						<div className={'flex h-full w-full flex-col gap-8 p-6'}>
							<div>
								<Link href="/" className="">
									<span className="sr-only">My Makeup</span>
									<Image
										alt="Logo My Makeup"
										width={50}
										height={50}
										src="/assets/logo_2.webp"
									/>
								</Link>
							</div>
							<div className={'flex w-full flex-col-reverse items-start gap-8'}>
								<Link className={'btn-primary-with-icon'} href={'/search'}>
									<MagnifyingGlassIcon
										className="mr-2 h-5 w-5 text-indigo-900"
										aria-hidden="true"
									/>
									Trouver une maquilleuse
								</Link>
							</div>
							<div className={'z-10 flex w-full flex-col items-start gap-10'}>
								{navigation.map(item => {
									if (item.mode === 'dropdown') {
										return (
											<PopoverComponent
												key={item.name}
												name={item.name}
												translate={'30%'}
												content={item.children}
											/>
										)
									} else {
										return (
											<Link
												key={item.name}
												href={item.href}
												className="text-sm font-semibold leading-6 text-slate-900"
											>
												{item.name}
											</Link>
										)
									}
								})}
							</div>
							<div className={'h-0.5 w-full bg-gray-300/50'}></div>
							<div className={'flex'}>
								{session && session.user && !_.isEmpty(session.user) ? (
									<div className={'flex flex-row-reverse gap-8'}>
										<Link
											onClick={() => {
												signOut()
											}}
											className=""
											href={'/auth/signin'}
										>
											<span
												className={
													'btn-primary-simple border-red-500  text-red-600'
												}
											>
												Me déconnecter
											</span>
										</Link>
										<Link className="" href={'/auth/profil'}>
											<span className={'btn-primary'}>Profil</span>
										</Link>
									</div>
								) : (
									<Link href="/auth/signin" className="">
										<span className={'btn-primary-simple'}>Me connecter</span>
									</Link>
								)}
							</div>
							<div className={'flex h-full w-full items-end'}>
								<Signature />
							</div>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default Nav
