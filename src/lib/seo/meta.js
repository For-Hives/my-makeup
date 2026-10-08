/**
 * Tags of the <head> (SEO-10, SEO-12, plans/02 U44-U52): title, description,
 * canonical, robots, minimal Open Graph and Twitter tags, and JSON-LD.
 * - profile: Person (speciality, city, skills, languages, networks) offering
 *   its services (Offer → Service, prices in EUR), on publiable profiles
 *   only; never an email, a phone, a postal address nor a rating;
 * - BreadcrumbList on profiles, talents and articles;
 * - a page that is not indexed has no canonical (no mixed signal).
 */

import { completude, prixNumerique } from '../profil/completude.js'
import {
	attributs,
	contacts,
	galerie,
	nomAffiche,
	offres,
	photoPrincipale,
	texte,
	urlMedia,
} from '../profil/vue-publique.js'
import { villeAffichee } from '../format-zone.js'
import { cheminProfil } from '../slug.js'
import { NOINDEX } from './robots.js'
import { chemin, urlAbsolue } from './url.js'

export const MARQUE = 'My-Makeup'
export const TITRE_MAX = 60
export const DESCRIPTION_MIN = 70
export const DESCRIPTION_MAX = 155
/** Shared picture when a page has none of its own (1200 × 630) */
export const IMAGE_PAR_DEFAUT = '/assets/og-my-makeup.jpg'
/** Hosts of images.remotePatterns in next.config.js (checked by the tests) */
export const HOTES_OPTIMISEUR = ['r2-my-makeup.andy-cinquin.fr']
/** Weight above which WhatsApp may leave a picture out of a link preview */
export const POIDS_PARTAGE_MAX_KO = 300
/** Width of a shared picture (1200 is one of the widths next/image allows) */
export const LARGEUR_PARTAGE = 1200

const espaces = v => texte(v).replace(/\s+/g, ' ')

/**
 * Cut on a word boundary, with an ellipsis, `max` characters at most.
 * @param {unknown} v
 * @param {number} max
 * @returns {string}
 */
export function tronquer(v, max) {
	const t = espaces(v)
	if (t.length <= max) return t
	const coupe = t.slice(0, max - 1)
	const mot = coupe.replace(/\s+\S*$/, '')
	return `${(mot.length >= max / 2 ? mot : coupe).replace(/[\s,;:.–-]+$/, '')}…`
}

/**
 * Markdown or HTML reduced to plain text, for descriptions.
 * @param {unknown} v
 * @returns {string}
 */
export function texteBrut(v) {
	return espaces(
		texte(v)
			.replace(/<[^>]*>/g, ' ')
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/[#*_>`~|]+/g, ' ')
	)
}

/**
 * Meta description of 155 characters at most: the first text of 70
 * characters or more, else the fallback sentence (written to reach 70).
 * @param {unknown|unknown[]} v - a text, or texts in order of preference
 * @param {string} repli
 * @returns {string}
 */
export function descriptionMeta(v, repli) {
	const t = (Array.isArray(v) ? v : [v])
		.map(texteBrut)
		.find(candidat => candidat.length >= DESCRIPTION_MIN)
	return tronquer(t ?? repli, DESCRIPTION_MAX)
}

/**
 * Meta description of a talent or an article: the SEO text written by the
 * editorial team is kept as it is, even under 70 characters (cut at 155);
 * descriptionMeta() of the other texts only when it is empty.
 * @param {unknown} seoDescription
 * @param {unknown[]} autres
 * @param {string} repli
 * @returns {string}
 */
export function descriptionEditoriale(seoDescription, autres, repli) {
	const redigee = texteBrut(seoDescription)
	return redigee
		? tronquer(redigee, DESCRIPTION_MAX)
		: descriptionMeta(autres, repli)
}

/**
 * Title of a page: « <titre> | My-Makeup » when it fits in 60 characters.
 * @param {unknown} v
 * @returns {string}
 */
export function titrePage(v) {
	const t = espaces(v) || MARQUE
	if (t.includes(MARQUE)) return tronquer(t, TITRE_MAX)
	const complet = `${t} | ${MARQUE}`
	return complet.length <= TITRE_MAX ? complet : tronquer(t, TITRE_MAX)
}

/**
 * og:image of a Strapi picture (SEO-12), never the uploaded original when a
 * lighter one exists: the originals weigh up to 1.4 MB (production on
 * 2026-10-08: 28 main pictures of 49 over 300 KB, and no resized copy), more
 * than WhatsApp shows in a preview. In order:
 * - a copy resized by Strapi (large, medium, small) of 300 KB at most;
 * - the original through the image optimizer of Next.js (/_next/image, the
 *   one next/image uses), 1200 px wide, when its host is allowed there: a
 *   JPEG of 1.4 MB comes out at about 150 KB, a PNG stays a PNG;
 * - the original.
 * @param {import('../profil/vue-publique.js').Media|null} media
 * @param {{apiBase?: string, site?: string}} [options]
 * @returns {string} absolute URL, '' without a picture
 */
export function urlImagePartage(media, { apiBase = '', site } = {}) {
	if (!media) return ''
	const copie = ['large', 'medium', 'small']
		.map(nom => media.formats?.[nom])
		.find(c => c && !(c.taille > POIDS_PARTAGE_MAX_KO))
	if (copie) return urlMedia(copie.url, apiBase)
	const original = urlMedia(media.url, apiBase)
	let hote = ''
	try {
		const url = new URL(original)
		if (url.protocol === 'https:') hote = url.hostname
	} catch {
		return original
	}
	if (!HOTES_OPTIMISEUR.includes(hote)) return original
	const requete = `url=${encodeURIComponent(original)}&w=${LARGEUR_PARTAGE}&q=75`
	return `${urlAbsolue('/_next/image', site)}?${requete}`
}

/**
 * @typedef {object} Seo
 * @property {string} titre
 * @property {string} description
 * @property {string} url - absolute URL of the page (og:url)
 * @property {boolean} indexable
 * @property {string} image - absolute URL
 * @property {'website'|'profile'|'article'} type
 * @property {object[]} jsonLd
 */

/**
 * The tags of a page, in order, for components/Global/Seo.js.
 * @param {Seo} seo
 * @returns {Array<{cle: string, nom?: string, propriete?: string, contenu: string}>}
 */
export function balisesMeta({
	titre,
	description,
	url,
	indexable,
	image,
	type,
}) {
	const balises = [
		{ cle: 'description', nom: 'description', contenu: description },
		...(indexable ? [] : [{ cle: 'robots', nom: 'robots', contenu: NOINDEX }]),
		{ cle: 'og:type', propriete: 'og:type', contenu: type },
		{ cle: 'og:site_name', propriete: 'og:site_name', contenu: MARQUE },
		{ cle: 'og:locale', propriete: 'og:locale', contenu: 'fr_FR' },
		{ cle: 'og:title', propriete: 'og:title', contenu: titre },
		{
			cle: 'og:description',
			propriete: 'og:description',
			contenu: description,
		},
		{ cle: 'og:url', propriete: 'og:url', contenu: url },
		{ cle: 'og:image', propriete: 'og:image', contenu: image },
		{
			cle: 'twitter:card',
			nom: 'twitter:card',
			contenu: 'summary_large_image',
		},
		{ cle: 'twitter:title', nom: 'twitter:title', contenu: titre },
		{
			cle: 'twitter:description',
			nom: 'twitter:description',
			contenu: description,
		},
		{ cle: 'twitter:image', nom: 'twitter:image', contenu: image },
	]
	return balises.filter(b => typeof b.contenu === 'string' && b.contenu !== '')
}

/**
 * Drops null, undefined, '' and empty arrays or objects, deeply: the JSON-LD
 * never says « null ».
 * @param {unknown} v
 * @returns {unknown}
 */
export function sansVides(v) {
	if (Array.isArray(v)) {
		const l = v.map(sansVides).filter(x => x !== undefined)
		return l.length ? l : undefined
	}
	if (v && typeof v === 'object') {
		const o = Object.fromEntries(
			Object.entries(v)
				.map(([k, x]) => [k, sansVides(x)])
				.filter(([, x]) => x !== undefined)
		)
		return Object.keys(o).length ? o : undefined
	}
	if (v === null || v === undefined || v === '') return undefined
	if (typeof v === 'number' && !Number.isFinite(v)) return undefined
	return v
}

/**
 * JSON for a <script type="application/ld+json">: <, > and & escaped, so a
 * text typed by an artist can never close the script.
 * @param {unknown} donnees
 * @returns {string}
 */
export function serialiserJsonLd(donnees) {
	return JSON.stringify(sansVides(donnees) ?? {})
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029')
}

/**
 * @param {Array<{nom: string, url: string}>} etapes - from the home page
 * @returns {object}
 */
export function jsonLdFilAriane(etapes) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: etapes.map((etape, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: etape.nom,
			item: etape.url,
		})),
	}
}

const unique = l => [...new Set(l.filter(Boolean))]

/**
 * SEO of a public profile.
 * @param {object} options
 * @param {object} options.profil - content API entry or its attributes
 * @param {string} options.slug
 * @param {string} options.site - urlDuSite()
 * @param {string} [options.apiBase] - NEXT_PUBLIC_API_URL, for /uploads paths
 * @param {boolean} [options.formulaireDevis] - the quote form is online
 * @returns {Seo}
 */
export function seoProfil({
	profil,
	slug,
	site,
	apiBase = '',
	formulaireDevis = false,
}) {
	const p = attributs(profil)
	const nom = nomAffiche(p)
	const specialite = espaces(p.speciality)
	const ville = villeAffichee(p.city)
	const detail = specialite
		? ville
			? `${specialite} à ${ville}`
			: specialite
		: ville
			? `maquilleuse à ${ville}`
			: 'maquilleuse professionnelle'
	const url = urlAbsolue(cheminProfil(slug), site)
	const indexable = completude(p, { formulaireDevis }).publiable
	const principale = photoPrincipale(p)
	// the JSON-LD names the original, the previews a lighter copy
	const photo = urlMedia(principale?.url, apiBase)
	const image =
		urlImagePartage(principale, { apiBase, site }) ||
		urlAbsolue(IMAGE_PAR_DEFAUT, site)

	const candidats = [
		`${nom} – ${detail} | ${MARQUE}`,
		`${nom} – ${detail}`,
		`${nom} | ${MARQUE}`,
	]
	const titre =
		candidats.find(t => t.length <= TITRE_MAX) ?? tronquer(nom, TITRE_MAX)
	const description = descriptionMeta(
		p.description,
		`Découvrez ${nom}, ${detail}, sur ${MARQUE} : prestations, tarifs et moyens de contact.`
	)

	const jsonLd = [
		jsonLdFilAriane([
			{ nom: 'Accueil', url: urlAbsolue('/', site) },
			{ nom, url },
		]),
	]
	if (indexable) {
		const idPersonne = `${url}#personne`
		const zone = ville ? { '@type': 'City', name: ville } : null
		jsonLd.unshift({
			'@context': 'https://schema.org',
			'@type': 'Person',
			'@id': idPersonne,
			name: nom,
			url,
			image: photo || null,
			jobTitle: specialite || 'Maquilleuse professionnelle',
			description: tronquer(texteBrut(p.description), 300),
			workLocation: zone ? { '@type': 'Place', name: ville } : null,
			knowsAbout: unique(
				(Array.isArray(p.skills) ? p.skills : []).map(s => espaces(s?.name))
			).slice(0, 10),
			knowsLanguage: unique(
				(Array.isArray(p.language) ? p.language : []).map(l => espaces(l?.name))
			),
			// networks and website only: never the email nor the phone
			sameAs: unique(
				contacts(p.network)
					.filter(c => !['email', 'phone'].includes(c.canal))
					.map(c => c.href)
			),
			makesOffer: offres(p).map(offre => {
				const prix = prixNumerique(offre.price)
				return {
					'@type': 'Offer',
					itemOffered: {
						'@type': 'Service',
						name: espaces(offre.name),
						description: tronquer(texteBrut(offre.description), 300),
						serviceType: specialite || null,
						areaServed: zone,
						provider: { '@id': idPersonne },
					},
					priceSpecification:
						prix === null
							? null
							: {
									'@type': 'PriceSpecification',
									minPrice: prix,
									priceCurrency: 'EUR',
								},
				}
			}),
			subjectOf: galerie(p).length
				? {
						'@type': 'ImageGallery',
						image: galerie(p)
							.map(m => urlMedia(m.url, apiBase))
							.filter(Boolean)
							.slice(0, 10),
					}
				: null,
		})
	}

	return { titre, description, url, indexable, image, type: 'profile', jsonLd }
}

/**
 * SEO of a fixed page whose title and description are written in the page:
 * titrePage() (60 characters at most) and 155 characters of description at
 * most, so the og: and twitter: copies stay within bounds too.
 * @param {object} options
 * @param {string} options.titre
 * @param {string} options.description
 * @param {string} options.chemin - e.g. '/'
 * @param {string} options.site
 * @returns {Seo}
 */
export function seoPage({ titre, description, chemin: cheminPage, site }) {
	return {
		titre: titrePage(titre),
		description: tronquer(texteBrut(description), DESCRIPTION_MAX),
		url: urlAbsolue(cheminPage, site),
		indexable: true,
		image: urlAbsolue(IMAGE_PAR_DEFAUT, site),
		type: 'website',
		jsonLd: [],
	}
}

/**
 * SEO of a talent page (/talent/<slug>).
 * @param {object} options
 * @param {object} options.talent - content API entry or its attributes
 * @param {string} options.site
 * @returns {Seo}
 */
export function seoTalent({ talent, site }) {
	const t = attributs(talent)
	const nom = espaces(t.title) || espaces(t.seo_title) || 'Talent'
	const url = urlAbsolue(chemin('talent', texte(t.slug)), site)
	return {
		titre: titrePage(nom),
		description: descriptionEditoriale(
			t.seo_description,
			[t.description],
			`${nom} : découvrez les maquilleuses professionnelles de cette spécialité sur ${MARQUE}.`
		),
		url,
		indexable: true,
		image: urlAbsolue(IMAGE_PAR_DEFAUT, site),
		type: 'website',
		jsonLd: [
			jsonLdFilAriane([
				{ nom: 'Accueil', url: urlAbsolue('/', site) },
				{ nom, url },
			]),
		],
	}
}

/**
 * SEO of an article (/blog/<slug>).
 * @param {object} options
 * @param {object} options.article - content API entry or its attributes
 * @param {string} options.site
 * @param {string} [options.apiBase]
 * @returns {Seo}
 */
export function seoArticle({ article, site, apiBase = '' }) {
	const a = attributs(article)
	const nom = espaces(a.title) || espaces(a.seo_title) || 'Article'
	const url = urlAbsolue(chemin('blog', texte(a.slug)), site)
	const image =
		medias0(a.galery, { apiBase, site }) || urlAbsolue(IMAGE_PAR_DEFAUT, site)
	return {
		titre: titrePage(espaces(a.seo_title) || nom),
		description: descriptionEditoriale(
			a.seo_description,
			[a.excerpt, a.content],
			`${nom} : un article du blog de ${MARQUE} sur le maquillage et les maquilleuses professionnelles.`
		),
		url,
		indexable: true,
		image,
		type: 'article',
		jsonLd: [
			jsonLdFilAriane([
				{ nom: 'Accueil', url: urlAbsolue('/', site) },
				{ nom: 'Blog', url: urlAbsolue('/blog', site) },
				{ nom, url },
			]),
		],
	}
}

// first picture of a media field (articles: `galery`, which may hold files)
function medias0(champ, options) {
	const fichiers = galerie({ image_gallery: champ })
	const image = fichiers.find(m => /\.(jpe?g|png|webp)(\?|$)/i.test(m.url))
	return image ? urlImagePartage(image, options) : ''
}
