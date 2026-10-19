import { cheminProfil } from '../slug'
import { SITE_ORIGIN } from '../urls-gelees'
import { cheminPropre } from './url'

/**
 * The sitemap (tickets 113 and 114; plan 03 SEO-22, SEO-23; plan 02 U38 to U43): every address that is
 * indexable, and those alone, in one list shared with the plan of the site.
 *
 * - The fixed pages come from one explicit table (`PAGES_FIXES`), which the plan of the site reads too.
 *   A test fails when a page of the application is in neither this table nor the exclusions.
 * - A profile is there when it is publishable, a talent or an article when it is published: the reading
 *   that gives them is src/services/public/pages-indexables.ts.
 * - No `changefreq`, no `priority`. `lastmod` is the real date of the last change of the document, and is
 *   left out when it is not known (a fixed page).
 * - Every address is built from `SITE_ORIGIN`, the constant apex, so none has a double or a final slash.
 *
 * No `next` import: the module is pure, and tested without Next.
 */

/** The sections of the plan of the site, in the order the plan shows them. */
export const GROUPES_DU_PLAN = [
	{ id: 'site', titre: 'My-Makeup' },
	{ id: 'particuliers', titre: 'Pour les particuliers' },
	{ id: 'maquilleuses', titre: 'Pour les maquilleuses' },
	{ id: 'solutions', titre: 'Par rapport à la solution' },
	{ id: 'legal', titre: 'Légal' },
] as const

export type GroupeDuPlan = (typeof GROUPES_DU_PLAN)[number]['id']

/** A fixed page: its path, its name in the plan of the site, and where the plan puts it. */
export interface PageFixe {
	readonly chemin: string
	/** The link text in the plan of the site. */
	readonly titre: string
	/** The section of the plan; `null` for the home page, which the plan does not list. */
	readonly groupe: GroupeDuPlan | null
	/**
	 * The ticket that builds the page when it does not exist yet. Such a page is in neither the sitemap nor
	 * the plan (it would answer 404); a test fails once its file exists while it is still marked, so that
	 * the ticket that builds it removes the mark.
	 */
	readonly aVenir?: string
}

/** The fixed pages that are indexed, in the order of the sitemap of the old site. */
export const PAGES_FIXES: readonly PageFixe[] = [
	{ chemin: '/', titre: 'Accueil', groupe: null },
	{ chemin: '/a-propos', titre: 'À propos', groupe: 'site' },
	{ chemin: '/blog', titre: 'Blog', groupe: 'solutions' },
	{ chemin: '/contact', titre: 'Contact', groupe: 'site' },
	{
		chemin: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
		titre: 'Pourquoi My-Makeup ?',
		groupe: 'particuliers',
	},
	{ chemin: '/particulier/trouver-une-maquilleuse', titre: 'Trouver une maquilleuse', groupe: 'particuliers' },
	{
		chemin: '/particulier/centraliser-ses-recherches',
		titre: 'Centraliser ses recherches',
		groupe: 'particuliers',
	},
	{ chemin: '/particulier/explorer-les-profils', titre: 'Explorer les profils', groupe: 'particuliers' },
	{
		chemin: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
		titre: 'Pourquoi My-Makeup ?',
		groupe: 'maquilleuses',
	},
	{ chemin: '/maquilleuse/partenariats', titre: 'Communautés & Partenariats', groupe: 'maquilleuses' },
	{ chemin: '/solutions/pour-les-particuliers', titre: 'Solution pour les particuliers', groupe: 'solutions' },
	{ chemin: '/solutions/pour-les-maquilleuses', titre: 'Solution pour les maquilleuses', groupe: 'solutions' },
	{ chemin: '/cgu', titre: 'CGU', groupe: 'legal' },
	{ chemin: '/mentions-legales', titre: 'Mentions légales', groupe: 'legal' },
	{ chemin: '/politique-de-confidentialite', titre: 'Politique de confidentialité', groupe: 'legal' },
]

/** The fixed pages that exist: the ones the sitemap and the plan list. */
export const pagesFixesLivrees = (): PageFixe[] => PAGES_FIXES.filter(page => page.aVenir === undefined)

/**
 * Pages of the application left out of the sitemap on purpose, with the reason. A test fails when a page
 * is in neither this list nor the table above.
 */
export const PAGES_EXCLUES: readonly { readonly chemin: string; readonly raison: string }[] = [
	{ chemin: '/search', raison: 'La recherche répond noindex.' },
	{ chemin: '/site-map', raison: 'Le plan du site est une page de liens, pas une page à indexer en soi.' },
	{ chemin: '/demande-envoyee', raison: 'La page de remerciement répond noindex.' },
	{ chemin: '/toutes-les-news', raison: 'Elle redirige vers /blog (301) : une adresse du sitemap répond 200.' },
	{ chemin: '/sitemap.xml', raison: 'Le sitemap lui-même.' },
	{ chemin: '/robots.txt', raison: 'Le fichier robots.' },
	{
		chemin: '/contact/throttled',
		raison: 'La route qui répond 429 à un message de contact freiné (ticket 161) : aucune page.',
	},
]

/** Path prefixes that are never in the sitemap: the account, the API, the administration, the measuring relay. */
export const PREFIXES_EXCLUS: readonly string[] = ['/auth', '/api', '/admin', '/u']

/** True when the path is left out whatever the data: an exclusion, or under an excluded prefix. */
export function estExclu(chemin: string): boolean {
	const propre = cheminPropre(chemin)
	return (
		PAGES_EXCLUES.some(page => page.chemin === propre) ||
		PREFIXES_EXCLUS.some(prefixe => propre === prefixe || propre.startsWith(`${prefixe}/`))
	)
}

/** What the reading of the indexable documents gives for one of them. */
export interface DocumentIndexable {
	slug: string
	/** The ISO date of its last change, when known. */
	misAJourLe?: string | null
}

export interface EntreeDuSitemap {
	/** The absolute address. */
	loc: string
	/** A W3C datetime, or `null` when the date is unknown. */
	lastmod: string | null
}

/** The date as a W3C datetime, or `null` when it is missing or unreadable. */
export function lastmod(date: unknown): string | null {
	if (typeof date !== 'string' || date.trim() === '') return null
	const instant = Date.parse(date)
	return Number.isNaN(instant) ? null : new Date(instant).toISOString()
}

/** The absolute address of a path: on the apex, one slash between the segments, none at the end. */
export const adresseAbsolue = (chemin: string): string => {
	const propre = cheminPropre(chemin)
	return propre === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${propre}`
}

/**
 * The entries of the sitemap, without duplicates: the fixed pages that exist, then the profiles, the
 * talents and the articles, each by its slug. The caller gives the publishable profiles and the published
 * talents and articles only: this function does not judge them.
 */
export function entreesDuSitemap({
	pages = pagesFixesLivrees(),
	profils = [],
	talents = [],
	articles = [],
}: {
	pages?: readonly PageFixe[]
	profils?: readonly DocumentIndexable[]
	talents?: readonly DocumentIndexable[]
	articles?: readonly DocumentIndexable[]
}): EntreeDuSitemap[] {
	const entrees = new Map<string, EntreeDuSitemap>()
	const ajouter = (chemin: string, date: string | null | undefined): void => {
		if (estExclu(chemin)) return
		const loc = adresseAbsolue(chemin)
		if (!entrees.has(loc)) entrees.set(loc, { loc, lastmod: lastmod(date) })
	}
	for (const page of pages) ajouter(page.chemin, null)
	for (const profil of profils) if (profil.slug) ajouter(cheminProfil(profil.slug), profil.misAJourLe)
	for (const talent of talents)
		if (talent.slug) ajouter(`/talent/${encodeURIComponent(talent.slug)}`, talent.misAJourLe)
	for (const article of articles)
		if (article.slug) ajouter(`/blog/${encodeURIComponent(article.slug)}`, article.misAJourLe)
	return [...entrees.values()]
}

/** The text escaped for an XML element. */
export function echapperXml(texte: string): string {
	return texte
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

/** The XML of the sitemap. */
export function sitemapXml(entrees: readonly EntreeDuSitemap[]): string {
	const urls = entrees.map(({ loc, lastmod: date }) =>
		[
			'  <url>',
			`    <loc>${echapperXml(loc)}</loc>`,
			...(date ? [`    <lastmod>${date}</lastmod>`] : []),
			'  </url>',
		].join('\n')
	)
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...urls,
		'</urlset>',
		'',
	].join('\n')
}
