import Image from 'next/image'
import Link from 'next/link'
import { COLONNES_DE_PIED, RESEAUX } from './liens'
import { Signature } from './Signature'

export function Footer() {
	return (
		<>
			<footer className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pt-24 md:flex-row md:gap-10 md:px-8 2xl:px-0">
				<div className="flex flex-col gap-6">
					<div className="flex items-center justify-start gap-3">
						<Image src="/assets/logo.webp" alt="Logo My-Makeup" width={50} height={50} />
						<p className="font-bold text-2xl text-my-makeup-900">My-Makeup</p>
					</div>
					<p className="text-gray-600 text-sm">
						Sciez,
						<br />
						Haute-Savoie
					</p>
					<ul className="flex flex-row gap-3 md:flex-col lg:flex-row">
						{RESEAUX.map(reseau => (
							<li key={reseau.href}>
								<Link href={reseau.href} rel="noopener nofollow noreferrer">
									<Image src={reseau.icone} width={35} height={35} alt={reseau.nom} />
								</Link>
							</li>
						))}
					</ul>
				</div>
				{COLONNES_DE_PIED.map(colonne => (
					<nav key={colonne.titre} aria-label={colonne.titre} className="flex flex-col gap-6">
						<p className="mb-2 font-bold text-indigo-800 text-xl">{colonne.titre}</p>
						{colonne.liens.map(lien => (
							<Link key={lien.href} href={lien.href} className="text-gray-600 text-sm">
								{lien.nom}
							</Link>
						))}
					</nav>
				))}
			</footer>
			<Signature />
		</>
	)
}
