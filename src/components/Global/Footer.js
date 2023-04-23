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
						<a href="src/components#">
							<Image
								src={'/assets/vectorials-used/fi-brands-instagram.svg'}
								className={'fill-indigo-700'}
								width={'20'}
								height={'20'}
								alt={'Instagram My Makeup'}
							/>
						</a>
						<a href="src/components#">
							<Image
								src={'/assets/vectorials-used/fi-brands-linkedin.svg'}
								className={'fill-indigo-700'}
								width={'20'}
								height={'20'}
								alt={'Linkedin My Makeup'}
							/>
						</a>
						<a href="src/components#">
							<Image
								src={'/assets/vectorials-used/fi-brands-telegram.svg'}
								className={'fill-indigo-700'}
								width={'20'}
								height={'20'}
								alt={'Mail My Makeup'}
							/>
						</a>
					</div>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>
							Particuliers
						</h4>
					</div>
					<a href={'/particulier'} className={'text-sm text-slate-600'}>
						Pourquoi My Makeup ?
					</a>
					<a
						href={'/particulier/trouver-une-maquilleuse'}
						className={'text-sm text-slate-600'}
					>
						Trouver des maquilleuses
					</a>
					<a
						href={'/particulier/centraliser-ses-recherches'}
						className={'text-sm text-slate-600'}
					>
						Centraliser ses recherches
					</a>
					<a
						href={'/particulier/explorer-les-profils'}
						className={'text-sm text-slate-600'}
					>
						Explorer les profils
					</a>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>
							Maquilleuses
						</h4>
					</div>
					<a href={'/maquilleuse'} className={'text-sm text-slate-600'}>
						Pourquoi My Makeup ?
					</a>
					<a
						href={'/maquilleuse/partenariats'}
						className={'text-sm text-slate-600'}
					>
						Community & Partenariats
					</a>
					<a
						href={'/maquilleuse/partenaires'}
						className={'text-sm text-slate-600'}
					>
						Nos partenaires
					</a>
					<a href={'/affiliation'} className={'text-sm text-slate-600'}>
						Programme d&apos;affiliation
					</a>
					<a href={'/parrainage'} className={'text-sm text-slate-600'}>
						Programme de parrainage
					</a>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>Ressources</h4>
					</div>
					<a
						href={'/solutions/pour-les-particuliers'}
						className={'text-sm text-slate-600'}
					>
						Solution pour les particuliers
					</a>
					<a
						href={'/solutions/pour-les-maquilleuses'}
						className={'text-sm text-slate-600'}
					>
						Solution pour les maquilleuses
					</a>
					<a href={'/blog'} className={'text-sm text-slate-600'}>
						Blog
					</a>
					<a href={'/help'} className={'text-sm text-slate-600'}>
						Aide
					</a>
				</div>
				<div className={'flex flex-col gap-6'}>
					<div className={'mb-2 flex items-center justify-start gap-3'}>
						<h4 className={'text-xl font-bold text-indigo-800'}>My Makeup</h4>
					</div>
					<a href={'/a-propos'} className={'text-sm text-slate-600'}>
						À propos de My Makeup
					</a>
					<a href={'/contact'} className={'text-sm text-slate-600'}>
						Contact
					</a>
					<a href={'/mentions-legales'} className={'text-sm text-slate-600'}>
						Mentions légales
					</a>
					<a href={'/cgv'} className={'text-sm text-slate-600'}>
						Conditions générales de vente
					</a>
					<a href={'/cgu'} className={'text-sm text-slate-600'}>
						Conditions générales d&apos;utilisation
					</a>
					<Link
						href={'/politique-de-confidentialite'}
						className={'text-sm text-slate-600'}
					>
						Politique de confidentialité
					</Link>
					<a href={'/site-map'} className={'text-sm text-slate-600'}>
						Plan du site
					</a>
				</div>
			</footer>
			<div className={'mx-auto flex w-full max-w-7xl bg-white py-20'}>
				<p className={'mx-auto text-sm text-slate-600'}>
					© {year} My Makeup - Tous droits réservés - Developed with ❤️ by{' '}
					<a
						className={'text-sm text-slate-600'}
						href={'https://andy-cinquin.fr'}
					>
						Andy Cinquin
					</a>
				</p>
			</div>
		</>
	)
}

export default Footer
