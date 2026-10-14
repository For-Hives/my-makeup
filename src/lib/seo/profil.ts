/**
 * The head of the public page of a profile (ticket 105; plan 03 SEO-21 and SEO-26; plan 02 U47 to
 * U50): its title, its description and its structured data. Pure, so the tests call it without a
 * database.
 *
 * The structured data says only what the page shows: her name, her speciality, her commune, her
 * skills and languages, her public networks and her offers in euros. Never an email, a telephone
 * number, a postal address or a rating, and nothing at all of a person unless the profile is
 * publishable (a profile that is not has its breadcrumb only, as on the old site).
 */

import type { Metadata } from 'next'
import type { ProfilPublic } from '@/services/public/profils'
import { SITE_ORIGIN } from '../urls-gelees'
import { NOM_DU_SITE } from './json-ld'
import { metadonnees } from './metadonnees'
import { MARQUE, TITRE_MAX, texteSur, tronquer } from './texte'
import { urlCanonique } from './url'

/** The address path of a profile. */
export const cheminDuProfil = (slug: string): string => `/profil/${slug}`

/** « Maquilleuse mariage à Annecy », or whatever of the speciality and the commune she gave. */
function detailDuProfil({ specialite, lieu }: Pick<ProfilPublic, 'specialite' | 'lieu'>): string {
	if (specialite) return lieu ? `${specialite} à ${lieu}` : specialite
	return lieu ? `maquilleuse à ${lieu}` : 'maquilleuse professionnelle'
}

/** The title: « Nom – détail | My-Makeup » when it fits in 60 characters, else the shorter forms. */
export function titreDuProfil(profil: Pick<ProfilPublic, 'nom' | 'specialite' | 'lieu'>): string {
	const nom = texteSur(profil.nom)
	const detail = detailDuProfil(profil)
	const candidats = [`${nom} – ${detail} | ${MARQUE}`, `${nom} – ${detail}`, `${nom} | ${MARQUE}`]
	return candidats.find(titre => titre.length <= TITRE_MAX) ?? tronquer(nom, TITRE_MAX)
}

/** The meta tags of the page of a profile: not publishable means noindex and no canonical address. */
export function metadonneesDuProfil(profil: ProfilPublic): Metadata {
	const detail = detailDuProfil(profil)
	return metadonnees({
		titre: titreDuProfil(profil),
		description: profil.description,
		repli: `Découvre ${profil.nom}, ${detail}, sur ${MARQUE} : prestations, tarifs et moyens de contact.`,
		chemin: cheminDuProfil(profil.slug),
		indexable: profil.indexable,
	})
}

/** Drops null, undefined, empty texts, empty lists and empty objects, deeply: the data never says « null ». */
export function sansVides(valeur: unknown): unknown {
	if (Array.isArray(valeur)) {
		const liste = valeur.map(sansVides).filter(element => element !== undefined)
		return liste.length > 0 ? liste : undefined
	}
	if (valeur !== null && typeof valeur === 'object') {
		const objet = Object.fromEntries(
			Object.entries(valeur)
				.map(([cle, element]) => [cle, sansVides(element)] as const)
				.filter(([, element]) => element !== undefined)
		)
		return Object.keys(objet).length > 0 ? objet : undefined
	}
	if (valeur === null || valeur === undefined || valeur === '') return undefined
	if (typeof valeur === 'number' && !Number.isFinite(valeur)) return undefined
	return valeur
}

/** The breadcrumb of a profile: the home page, then the profile. */
export function filDArianeDuProfil(profil: Pick<ProfilPublic, 'nom' | 'slug'>) {
	const etapes = [
		{ nom: 'Accueil', url: urlCanonique('/') },
		{ nom: texteSur(profil.nom), url: urlCanonique(cheminDuProfil(profil.slug)) },
	]
	return {
		'@type': 'BreadcrumbList',
		itemListElement: etapes.map((etape, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: etape.nom,
			item: etape.url,
		})),
	}
}

const unique = <T>(liste: readonly T[]): T[] => [...new Set(liste)]
const adresseAbsolue = (adresse: string | null | undefined): string =>
	typeof adresse === 'string' && /^https?:\/\//i.test(adresse) ? adresse : ''

/**
 * The structured data of the page of a profile: a `ProfilePage` whose main entity is the `Person`,
 * and the breadcrumb. The offers are in euros; the lowest amount among them is `profil.prixMinimal`.
 */
export function donneesStructureesDuProfil(profil: ProfilPublic) {
	const url = urlCanonique(cheminDuProfil(profil.slug))
	const filDAriane = filDArianeDuProfil(profil)
	if (!profil.indexable) return sansVides({ '@context': 'https://schema.org', '@graph': [filDAriane] })

	const idPersonne = `${url}#personne`
	const zone = profil.lieu ? { '@type': 'City', name: profil.lieu } : null
	const specialite = profil.specialite ?? ''
	const personne = {
		'@type': 'Person',
		'@id': idPersonne,
		name: profil.nom,
		url,
		image: adresseAbsolue(profil.photo?.url),
		jobTitle: specialite || 'Maquilleuse professionnelle',
		description: tronquer(texteSur(profil.description), 300),
		areaServed: zone,
		knowsAbout: unique(profil.competences).slice(0, 10),
		knowsLanguage: unique(profil.langues),
		// Her public networks and website: never the email, never the telephone.
		sameAs: unique(
			profil.liens
				.filter(lien => lien.canal !== 'email' && lien.canal !== 'phone')
				.map(lien => adresseAbsolue(lien.href))
		),
		makesOffer: profil.offres.map(offre => ({
			'@type': 'Offer',
			priceCurrency: offre.montant === null ? null : 'EUR',
			price: offre.montant,
			priceSpecification:
				offre.montant === null
					? null
					: { '@type': 'PriceSpecification', minPrice: offre.montant, priceCurrency: 'EUR' },
			itemOffered: {
				'@type': 'Service',
				name: offre.nom,
				description: tronquer(texteSur(offre.description), 300),
				serviceType: specialite || null,
				areaServed: zone,
				provider: { '@id': idPersonne },
			},
		})),
	}
	return sansVides({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'ProfilePage',
				'@id': `${url}#page`,
				url,
				name: titreDuProfil(profil),
				inLanguage: 'fr-FR',
				isPartOf: { '@type': 'WebSite', name: NOM_DU_SITE, url: SITE_ORIGIN },
				mainEntity: personne,
			},
			filDAriane,
		],
	})
}
