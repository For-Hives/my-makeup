import React from 'react'

import Image from 'next/image'
import Link from 'next/link'

import { Signature } from '@/components/Global/Signature'

function Footer() {
	return (
		<>
			<footer
				className={
					'relative mx-auto flex w-full max-w-7xl flex-col gap-20 px-4 pt-52 md:flex-row md:px-8 2xl:px-0'
				}
			>
				<div className={'flex flex-col gap-6'}>
					<div className={'flex items-center justify-start gap-3'}>
						<Image
							alt={'Logo My-Makeup'}
							height={'50'}
							src={'/assets/logo.webp'}
							width={'50'}
						/>
						<p className={'text-2xl font-bold text-my-makeup-900'}>My-Makeup</p>
					</div>
					<p className={'text-sm text-gray-600'}>
						72 avenue Camus,
						<br />
						44000 Nantes
					</p>
					<div className={'flex flex-row gap-3 md:flex-col lg:flex-row'}>
						<Link
							href="https://www.instagram.com/forhives.my_makeup.fr/"
							rel={'noopener nofollow noreferrer '}
						>
							<Image
								alt={'Instagram My-Makeup'}
								className={'fill-white'}
								height={'35'}
								src={'/assets/brand/037-instagram.svg'}
								width={'35'}
							/>
						</Link>
						<Link
							href="https://www.linkedin.com/company/forhives-my-makeup/"
							rel={'noopener nofollow noreferrer'}
						>
							<Image
								alt={'Linkedin My-Makeup'}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/030-linkedin.svg'}
								width={'35'}
							/>
						</Link>
						<Link
							href="mailto:contact@my-makeup.fr"
							rel={'noopener nofollow noreferrer'}
						>
							<Image
								alt={'Mail My-Makeup'}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/017-telegram.svg'}
								width={'35'}
							/>
						</Link>
						<Link
							href="https://facebook.com/forhives.my.makeup"
							rel={'noopener nofollow noreferrer'}
						>
							<Image
								alt={'Facebook My-Makeup'}
								className={'fill-indigo-700'}
								height={'35'}
								src={'/assets/brand/006-facebook.svg'}
								width={'35'}
							/>
						</Link>
					</div>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<p className={'text-xl font-bold text-indigo-800'}>Particuliers</p>
					</div>
					<Link
						className={'text-sm text-gray-600'}
						href={'/pourquoi-utiliser-my-makeup-en-tant-que-particulier'}
					>
						Pourquoi My-Makeup ?
					</Link>
					<Link
						className={'text-sm text-gray-600'}
						href={'/particulier/trouver-une-maquilleuse'}
					>
						Trouver une maquilleuse
					</Link>
					<Link
						className={'text-sm text-gray-600'}
						href={'/particulier/centraliser-ses-recherches'}
					>
						Centraliser ses recherches
					</Link>
					<Link
						className={'text-sm text-gray-600'}
						href={'/particulier/explorer-les-profils'}
					>
						Explorer les profils
					</Link>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<p className={'text-xl font-bold text-indigo-800'}>Maquilleuses</p>
					</div>
					<Link
						className={'text-sm text-gray-600'}
						href={'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse'}
					>
						Pourquoi My-Makeup ?
					</Link>
					<Link
						className={'text-sm text-gray-600'}
						href={'/maquilleuse/partenariats'}
					>
						Communautés & Partenariats
					</Link>
					{/*<Link*/}
					{/*	href={'/maquilleuse/partenaires'}*/}
					{/*	className={'text-sm text-gray-600'}*/}
					{/*>*/}
					{/*	Nos partenaires*/}
					{/*</Link>*/}
					{/* todo : plus tard */}
					{/*<Link href={'/affiliation'} className={'text-sm text-gray-600'}>*/}
					{/*	Programme d&apos;affiliation*/}
					{/*</Link>*/}
					{/*<Link href={'/parrainage'} className={'text-sm text-gray-600'}>*/}
					{/*	Programme de parrainage*/}
					{/*</Link>*/}
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<p className={'text-xl font-bold text-indigo-800'}>Ressources</p>
					</div>
					<Link
						className={'text-sm text-gray-600'}
						href={'/solutions/pour-les-particuliers'}
					>
						Solution pour les particuliers
					</Link>
					<Link
						className={'text-sm text-gray-600'}
						href={'/solutions/pour-les-maquilleuses'}
					>
						Solution pour les maquilleuses
					</Link>
					<Link className={'text-sm text-gray-600'} href={'/blog'}>
						Blog
					</Link>
					{/*<Link href={'/help'} className={'text-sm text-gray-600'}>*/}
					{/*	Aide*/}
					{/*</Link>*/}
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<p className={'text-xl font-bold text-indigo-800'}>My-Makeup</p>
					</div>
					<Link className={'text-sm text-gray-600'} href={'/a-propos'}>
						À propos de My-Makeup
					</Link>
					<Link className={'text-sm text-gray-600'} href={'/contact'}>
						Contact
					</Link>
					<Link className={'text-sm text-gray-600'} href={'/cgu'}>
						Mentions légales
					</Link>
					{/* todo : remplir les cgv plus tard */}
					{/*<Link href={'/cgv'} className={'text-sm text-gray-600'}>*/}
					{/*	Conditions générales de vente*/}
					{/*</Link>*/}
					<Link className={'text-sm text-gray-600'} href={'/cgu'}>
						Conditions générales d&apos;utilisation
					</Link>
					<Link
						className={'text-sm text-gray-600'}
						href={'/politique-de-confidentialite'}
					>
						Politique de confidentialité
					</Link>
					<Link className={'text-sm text-gray-600'} href={'/site-map'}>
						Plan du site
					</Link>
				</div>
			</footer>
			<Signature />
		</>
	)
}

export default Footer
