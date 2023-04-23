import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

function Footer() {
	// get actuel year
	const year = new Date().getFullYear()

	return (
		<>
			<footer className={'relative mx-auto flex w-full max-w-7xl gap-20 pt-52'}>
				<div className={'flex flex-col gap-6'}>
					<div className={'flex items-center justify-start gap-3'}>
						<Image
							src={'/assets/logo_2.webp'}
							alt={'Logo My Makeup'}
							width={'50'}
							height={'50'}
						/>
						<h4 className={'text-2xl font-bold text-my-makeup-900'}>
							My Makeup
						</h4>
					</div>
					<p className={'text-sm text-slate-600'}>
						72 avenue Camus,
						<br />
						44000 Nantes
					</p>
					<div className={'flex gap-3'}>
						<Link href="/">
							<Image
								src={'/assets/vectorials-used/fi-brands-instagram.svg'}
								className={'fill-indigo-700'}
								width={'20'}
								height={'20'}
								alt={'Instagram My Makeup'}
							/>
						</Link>
						<Link href="/">
							<Image
								src={'/assets/vectorials-used/fi-brands-linkedin.svg'}
								className={'fill-indigo-700'}
								width={'20'}
								height={'20'}
								alt={'Linkedin My Makeup'}
							/>
						</Link>
						<Link href="s/">
							<Image
								src={'/assets/vectorials-used/fi-brands-telegram.svg'}
								className={'fill-indigo-700'}
								width={'20'}
								height={'20'}
								alt={'Mail My Makeup'}
							/>
						</Link>
					</div>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>
							Particuliers
						</h4>
					</div>
					<Link href={'/particulier'} className={'text-sm text-slate-600'}>
						Pourquoi My Makeup ?
					</Link>
					<Link
						href={'/particulier/trouver-une-maquilleuse'}
						className={'text-sm text-slate-600'}
					>
						Trouver des maquilleuses
					</Link>
					<Link
						href={'/particulier/centraliser-ses-recherches'}
						className={'text-sm text-slate-600'}
					>
						Centraliser ses recherches
					</Link>
					<Link
						href={'/particulier/explorer-les-profils'}
						className={'text-sm text-slate-600'}
					>
						Explorer les profils
					</Link>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>
							Maquilleuses
						</h4>
					</div>
					<Link href={'/maquilleuse'} className={'text-sm text-slate-600'}>
						Pourquoi My Makeup ?
					</Link>
					<Link
						href={'/maquilleuse/partenariats'}
						className={'text-sm text-slate-600'}
					>
						Community & Partenariats
					</Link>
					<Link
						href={'/maquilleuse/partenaires'}
						className={'text-sm text-slate-600'}
					>
						Nos partenaires
					</Link>
					<Link href={'/affiliation'} className={'text-sm text-slate-600'}>
						Programme d&apos;affiliation
					</Link>
					<Link href={'/parrainage'} className={'text-sm text-slate-600'}>
						Programme de parrainage
					</Link>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>Ressources</h4>
					</div>
					<Link
						href={'/solutions/pour-les-particuliers'}
						className={'text-sm text-slate-600'}
					>
						Solution pour les particuliers
					</Link>
					<Link
						href={'/solutions/pour-les-maquilleuses'}
						className={'text-sm text-slate-600'}
					>
						Solution pour les maquilleuses
					</Link>
					<Link href={'/blog'} className={'text-sm text-slate-600'}>
						Blog
					</Link>
					<Link href={'/help'} className={'text-sm text-slate-600'}>
						Aide
					</Link>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>My Makeup</h4>
					</div>
					<Link href={'/a-propos'} className={'text-sm text-slate-600'}>
						À propos de My Makeup
					</Link>
					<Link href={'/contact'} className={'text-sm text-slate-600'}>
						Contact
					</Link>
					<Link href={'/mentions-legales'} className={'text-sm text-slate-600'}>
						Mentions légales
					</Link>
					<Link href={'/cgv'} className={'text-sm text-slate-600'}>
						Conditions générales de vente
					</Link>
					<Link href={'/cgu'} className={'text-sm text-slate-600'}>
						Conditions générales d&apos;utilisation
					</Link>
					<Link
						href={'/politique-de-confidentialite'}
						className={'text-sm text-slate-600'}
					>
						Politique de confidentialité
					</Link>
					<Link href={'/site-map'} className={'text-sm text-slate-600'}>
						Plan du site
					</Link>
				</div>
			</footer>
			<div className={'mx-auto flex w-full max-w-7xl bg-white py-20'}>
				<p className={'mx-auto text-sm text-slate-600'}>
					© {year} My Makeup - Tous droits réservés - Developed with ❤️ by{' '}
					<Link
						className={'text-sm text-slate-600'}
						href={'https://andy-cinquin.fr'}
					>
						Andy Cinquin & Bréval Le Floch
					</Link>
				</p>
			</div>
		</>
	)
}

export default Footer
