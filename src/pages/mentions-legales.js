import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import Head from 'next/head'
import Hero from '@/components/Global/Hero'
import Link from 'next/link'
import { EDITEUR, HEBERGEUR, formatSiren, formatSiret } from '@/lib/legal'
import { urlAbsolue } from '@/lib/seo/url'

function MentionsLegales() {
	return (
		<>
			<Head>
				<title>Mentions légales - My-Makeup</title>
				<meta
					name="description"
					content="Mentions légales du site my-makeup.fr : éditeur, directeur de la publication, hébergeur et contact."
				/>
				{/*	seo tag canonical link */}
				<link rel="canonical" href={urlAbsolue('/mentions-legales')} />
			</Head>

			<Nav />
			<main className={'relative'}>
				<Hero
					title={
						<>
							Mentions légales de&nbsp;
							<span className={'text-indigo-900'}>My&nbsp;Makeup</span>
						</>
					}
					description={<>{'Qui édite et qui héberge le site.'}</>}
					isSearchDisplayed={false}
					isCTALoginDisplayed={false}
					isSimpleVersionDisplayed={true}
				/>
				<div
					className={'relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0'}
				>
					<div className="mx-auto max-w-2xl">
						<article>
							<header className="flex flex-col">
								<h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 sm:text-4xl">
									Mentions légales
								</h2>
							</header>
							<div className="prose my-8 xl:prose-lg">
								<h2>Éditeur du site</h2>
								<p>
									{`Le site my-makeup.fr est édité par ${EDITEUR.nom}, ${EDITEUR.forme}.`}
									<br />
									{`SIREN : ${formatSiren(EDITEUR.siren)}`}
									<br />
									{`SIRET : ${formatSiret(EDITEUR.siret)}`}
									<br />
									{`Adresse : ${EDITEUR.adresse}`}
									<br />
									{'Email : '}
									<a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>
									<br />
									{`Téléphone : ${EDITEUR.telephone}`}
								</p>
								<h2>Directeur de la publication</h2>
								<p>{EDITEUR.directeurPublication}</p>
								<h2>Hébergement</h2>
								<p>
									{HEBERGEUR.nom}
									<br />
									{HEBERGEUR.adresse}
									<br />
									{`Téléphone : ${HEBERGEUR.telephone}`}
									<br />
									<a
										href={HEBERGEUR.site}
										rel={'noopener nofollow noreferrer'}
										target={'_blank'}
									>
										{HEBERGEUR.site.replace('https://', '')}
									</a>
								</p>
								<h2>Contenus publiés par les maquilleuses</h2>
								<p>
									{`Chaque maquilleuse rédige et met à jour elle-même son profil (textes, photos, tarifs, coordonnées) et en est responsable. My-Makeup ne vérifie pas ces informations à ce jour.`}
								</p>
								<h2>Signaler un contenu</h2>
								<p>
									{`Pour signaler un contenu illicite, une photo publiée sans autorisation ou une utilisation frauduleuse du site, écrivez à `}
									<a href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>
									{` en indiquant l'adresse de la page concernée et le motif du signalement. Le contenu est examiné et retiré s'il est manifestement illicite.`}
								</p>
								<h2>Propriété intellectuelle</h2>
								<p>
									{`Les textes, le logo et la présentation du site appartiennent à l'éditeur. Les photos des profils appartiennent à leurs auteurs. Toute reproduction sans autorisation est interdite.`}
								</p>
								<h2>Données personnelles et conditions d&apos;utilisation</h2>
								<p>
									{'Voir la '}
									<Link href={'/politique-de-confidentialite'}>
										politique de confidentialité
									</Link>
									{' et les '}
									<Link href={'/cgu'}>
										conditions générales d&apos;utilisation
									</Link>
									{'.'}
								</p>
							</div>
						</article>
					</div>
				</div>
			</main>

			<Footer />
		</>
	)
}

export default MentionsLegales
