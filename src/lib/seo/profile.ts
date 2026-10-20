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
import type { PublicProfile } from '@/services/public/profiles'
import { SITE_ORIGIN } from '../frozen-urls'
import { SITE_NAME } from './json-ld'
import { pageMetadata } from './metadata'
import { shareImageOfPhoto } from './share'
import { BRAND, MAX_TITLE, textAbout, truncate } from './text'
import { canonicalUrl } from './url'

/** The address path of a profile. */
export const profilePath = (slug: string): string => `/profil/${slug}`

/** « Maquilleuse mariage à Annecy », or whatever of the speciality and the commune she gave. */
function profileDetail({ specialite: specialty, lieu }: Pick<PublicProfile, 'specialite' | 'lieu'>): string {
	if (specialty) return lieu ? `${specialty} à ${lieu}` : specialty
	return lieu ? `maquilleuse à ${lieu}` : 'maquilleuse professionnelle'
}

/** The title: « Nom – détail | My-Makeup » when it fits in 60 characters, else the shorter forms. */
export function profileTitle(profil: Pick<PublicProfile, 'nom' | 'specialite' | 'lieu'>): string {
	const name = textAbout(profil.nom)
	const detail = profileDetail(profil)
	const candidates = [`${name} – ${detail} | ${BRAND}`, `${name} – ${detail}`, `${name} | ${BRAND}`]
	return candidates.find(titre => titre.length <= MAX_TITLE) ?? truncate(name, MAX_TITLE)
}

/** The meta tags of the page of a profile: not publishable means noindex and no canonical address. */
export function profileMetadata(profil: PublicProfile): Metadata {
	const detail = profileDetail(profil)
	return pageMetadata({
		titre: profileTitle(profil),
		description: profil.description,
		repli: `Découvre ${profil.nom}, ${detail}, sur ${BRAND} : prestations, tarifs et moyens de contact.`,
		chemin: profilePath(profil.slug),
		indexable: profil.indexable,
		typeDePartage: 'profile',
		// Her main photo, lightened; the picture of the site when she has none.
		image: shareImageOfPhoto(profil.photo),
	})
}

/** Drops null, undefined, empty texts, empty lists and empty objects, deeply: the data never says « null ». */
export function withoutEmpty(valeur: unknown): unknown {
	if (Array.isArray(valeur)) {
		const list = valeur.map(withoutEmpty).filter(element => element !== undefined)
		return list.length > 0 ? list : undefined
	}
	if (valeur !== null && typeof valeur === 'object') {
		const object = Object.fromEntries(
			Object.entries(valeur)
				.map(([cle, element]) => [cle, withoutEmpty(element)] as const)
				.filter(([, element]) => element !== undefined)
		)
		return Object.keys(object).length > 0 ? object : undefined
	}
	if (valeur === null || valeur === undefined || valeur === '') return undefined
	if (typeof valeur === 'number' && !Number.isFinite(valeur)) return undefined
	return valeur
}

/** The breadcrumb of a profile: the home page, then the profile. */
export function profileBreadcrumb(profil: Pick<PublicProfile, 'nom' | 'slug'>) {
	const steps = [
		{ nom: 'Accueil', url: canonicalUrl('/') },
		{ nom: textAbout(profil.nom), url: canonicalUrl(profilePath(profil.slug)) },
	]
	return {
		'@type': 'BreadcrumbList',
		itemListElement: steps.map((etape, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: etape.nom,
			item: etape.url,
		})),
	}
}

const unique = <T>(liste: readonly T[]): T[] => [...new Set(liste)]
const absoluteUrl = (adresse: string | null | undefined): string =>
	typeof adresse === 'string' && /^https?:\/\//i.test(adresse) ? adresse : ''

/**
 * The structured data of the page of a profile: a `ProfilePage` whose main entity is the `Person`,
 * and the breadcrumb. The offers are in euros; the lowest amount among them is `profil.prixMinimal`.
 */
export function profileStructuredData(profil: PublicProfile) {
	const url = canonicalUrl(profilePath(profil.slug))
	const breadcrumb = profileBreadcrumb(profil)
	if (!profil.indexable) return withoutEmpty({ '@context': 'https://schema.org', '@graph': [breadcrumb] })

	const personId = `${url}#personne`
	const zone = profil.lieu ? { '@type': 'City', name: profil.lieu } : null
	const specialty = profil.specialite ?? ''
	const person = {
		'@type': 'Person',
		'@id': personId,
		name: profil.nom,
		url,
		image: absoluteUrl(profil.photo?.url),
		jobTitle: specialty || 'Maquilleuse professionnelle',
		description: truncate(textAbout(profil.description), 300),
		areaServed: zone,
		knowsAbout: unique(profil.competences).slice(0, 10),
		knowsLanguage: unique(profil.langues),
		// Her public networks and website: never the email, never the telephone.
		sameAs: unique(
			profil.liens.filter(lien => lien.canal !== 'email' && lien.canal !== 'phone').map(lien => absoluteUrl(lien.href))
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
				description: truncate(textAbout(offre.description), 300),
				serviceType: specialty || null,
				areaServed: zone,
				provider: { '@id': personId },
			},
		})),
	}
	return withoutEmpty({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'ProfilePage',
				'@id': `${url}#page`,
				url,
				name: profileTitle(profil),
				inLanguage: 'fr-FR',
				isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_ORIGIN },
				mainEntity: person,
			},
			breadcrumb,
		],
	})
}
