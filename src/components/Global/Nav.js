'use client'

import React, { useState } from 'react'

import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { signOut, useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import _ from 'lodash'

import PopoverComponent from '@/components/Global/Popover'
import { Signature } from '@/components/Global/Signature'

const navigation = [
	{
		children: [
			{
				description:
					'My-Makeup est une plateforme de mise en relation entre les particuliers et les professionnels de la beauté.',
				href: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
				name: 'Pourquoi My-Makeup ?',
				icon: 'handshake',
			},
			{
				description:
					'Trouvez la maquilleuse qui vous correspond parmi les profils disponibles.',
				href: '/particulier/trouver-une-maquilleuse',
				name: 'Trouver une maquilleuse',
				icon: 'diversity_1',
			},
			{
				description:
					'Centralisez vos recherches pour comparer et trouver la maquilleuse qui vous correspond.',
				href: '/particulier/centraliser-ses-recherches',
				name: 'Centraliser ses recherches',
				icon: 'query_stats',
			},
			{
				description: 'Cherchez par critères et par villes !',
				href: '/particulier/explorer-les-profils',
				name: 'Explorer les profils',
				icon: 'person_search',
			},
		],
		href: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
		name: 'Particulier',
		mode: 'dropdown',
	},
	{
		children: [
			{
				description:
					'Rejoignez la communauté My-Makeup pour développer votre activité, trouver de nouveaux clients,' +
					' gagner en visibilité. Et facilité votre gestion quotidienne !',
				href: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
				name: 'Pourquoi My-Makeup ?',
				icon: 'brush',
			},
			{
				description:
					'Nous sommes là pour vous accompagner dans votre développement !',
				name: 'Communauté & Partenariats',
				href: '/maquilleuse/partenariats',
				icon: 'group',
			}, // {
			// 	name: 'Nos partenaires',
			// 	href: '/maquilleuse/partenaires',
			// 	icon: 'leaderboard',
			// 	description:
			// 		'Utilisez les outils de nos partenaires pour développer votre activité ! ' +
			// 		'Et Facilitez votre vie !',
			// },
		],
		href: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
		name: 'Maquilleuse',
		mode: 'dropdown',
	},
	{
		children: [
			{
				description:
					"Trouvez la maquilleuse de vos rêves, n'a jamais été aussi simple !",
				href: '/solutions/pour-les-particuliers',
				name: 'Pour les particuliers',
				icon: 'groups',
			},
			{
				description:
					'Le seul endroit pour trouver des clients, développer votre activité et trouver des opportunités !',
				href: '/solutions/pour-les-maquilleuses',
				name: 'Pour les maquilleuses',
				icon: 'diversity_2',
			},
		],
		href: '/solutions',
		name: 'Solutions',
		mode: 'dropdown',
	},
	{
		href: '/blog',
		name: 'Blog',
	},
]

function Nav({
	isFindMakeupArtistBtnVisible = true,
	isProfileBtnVisible = true,
}) {
	const { data: session } = useSession()

	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

	const handleClickMenuIcon = () => {
		setMobileMenuOpen(!mobileMenuOpen)
	}

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
						<div className="relative px-6 py-6 lg:border-b lg:border-gray-300 lg:px-16">
							<nav
								aria-label="Global"
								className="flex justify-between sm:h-10 sm:items-center lg:justify-start"
							>
								<Link className="-m-1.5 p-1.5" href="/">
									<span className="sr-only">My-Makeup</span>
									<Image
										alt="Logo My-Makeup"
										height={50}
										src="/assets/logo.webp"
										width={50}
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
														content={item.children}
														key={item.name}
														name={item.name}
														translate={'30%'}
													/>
												)
											} else {
												return (
													<Link
														className="text-sm font-semibold leading-6 text-gray-900"
														href={item.href}
														key={item.name}
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
										{isFindMakeupArtistBtnVisible && (
											<Link
												className={'btn-primary-with-icon'}
												href={'/search'}
											>
												<MagnifyingGlassIcon
													aria-hidden="true"
													className="mr-2 h-5 w-5 text-indigo-900"
												/>
												Trouver une maquilleuse
											</Link>
										)}

										{session && session.user && !_.isEmpty(session.user) ? (
											<>
												{isProfileBtnVisible && (
													<Link className="" href={'/auth/profil'}>
														<span className={'btn-primary'}>Profil</span>
													</Link>
												)}
											</>
										) : (
											<Link className="" href="/auth/signin">
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
					<div
						className={
							'relative flex h-full w-full flex-col border-b border-gray-300'
						}
					>
						<div className={'absolute right-0 top-0 m-6'}>
							{/*	btn switch nav */}
							<div className="menu-icon" onClick={handleClickMenuIcon}>
								<input
									aria-label="menu_icon"
									className="menu-icon__cheeckbox"
									type="checkbox"
								/>
								<div>
									<span></span>
									<span></span>
								</div>
							</div>
						</div>
						{/* Content mobile view */}
						<div className={'flex h-full w-full flex-col gap-8 p-6'}>
							<div>
								<Link className="" href="/">
									<span className="sr-only">My-Makeup</span>
									<Image
										alt="Logo My-Makeup"
										height={50}
										src="/assets/logo.webp"
										width={50}
									/>
								</Link>
							</div>
							{mobileMenuOpen && isFindMakeupArtistBtnVisible && (
								<div
									className={'flex w-full flex-col-reverse items-start gap-8'}
								>
									<Link className={'btn-primary-with-icon'} href={'/search'}>
										<MagnifyingGlassIcon
											aria-hidden="true"
											className="mr-2 h-5 w-5 text-indigo-900"
										/>
										Trouver une maquilleuse
									</Link>
								</div>
							)}
							{mobileMenuOpen && (
								<div className={'z-10 flex w-full flex-col items-start gap-10'}>
									{navigation.map(item => {
										if (item.mode === 'dropdown') {
											return (
												<PopoverComponent
													content={item.children}
													key={item.name}
													name={item.name}
													translate={'30%'}
												/>
											)
										} else {
											return (
												<Link
													className="text-sm font-semibold leading-6 text-gray-900"
													href={item.href}
													key={item.name}
												>
													{item.name}
												</Link>
											)
										}
									})}
								</div>
							)}
							{mobileMenuOpen && (
								<div className={'h-0.5 w-full bg-gray-300/50'}></div>
							)}
							{mobileMenuOpen && (
								<div className={'flex'}>
									{session && session.user && !_.isEmpty(session.user) ? (
										<div className={'flex flex-row-reverse gap-8'}>
											{isProfileBtnVisible && (
												<Link className="" href={'/auth/profil'}>
													<span className={'btn-primary'}>Profil</span>
												</Link>
											)}
										</div>
									) : (
										<Link className="" href="/auth/signin">
											<span className={'btn-primary-simple'}>Me connecter</span>
										</Link>
									)}
								</div>
							)}
							{mobileMenuOpen && (
								<div className={'flex h-full w-full items-end'}>
									<Signature isPaddingActivated={false} />
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

export default Nav
