/**
 * The sitemap (SEO-10, plans/03 §5 and plans/02 U38-U43): every publiable
 * profile by its slug, every talent and article by its slug, and the fixed
 * pages of an explicit table. Never the account pages, the search, the plan
 * of the site, the 404 nor the API. `lastmod` is the real updatedAt of the
 * entry, left out when unknown (fixed pages); no changefreq nor priority.
 */

import { cheminProfil } from '../slug.js'
import { chemin, urlAbsolue } from './url.js'

/** Fixed pages that are indexed, by path */
export const PAGES_STATIQUES = [
	'/',
	'/a-propos',
	'/blog',
	'/toutes-les-news',
	'/contact',
	'/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
	'/particulier/trouver-une-maquilleuse',
	'/particulier/centraliser-ses-recherches',
	'/particulier/explorer-les-profils',
	'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
	'/maquilleuse/partenariats',
	'/solutions/pour-les-particuliers',
	'/solutions/pour-les-maquilleuses',
	'/cgu',
	'/mentions-legales',
	'/politique-de-confidentialite',
]

/**
 * Pages of src/pages left out on purpose (tests/unit/sitemap.test.mjs fails
 * when a new page is in neither list).
 */
export const PAGES_EXCLUES = ['/404', '/search', '/site-map', '/demande-envoyee', '/sitemap.xml', '/robots.txt']

/** Prefixes never in the sitemap */
export const PREFIXES_EXCLUS = ['/auth', '/api', '/admin']

const estExclu = cheminPage =>
	PAGES_EXCLUES.includes(cheminPage) || PREFIXES_EXCLUS.some(p => cheminPage === p || cheminPage.startsWith(`${p}/`))

/**
 * Date of an entry as W3C datetime, or null when invalid.
 * @param {unknown} date
 * @returns {string|null}
 */
export function lastmod(date) {
	if (typeof date !== 'string' || date.trim() === '') return null
	const t = Date.parse(date)
	return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/**
 * @param {unknown} texte
 * @returns {string}
 */
export function echapperXml(texte) {
	return String(texte)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

const slugDe = entree => {
	const s = entree?.attributes?.slug ?? entree?.slug
	return typeof s === 'string' && s.trim() !== '' ? s.trim() : null
}
const misAJour = entree => entree?.attributes?.updatedAt ?? entree?.updatedAt

/**
 * @typedef {object} EntreeSitemap
 * @property {string} loc - absolute URL
 * @property {string|null} lastmod
 */

/**
 * @param {object} donnees
 * @param {string} donnees.site - urlDuSite()
 * @param {string[]} [donnees.pages] - fixed pages (PAGES_STATIQUES)
 * @param {Array<{slug: string, updatedAt?: string}>} [donnees.profils] -
 *   the publiable profiles only
 * @param {object[]} [donnees.talents] - content API entries
 * @param {object[]} [donnees.articles] - content API entries
 * @returns {EntreeSitemap[]} without duplicates
 */
export function entreesSitemap({ site, pages = PAGES_STATIQUES, profils = [], talents = [], articles = [] }) {
	const entrees = new Map()
	const ajouter = (cheminPage, date) => {
		if (estExclu(cheminPage)) return
		const loc = urlAbsolue(cheminPage, site)
		if (!entrees.has(loc)) entrees.set(loc, { loc, lastmod: lastmod(date) })
	}
	for (const page of pages) {
		ajouter(page, null)
	}
	for (const profil of profils) {
		if (profil?.slug) ajouter(cheminProfil(profil.slug), profil.updatedAt)
	}
	for (const talent of talents) {
		const slug = slugDe(talent)
		if (slug) ajouter(chemin('talent', slug), misAJour(talent))
	}
	for (const article of articles) {
		const slug = slugDe(article)
		if (slug) ajouter(chemin('blog', slug), misAJour(article))
	}
	return [...entrees.values()]
}

/**
 * @param {EntreeSitemap[]} entrees
 * @returns {string}
 */
export function sitemapXml(entrees) {
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
