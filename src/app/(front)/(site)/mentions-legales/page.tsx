import Link from 'next/link'
import { PageJuridique } from '@/components/legal/PageJuridique'
import { EDITEUR, formatSiren, formatSiret, HEBERGEUR } from '@/lib/legal'
import { metadonnees } from '@/lib/seo/metadonnees'

// Static: the text is in the code, and the page reads no cookie and no data (ticket 112).
export const metadata = metadonnees({
	titre: 'Mentions légales',
	description: 'Mentions légales du site my-makeup.fr : éditeur, directeur de la publication, hébergeur et contact.',
	repli: 'Mentions légales du site my-makeup.fr : éditeur, directeur de la publication, hébergeur et contact.',
	chemin: '/mentions-legales',
})

export default function MentionsLegales() {
	return (
		<PageJuridique
			titre={
				<>
					Mentions légales de&nbsp;
					<span className="text-indigo-900">My&nbsp;Makeup</span>
				</>
			}
			description="Qui édite et qui héberge le site."
			titreDuTexte="Mentions légales"
		>
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
				<a href={HEBERGEUR.site} rel={'noopener nofollow noreferrer'} target={'_blank'}>
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
				<Link href={'/politique-de-confidentialite'}>politique de confidentialité</Link>
				{' et les '}
				<Link href={'/cgu'}>conditions générales d&apos;utilisation</Link>
				{'.'}
			</p>
		</PageJuridique>
	)
}
