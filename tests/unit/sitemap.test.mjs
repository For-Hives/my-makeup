import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { robotsTxt } from '../../src/lib/seo/robots.js'
import {
	echapperXml,
	entreesSitemap,
	lastmod,
	PAGES_EXCLUES,
	PAGES_STATIQUES,
	sitemapXml,
} from '../../src/lib/seo/sitemap.js'
import { chemin, urlAbsolue, urlDuSite } from '../../src/lib/seo/url.js'
import { avecPage, toutesLesPages } from '../../src/lib/strapi-pages.js'

const PAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/pages')

// every URL of a sitemap: no // after the scheme, parsed by URL, encoded
function verifierUrls(xml) {
	const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1])
	for (const loc of locs) {
		assert.doesNotMatch(loc.replace(/^https?:\/\//, ''), /\/\//, loc)
		assert.doesNotMatch(loc, /\s/, loc)
		assert.equal(new URL(loc.replace(/&amp;/g, '&')).protocol.startsWith('http'), true)
	}
	return locs
}

describe('URLs of the site', () => {
	test('origin from NEXT_PUBLIC_URL, with or without trailing slash', () => {
		for (const brut of ['https://my-makeup.fr', 'https://my-makeup.fr/', ' https://my-makeup.fr// ']) {
			assert.equal(urlDuSite(brut), 'https://my-makeup.fr')
		}
		assert.equal(urlDuSite('http://localhost:3996/'), 'http://localhost:3996')
		// undefined falls back to NEXT_PUBLIC_URL, which the CI sets: run
		// these cases without it
		const avant = process.env.NEXT_PUBLIC_URL
		delete process.env.NEXT_PUBLIC_URL
		try {
			for (const brut of ['', undefined, 'my-makeup.fr', 'ftp://x.test', 42]) {
				assert.equal(urlDuSite(brut), 'https://my-makeup.fr')
			}
		} finally {
			if (avant !== undefined) process.env.NEXT_PUBLIC_URL = avant
		}
	})

	test('undefined reads NEXT_PUBLIC_URL', () => {
		const avant = process.env.NEXT_PUBLIC_URL
		process.env.NEXT_PUBLIC_URL = 'http://localhost:3000/'
		try {
			assert.equal(urlDuSite(undefined), 'http://localhost:3000')
		} finally {
			if (avant === undefined) delete process.env.NEXT_PUBLIC_URL
			else process.env.NEXT_PUBLIC_URL = avant
		}
	})

	test('U46 absolute URL: one slash, no trailing slash, the home page is the origin', () => {
		assert.equal(urlAbsolue('/blog', 'https://my-makeup.fr/'), 'https://my-makeup.fr/blog')
		assert.equal(urlAbsolue('//profil//x/', 'https://my-makeup.fr'), 'https://my-makeup.fr/profil/x')
		assert.equal(urlAbsolue('/', 'https://my-makeup.fr/'), 'https://my-makeup.fr')
		assert.equal(urlAbsolue('', 'https://my-makeup.fr'), 'https://my-makeup.fr')
		assert.equal(chemin('talent', 'maquillage mariée'), '/talent/maquillage%20mari%C3%A9e')
	})

	test('robots.txt: the sitemap, /api closed, no Host, /auth not blocked', () => {
		for (const site of ['https://my-makeup.fr', 'https://my-makeup.fr/']) {
			const txt = robotsTxt(site)
			assert.match(txt, /^Sitemap: https:\/\/my-makeup\.fr\/sitemap\.xml$/m)
			assert.match(txt, /^Disallow: \/api\/$/m)
			assert.doesNotMatch(txt, /Host:/)
			assert.doesNotMatch(txt, /Disallow: \/auth/)
		}
	})
})

describe('sitemap (plans/02 U38-U43)', () => {
	const site = 'https://my-makeup.fr/'

	test('U38 150 publiable profiles → 150 URLs, the API read page after page', async () => {
		const tous = Array.from({ length: 150 }, (_, i) => ({
			id: i + 1,
			attributes: { slug: `profil-${i + 1}` },
		}))
		const appels = []
		const lus = await toutesLesPages(async page => {
			appels.push(page)
			return {
				data: tous.slice((page - 1) * 100, page * 100),
				meta: { pagination: { page, pageSize: 100, pageCount: 2, total: 150 } },
			}
		})
		assert.deepEqual(appels, [1, 2])
		const xml = sitemapXml(
			entreesSitemap({
				site,
				pages: [],
				profils: lus.map(e => ({ slug: e.attributes.slug, updatedAt: null })),
			})
		)
		assert.equal(verifierUrls(xml).filter(u => u.includes('/profil/')).length, 150)
	})

	test('pagination: query string kept, empty or missing meta ends, too many pages throw', async () => {
		assert.equal(avecPage('/api/talents', 2), '/api/talents?pagination[page]=2&pagination[pageSize]=100')
		assert.equal(
			avecPage('/api/talents?fields[0]=slug', 1, 25),
			'/api/talents?fields[0]=slug&pagination[page]=1&pagination[pageSize]=25'
		)
		assert.deepEqual(await toutesLesPages(async () => ({ data: [1, 2] })), [1, 2])
		assert.deepEqual(await toutesLesPages(async () => ({})), [])
		await assert.rejects(
			toutesLesPages(async () => ({ data: [1], meta: { pagination: { pageCount: 99 } } }), { pagesMax: 3 }),
			/plus de 3 pages/
		)
	})

	test('U39 no // except after the scheme, whatever the trailing slash of the base', () => {
		for (const base of ['https://my-makeup.fr', 'https://my-makeup.fr/', 'https://my-makeup.fr//']) {
			const xml = sitemapXml(
				entreesSitemap({
					site: base,
					profils: [{ slug: 'zoe-lefevre', updatedAt: '2026-01-01T00:00:00.000Z' }],
					talents: [{ attributes: { slug: 'maquillage-mariee' } }],
					articles: [{ attributes: { slug: 'prix-mariee-2027' } }],
				})
			)
			const locs = new Set(verifierUrls(xml))
			assert.ok(locs.has('https://my-makeup.fr'))
			assert.ok(locs.has('https://my-makeup.fr/profil/zoe-lefevre'))
		}
	})

	test('U40 slugs encoded, XML escaped', () => {
		const xml = sitemapXml(
			entreesSitemap({
				site,
				pages: [],
				talents: [{ attributes: { slug: 'mariée & <soirée>' } }],
				articles: [{ attributes: { slug: "l'été" } }],
			})
		)
		assert.match(xml, /<loc>https:\/\/my-makeup\.fr\/talent\/mari%C3%A9e%20%26%20%3Csoir%C3%A9e%3E<\/loc>/)
		assert.match(
			xml,
			/<loc>https:\/\/my-makeup\.fr\/blog\/l'%C3%A9t%C3%A9<\/loc>|<loc>https:\/\/my-makeup\.fr\/blog\/l&apos;%C3%A9t%C3%A9<\/loc>/
		)
		assert.doesNotMatch(xml, /<loc>[^<]*[<>"][^<]*<\/loc>/)
		assert.equal(echapperXml(`a&b<c>"d'`), 'a&amp;b&lt;c&gt;&quot;d&apos;')
	})

	test('U41 /auth, /api, /admin, /search, /site-map and /404 left out', () => {
		const locs = entreesSitemap({
			site,
			pages: ['/', '/auth/signin', '/auth', '/api/health', '/admin', '/search', '/site-map', '/404', '/cgu'],
		}).map(e => e.loc)
		assert.deepEqual(locs, ['https://my-makeup.fr', 'https://my-makeup.fr/cgu'])
	})

	test('U42 lastmod = the real updatedAt, left out when unknown; no changefreq nor priority', () => {
		const xml = sitemapXml(
			entreesSitemap({
				site,
				pages: ['/'],
				profils: [
					{ slug: 'a', updatedAt: '2026-03-04T05:06:07.000Z' },
					{ slug: 'b', updatedAt: 'n’importe quoi' },
				],
			})
		)
		assert.match(
			xml,
			/<loc>https:\/\/my-makeup\.fr\/profil\/a<\/loc>\n {4}<lastmod>2026-03-04T05:06:07.000Z<\/lastmod>/
		)
		assert.match(xml, /<loc>https:\/\/my-makeup\.fr\/profil\/b<\/loc>\n {2}<\/url>/)
		assert.match(xml, /<loc>https:\/\/my-makeup\.fr<\/loc>\n {2}<\/url>/)
		assert.doesNotMatch(xml, /changefreq|priority/)
		assert.equal(lastmod(null), null)
	})

	test('U43 talents and articles by slug, entries without slug skipped, no duplicate', () => {
		const locs = entreesSitemap({
			site,
			pages: ['/', '/'],
			talents: [{ attributes: { slug: 'fx' } }, { attributes: { slug: '' } }, { attributes: {} }],
			articles: [{ attributes: { slug: 'news' } }, { attributes: { slug: 'news' } }],
		}).map(e => e.loc)
		assert.deepEqual(locs, ['https://my-makeup.fr', 'https://my-makeup.fr/talent/fx', 'https://my-makeup.fr/blog/news'])
	})

	test('U43 fixed pages from an explicit table: every page of src/pages is listed or left out on purpose', () => {
		const pages = []
		const parcourir = dossier => {
			for (const nom of readdirSync(dossier)) {
				const complet = path.join(dossier, nom)
				if (statSync(complet).isDirectory()) parcourir(complet)
				else pages.push(path.relative(PAGES, complet))
			}
		}
		parcourir(PAGES)
		const routes = pages
			.filter(f => /\.js$/.test(f) && !f.includes('[') && !/^_/.test(path.basename(f)))
			.map(
				f =>
					`/${f
						.replace(/\\/g, '/')
						.replace(/\.js$/, '')
						.replace(/(^|\/)index$/, '')}`
			)
			.map(r => (r.length > 1 ? r.replace(/\/$/, '') : r))
			.filter(r => !(r.startsWith('/api/') || r.startsWith('/auth')))
		for (const route of routes) {
			assert.ok(
				PAGES_STATIQUES.includes(route) || PAGES_EXCLUES.includes(route),
				`${route} : ajouter la page à PAGES_STATIQUES ou à PAGES_EXCLUES (src/lib/seo/sitemap.js)`
			)
		}
		for (const page of PAGES_STATIQUES) {
			assert.ok(routes.includes(page), `${page} n’existe pas`)
		}
	})
})
