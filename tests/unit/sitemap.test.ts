import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { FROZEN_URL_FAMILIES } from '../../src/lib/frozen-urls'
import {
	absoluteUrl,
	deliveredStaticPages,
	EXCLUDED_PAGES,
	EXCLUDED_PREFIXES,
	escapeXml,
	lastmod,
	SITE_MAP_GROUPS,
	STATIC_PAGES,
	sitemapEntries,
	sitemapXml,
} from '../../src/lib/seo/sitemap'
import { HOME_PAGE_PREFIX } from '../../src/lib/urls/home-page'
import {
	PAGE_SIZE,
	PAGES_MAX,
	readIndexablePages,
	readIndexableProfiles,
} from '../../src/services/public/indexable-pages'

/**
 * The sitemap (tickets 113 and 114; plan 02 U38 to U43): the pure module, the table of the fixed pages
 * against the pages of the application, and the reading of the indexable documents with a spy for Payload.
 * The run against the running application: tests/e2e/sitemap.spec.ts (E62).
 */

const ROOT = join(import.meta.dir, '../..')

const locs = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1] ?? '')

/** No `//` after the scheme, no space, no final slash but the origin's own. */
function checkUrls(adresses: readonly string[]): void {
	for (const loc of adresses) {
		expect(loc.replace(/^https:\/\//, ''), loc).not.toContain('//')
		expect(loc, loc).not.toMatch(/\s/)
		expect(URL.canParse(loc.replace(/&amp;|&apos;|&lt;|&gt;|&quot;/g, '_')), loc).toBe(true)
		expect(loc.endsWith('/'), loc).toBe(false)
	}
}

describe('U38 : tous les profils publiables, sans troncature', () => {
	test('150 profils publiables → 150 adresses de profil', () => {
		const profiles = Array.from({ length: 150 }, (_, i) => ({ slug: `profil-${i + 1}` }))
		const xml = sitemapXml(sitemapEntries({ pages: [], profils: profiles }))
		expect(locs(xml).filter(loc => loc.includes('/profil/'))).toHaveLength(150)
	})

	test('la lecture suit les pages de 100 : 150 profils → deux lectures, 150 profils', async () => {
		const { payload, lectures: readings } = payloadSpy({ profils: 150 })
		const profiles = await readIndexableProfiles(payload)
		expect(profiles).toHaveLength(150)
		expect(readings.map(({ page }) => page)).toEqual([1, 2])
	})

	test('une liste qui dépasse la borne fait échouer la lecture au lieu d’être coupée', async () => {
		const { payload } = payloadSpy({ profils: (PAGES_MAX + 1) * PAGE_SIZE })
		await expect(readIndexableProfiles(payload)).rejects.toThrow(/coupée/)
	})
})

describe('U39 : aucun « // » hors du schéma', () => {
	test('les adresses sont celles de l’apex, quel que soit le chemin écrit', () => {
		expect(absoluteUrl('/')).toBe('https://my-makeup.fr')
		expect(absoluteUrl('/blog/')).toBe('https://my-makeup.fr/blog')
		expect(absoluteUrl('//profil//x/')).toBe('https://my-makeup.fr/profil/x')
		const xml = sitemapXml(
			sitemapEntries({
				profils: [{ slug: 'zoe-lefevre' }],
				talents: [{ slug: 'maquillage-mariee' }],
				articles: [{ slug: 'prix-mariee-2027' }],
			})
		)
		checkUrls(locs(xml))
		expect(locs(xml)).toContain('https://my-makeup.fr')
		expect(locs(xml)).toContain('https://my-makeup.fr/profil/zoe-lefevre')
	})
})

describe('U40 : slugs encodés, XML échappé', () => {
	test('un slug hors norme est encodé dans l’adresse, et l’XML échappe ce qui reste', () => {
		const xml = sitemapXml(
			sitemapEntries({
				pages: [],
				talents: [{ slug: 'mariée & <soirée>' }],
				articles: [{ slug: "l'été" }],
			})
		)
		expect(xml).toContain('<loc>https://my-makeup.fr/talent/mari%C3%A9e%20%26%20%3Csoir%C3%A9e%3E</loc>')
		expect(xml).toContain('<loc>https://my-makeup.fr/blog/l&apos;%C3%A9t%C3%A9</loc>')
		expect(xml).not.toMatch(/<loc>[^<]*[<>"][^<]*<\/loc>/)
	})

	test('le texte est échappé', () => {
		expect(escapeXml(`a&b<c>"d"'e'`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;')
	})
})

describe('U41 : les exclus ne sont jamais là', () => {
	test('/auth, /api, /admin, /search, le plan du site et la page de remerciement', () => {
		const pages = [
			...STATIC_PAGES,
			...['/auth', '/auth/signin', '/api/health', '/admin', '/admin/collections/profiles', '/search', '/site-map'].map(
				chemin => ({ chemin, titre: chemin, groupe: null })
			),
			{ chemin: '/demande-envoyee', titre: 'x', groupe: null },
			{ chemin: '/toutes-les-news', titre: 'x', groupe: null },
		]
		const xml = sitemapXml(sitemapEntries({ pages }))
		for (const loc of locs(xml))
			expect(loc, loc).not.toMatch(/\/(auth|api|admin|search|site-map|demande-envoyee|toutes-les-news)(\/|$)/)
	})

	test('la lecture ne demande que les profils publiables, avec les règles d’accès actives', async () => {
		const { payload, lectures: readings } = payloadSpy({ profils: 1 })
		await readIndexablePages(payload)
		const [profiles] = readings.filter(({ collection }) => collection === 'profiles')
		expect(profiles).toMatchObject({ where: { publishable: { equals: true } }, overrideAccess: false })
		for (const reading of readings) expect(reading.overrideAccess, String(reading.collection)).toBe(false)
	})

	test('la lecture ne prend aucun champ privé', async () => {
		const { payload, lectures: readings } = payloadSpy({ profils: 1 })
		await readIndexablePages(payload)
		for (const reading of readings) {
			const fields = Object.keys(reading.select as object)
			for (const privateOnes of ['coordonnees', 'contactPublic', 'pro', 'email', 'statut', 'legacyUsername'])
				expect(fields, String(reading.collection)).not.toContain(privateOnes)
		}
	})

	test('un profil dont le slug n’est pas une adresse est écarté : sa page ne répondrait pas', async () => {
		const { payload } = payloadSpy({ profils: 0, profilsBruts: [{ slug: 'Slug Invalide' }, { slug: 'ok-un' }] })
		expect((await readIndexableProfiles(payload)).map(({ slug }) => slug)).toEqual(['ok-un'])
	})

	test('une base en erreur donne une erreur, pas un sitemap tronqué', async () => {
		const payload = {
			find: async () => {
				throw new Error('base indisponible')
			},
		} as unknown as Payload
		await expect(readIndexablePages(payload)).rejects.toThrow('base indisponible')
	})
})

describe('U42 : lastmod = la date réelle de la dernière modification', () => {
	test('la date d’un document, en ISO ; rien quand elle manque ou n’est pas une date', () => {
		expect(lastmod('2026-03-04T10:20:30.000Z')).toBe('2026-03-04T10:20:30.000Z')
		expect(lastmod('2026-03-04')).toBe('2026-03-04T00:00:00.000Z')
		for (const empty of [null, undefined, '', '  ', 'pas une date', 42]) expect(lastmod(empty)).toBeNull()
	})

	test('une page fixe n’a pas de date, ni changefreq ni priority', () => {
		const xml = sitemapXml(
			sitemapEntries({
				profils: [{ slug: 'zoe-lefevre', misAJourLe: '2026-01-02T03:04:05.000Z' }],
				talents: [{ slug: 'mariee', misAJourLe: null }],
			})
		)
		expect(xml).toContain(
			'<loc>https://my-makeup.fr/profil/zoe-lefevre</loc>\n    <lastmod>2026-01-02T03:04:05.000Z</lastmod>'
		)
		expect(xml).toContain('<loc>https://my-makeup.fr/talent/mariee</loc>\n  </url>')
		expect(xml).toContain('<loc>https://my-makeup.fr/a-propos</loc>\n  </url>')
		expect(xml).not.toMatch(/changefreq|priority/)
	})
})

describe('U43 : talents et articles par slug, pages fixes d’une table explicite', () => {
	test('chaque talent sous /talent, chaque article sous /blog, sans doublon', () => {
		const xml = sitemapXml(
			sitemapEntries({
				pages: [],
				talents: [{ slug: 'mariee' }, { slug: 'mariee' }],
				articles: [{ slug: 'prix-2027' }],
			})
		)
		expect(locs(xml)).toEqual(['https://my-makeup.fr/talent/mariee', 'https://my-makeup.fr/blog/prix-2027'])
	})

	test('la table des pages fixes est celle des adresses gelées, ni plus ni moins', () => {
		const frozen = FROZEN_URL_FAMILIES.filter(({ id }) =>
			['accueil', 'pages-fixes', 'mentions-legales', 'blog'].includes(id)
		).flatMap(({ patterns }) => patterns)
		expect([...STATIC_PAGES.map(({ chemin: filePath }) => filePath)].sort()).toEqual([...frozen].sort())
	})

	test('chaque page de la table a ses adresses sans doublon, et un groupe connu du plan', () => {
		const paths = STATIC_PAGES.map(({ chemin: filePath }) => filePath)
		expect(new Set(paths).size).toBe(paths.length)
		const groups: readonly (string | null)[] = SITE_MAP_GROUPS.map(({ id }) => id)
		for (const page of STATIC_PAGES) if (page.groupe !== null) expect(groups, page.chemin).toContain(page.groupe)
	})
})

/* ------------------------------------------------------------------------------------------
 * The table against the pages of the application
 * ---------------------------------------------------------------------------------------- */

/** The files of a folder, recursively. */
const filesOf = (dossier: string): string[] =>
	readdirSync(dossier).flatMap(nom => {
		const filePath = join(dossier, nom)
		return statSync(filePath).isDirectory() ? filesOf(filePath) : [filePath]
	})

/**
 * The addresses of the application, read from its files: a `page.tsx`, a `route.ts` and the metadata routes
 * (`robots.ts`) of `src/app`, the route groups removed. A route with a dynamic segment is returned apart.
 */
function applicationUrls(): { statiques: string[]; dynamiques: string[] } {
	const staticOnes: string[] = []
	const dynamic: string[] = []
	const folder = join(ROOT, 'src/app')
	for (const file of filesOf(folder)) {
		const relative = file.slice(folder.length + 1)
		const segments = relative.split('/')
		const name = segments.pop() ?? ''
		if (!/^(page\.tsx|route\.ts|robots\.ts|sitemap\.ts)$/.test(name)) continue
		const filePath = segments.filter(segment => !/^\(.*\)$/.test(segment))
		if (name === 'robots.ts') filePath.push('robots.txt')
		if (name === 'sitemap.ts') filePath.push('sitemap.xml')
		const url = `/${filePath.join('/')}`
		// The home page lives under a dynamic segment that next.config.ts rewrites `/` to (ticket 269).
		if (url === `${HOME_PAGE_PREFIX}/[key]`) {
			staticOnes.push('/')
			continue
		}
		if (url === '/admin' || url.startsWith('/admin/') || url.startsWith('/api')) continue
		;(filePath.some(segment => /^\[.*\]$/.test(segment)) ? dynamic : staticOnes).push(url)
	}
	return { statiques: staticOnes, dynamiques: dynamic }
}

describe('La table des pages fixes couvre les pages de l’application, dans les deux sens', () => {
	const { statiques: staticOnes, dynamiques: dynamic } = applicationUrls()
	const excluded = (chemin: string) =>
		EXCLUDED_PAGES.some(page => page.chemin === chemin) ||
		EXCLUDED_PREFIXES.some(prefixe => chemin === prefixe || chemin.startsWith(`${prefixe}/`))

	test('le parcours trouve les pages que l’on connaît', () => {
		expect(staticOnes).toContain('/a-propos')
		expect(staticOnes).toContain('/')
		expect(dynamic).toContain('/profil/[slug]')
	})

	test('une page de l’application est dans la table ou dans les exclusions, jamais dans aucune', () => {
		const inTable = new Set(STATIC_PAGES.map(({ chemin: filePath }) => filePath))
		expect(staticOnes.filter(chemin => !inTable.has(chemin) && !excluded(chemin))).toEqual([])
	})

	test('une page de la table qui existe n’est pas marquée « à venir »', () => {
		const existing = new Set(staticOnes)
		const fake = STATIC_PAGES.filter(page => page.aVenir !== undefined && existing.has(page.chemin))
		expect(fake.map(({ chemin: filePath }) => filePath)).toEqual([])
	})

	test('une page de la table qui n’existe pas est marquée « à venir » : sinon le sitemap listerait un 404', () => {
		const existing = new Set(staticOnes)
		const gap = STATIC_PAGES.filter(page => page.aVenir === undefined && !existing.has(page.chemin))
		expect(gap.map(({ chemin: filePath }) => filePath)).toEqual([])
	})

	test('une route à segment dynamique est une famille à données : profil, talent, article', () => {
		expect(dynamic.filter(chemin => !excluded(chemin)).sort()).toEqual([
			'/blog/[slug]',
			'/profil/[slug]',
			'/talent/[slug]',
		])
	})

	test('la table livrée ne garde que les pages qui existent', () => {
		const existing = new Set(staticOnes)
		for (const page of deliveredStaticPages()) expect(existing.has(page.chemin), page.chemin).toBe(true)
		expect(existsSync(join(ROOT, 'src/app/sitemap.xml/route.ts'))).toBe(true)
	})

	test('le contrôle voit une page absente des deux listes', () => {
		const inTable = new Set(STATIC_PAGES.map(({ chemin: filePath }) => filePath))
		const unknown = '/nouvelle-page-sans-ligne'
		expect(!inTable.has(unknown) && !excluded(unknown)).toBe(true)
	})
})

/* ------------------------------------------------------------------------------------------
 * A Payload that records the reads and answers fictional documents
 * ---------------------------------------------------------------------------------------- */

interface SpySettings {
	profils: number
	profilsBruts?: Record<string, unknown>[]
}

function payloadSpy({ profils: profiles, profilsBruts }: SpySettings) {
	const readings: Record<string, unknown>[] = []
	const payload = {
		find: async (options: Record<string, unknown>) => {
			readings.push(options)
			const page = Number(options.page ?? 1)
			const limit = Number(options.limit)
			if (options.collection === 'profiles') {
				const everyone =
					profilsBruts ??
					Array.from({ length: profiles }, (_, i) => ({
						slug: `profil-${String(i + 1).padStart(5, '0')}`,
						firstName: 'Zoé',
						lastName: `Fictive ${i + 1}`,
						updatedAt: '2026-05-06T07:08:09.000Z',
					}))
				const docs = everyone.slice((page - 1) * limit, page * limit)
				return { docs, hasNextPage: page * limit < everyone.length }
			}
			return {
				docs: [{ slug: 'un-slug', title: 'Un titre', updatedAt: '2026-05-06T07:08:09.000Z' }],
				hasNextPage: false,
			}
		},
	}
	return { payload: payload as unknown as Payload, lectures: readings }
}
