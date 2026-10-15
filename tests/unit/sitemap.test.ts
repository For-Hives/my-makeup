import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import {
	adresseAbsolue,
	echapperXml,
	entreesDuSitemap,
	GROUPES_DU_PLAN,
	lastmod,
	PAGES_EXCLUES,
	PAGES_FIXES,
	PREFIXES_EXCLUS,
	pagesFixesLivrees,
	sitemapXml,
} from '../../src/lib/seo/sitemap'
import { FROZEN_URL_FAMILIES } from '../../src/lib/urls-gelees'
import {
	lireLesPagesIndexables,
	lireLesProfilsIndexables,
	PAGES_MAX,
	TAILLE_DE_LA_PAGE,
} from '../../src/services/public/pages-indexables'

/**
 * The sitemap (tickets 113 and 114; plan 02 U38 to U43): the pure module, the table of the fixed pages
 * against the pages of the application, and the reading of the indexable documents with a spy for Payload.
 * The run against the running application: tests/e2e/sitemap.spec.ts (E62).
 */

const RACINE = join(import.meta.dir, '../..')

const locs = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1] ?? '')

/** No `//` after the scheme, no space, no final slash but the origin's own. */
function verifierLesAdresses(adresses: readonly string[]): void {
	for (const loc of adresses) {
		expect(loc.replace(/^https:\/\//, ''), loc).not.toContain('//')
		expect(loc, loc).not.toMatch(/\s/)
		expect(URL.canParse(loc.replace(/&amp;|&apos;|&lt;|&gt;|&quot;/g, '_')), loc).toBe(true)
		expect(loc.endsWith('/'), loc).toBe(false)
	}
}

describe('U38 : tous les profils publiables, sans troncature', () => {
	test('150 profils publiables → 150 adresses de profil', () => {
		const profils = Array.from({ length: 150 }, (_, i) => ({ slug: `profil-${i + 1}` }))
		const xml = sitemapXml(entreesDuSitemap({ pages: [], profils }))
		expect(locs(xml).filter(loc => loc.includes('/profil/'))).toHaveLength(150)
	})

	test('la lecture suit les pages de 100 : 150 profils → deux lectures, 150 profils', async () => {
		const { payload, lectures } = payloadEspion({ profils: 150 })
		const profils = await lireLesProfilsIndexables(payload)
		expect(profils).toHaveLength(150)
		expect(lectures.map(({ page }) => page)).toEqual([1, 2])
	})

	test('une liste qui dépasse la borne fait échouer la lecture au lieu d’être coupée', async () => {
		const { payload } = payloadEspion({ profils: (PAGES_MAX + 1) * TAILLE_DE_LA_PAGE })
		await expect(lireLesProfilsIndexables(payload)).rejects.toThrow(/coupée/)
	})
})

describe('U39 : aucun « // » hors du schéma', () => {
	test('les adresses sont celles de l’apex, quel que soit le chemin écrit', () => {
		expect(adresseAbsolue('/')).toBe('https://my-makeup.fr')
		expect(adresseAbsolue('/blog/')).toBe('https://my-makeup.fr/blog')
		expect(adresseAbsolue('//profil//x/')).toBe('https://my-makeup.fr/profil/x')
		const xml = sitemapXml(
			entreesDuSitemap({
				profils: [{ slug: 'zoe-lefevre' }],
				talents: [{ slug: 'maquillage-mariee' }],
				articles: [{ slug: 'prix-mariee-2027' }],
			})
		)
		verifierLesAdresses(locs(xml))
		expect(locs(xml)).toContain('https://my-makeup.fr')
		expect(locs(xml)).toContain('https://my-makeup.fr/profil/zoe-lefevre')
	})
})

describe('U40 : slugs encodés, XML échappé', () => {
	test('un slug hors norme est encodé dans l’adresse, et l’XML échappe ce qui reste', () => {
		const xml = sitemapXml(
			entreesDuSitemap({
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
		expect(echapperXml(`a&b<c>"d"'e'`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;')
	})
})

describe('U41 : les exclus ne sont jamais là', () => {
	test('/auth, /api, /admin, /search, le plan du site et la page de remerciement', () => {
		const pages = [
			...PAGES_FIXES,
			...['/auth', '/auth/signin', '/api/health', '/admin', '/admin/collections/profils', '/search', '/site-map'].map(
				chemin => ({ chemin, titre: chemin, groupe: null })
			),
			{ chemin: '/demande-envoyee', titre: 'x', groupe: null },
			{ chemin: '/toutes-les-news', titre: 'x', groupe: null },
		]
		const xml = sitemapXml(entreesDuSitemap({ pages }))
		for (const loc of locs(xml))
			expect(loc, loc).not.toMatch(/\/(auth|api|admin|search|site-map|demande-envoyee|toutes-les-news)(\/|$)/)
	})

	test('la lecture ne demande que les profils publiables, avec les règles d’accès actives', async () => {
		const { payload, lectures } = payloadEspion({ profils: 1 })
		await lireLesPagesIndexables(payload)
		const [profils] = lectures.filter(({ collection }) => collection === 'profils')
		expect(profils).toMatchObject({ where: { publiable: { equals: true } }, overrideAccess: false })
		for (const lecture of lectures) expect(lecture.overrideAccess, String(lecture.collection)).toBe(false)
	})

	test('la lecture ne prend aucun champ privé', async () => {
		const { payload, lectures } = payloadEspion({ profils: 1 })
		await lireLesPagesIndexables(payload)
		for (const lecture of lectures) {
			const champs = Object.keys(lecture.select as object)
			for (const prive of ['coordonnees', 'contactPublic', 'pro', 'email', 'statut', 'legacyUsername'])
				expect(champs, String(lecture.collection)).not.toContain(prive)
		}
	})

	test('un profil dont le slug n’est pas une adresse est écarté : sa page ne répondrait pas', async () => {
		const { payload } = payloadEspion({ profils: 0, profilsBruts: [{ slug: 'Slug Invalide' }, { slug: 'ok-un' }] })
		expect((await lireLesProfilsIndexables(payload)).map(({ slug }) => slug)).toEqual(['ok-un'])
	})

	test('une base en erreur donne une erreur, pas un sitemap tronqué', async () => {
		const payload = {
			find: async () => {
				throw new Error('base indisponible')
			},
		} as unknown as Payload
		await expect(lireLesPagesIndexables(payload)).rejects.toThrow('base indisponible')
	})
})

describe('U42 : lastmod = la date réelle de la dernière modification', () => {
	test('la date d’un document, en ISO ; rien quand elle manque ou n’est pas une date', () => {
		expect(lastmod('2026-03-04T10:20:30.000Z')).toBe('2026-03-04T10:20:30.000Z')
		expect(lastmod('2026-03-04')).toBe('2026-03-04T00:00:00.000Z')
		for (const vide of [null, undefined, '', '  ', 'pas une date', 42]) expect(lastmod(vide)).toBeNull()
	})

	test('une page fixe n’a pas de date, ni changefreq ni priority', () => {
		const xml = sitemapXml(
			entreesDuSitemap({
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
			entreesDuSitemap({
				pages: [],
				talents: [{ slug: 'mariee' }, { slug: 'mariee' }],
				articles: [{ slug: 'prix-2027' }],
			})
		)
		expect(locs(xml)).toEqual(['https://my-makeup.fr/talent/mariee', 'https://my-makeup.fr/blog/prix-2027'])
	})

	test('la table des pages fixes est celle des adresses gelées, ni plus ni moins', () => {
		const gelees = FROZEN_URL_FAMILIES.filter(({ id }) =>
			['accueil', 'pages-fixes', 'mentions-legales', 'blog'].includes(id)
		).flatMap(({ patterns }) => patterns)
		expect([...PAGES_FIXES.map(({ chemin }) => chemin)].sort()).toEqual([...gelees].sort())
	})

	test('chaque page de la table a ses adresses sans doublon, et un groupe connu du plan', () => {
		const chemins = PAGES_FIXES.map(({ chemin }) => chemin)
		expect(new Set(chemins).size).toBe(chemins.length)
		const groupes: readonly (string | null)[] = GROUPES_DU_PLAN.map(({ id }) => id)
		for (const page of PAGES_FIXES) if (page.groupe !== null) expect(groupes, page.chemin).toContain(page.groupe)
	})
})

/* ------------------------------------------------------------------------------------------
 * The table against the pages of the application
 * ---------------------------------------------------------------------------------------- */

/** The files of a folder, recursively. */
const fichiersDe = (dossier: string): string[] =>
	readdirSync(dossier).flatMap(nom => {
		const chemin = join(dossier, nom)
		return statSync(chemin).isDirectory() ? fichiersDe(chemin) : [chemin]
	})

/**
 * The addresses of the application, read from its files: a `page.tsx`, a `route.ts` and the metadata routes
 * (`robots.ts`) of `src/app`, the route groups removed. A route with a dynamic segment is returned apart.
 */
function adressesDeLApplication(): { statiques: string[]; dynamiques: string[] } {
	const statiques: string[] = []
	const dynamiques: string[] = []
	const dossier = join(RACINE, 'src/app')
	for (const fichier of fichiersDe(dossier)) {
		const relatif = fichier.slice(dossier.length + 1)
		const segments = relatif.split('/')
		const nom = segments.pop() ?? ''
		if (!/^(page\.tsx|route\.ts|robots\.ts|sitemap\.ts)$/.test(nom)) continue
		const chemin = segments.filter(segment => !/^\(.*\)$/.test(segment))
		if (nom === 'robots.ts') chemin.push('robots.txt')
		if (nom === 'sitemap.ts') chemin.push('sitemap.xml')
		const adresse = `/${chemin.join('/')}`
		if (adresse === '/admin' || adresse.startsWith('/admin/') || adresse.startsWith('/api')) continue
		;(chemin.some(segment => /^\[.*\]$/.test(segment)) ? dynamiques : statiques).push(adresse)
	}
	return { statiques, dynamiques }
}

describe('La table des pages fixes couvre les pages de l’application, dans les deux sens', () => {
	const { statiques, dynamiques } = adressesDeLApplication()
	const exclue = (chemin: string) =>
		PAGES_EXCLUES.some(page => page.chemin === chemin) ||
		PREFIXES_EXCLUS.some(prefixe => chemin === prefixe || chemin.startsWith(`${prefixe}/`))

	test('le parcours trouve les pages que l’on connaît', () => {
		expect(statiques).toContain('/a-propos')
		expect(statiques).toContain('/')
		expect(dynamiques).toContain('/profil/[slug]')
	})

	test('une page de l’application est dans la table ou dans les exclusions, jamais dans aucune', () => {
		const dansLaTable = new Set(PAGES_FIXES.map(({ chemin }) => chemin))
		expect(statiques.filter(chemin => !dansLaTable.has(chemin) && !exclue(chemin))).toEqual([])
	})

	test('une page de la table qui existe n’est pas marquée « à venir »', () => {
		const existantes = new Set(statiques)
		const faux = PAGES_FIXES.filter(page => page.aVenir !== undefined && existantes.has(page.chemin))
		expect(faux.map(({ chemin }) => chemin)).toEqual([])
	})

	test('une page de la table qui n’existe pas est marquée « à venir » : sinon le sitemap listerait un 404', () => {
		const existantes = new Set(statiques)
		const manque = PAGES_FIXES.filter(page => page.aVenir === undefined && !existantes.has(page.chemin))
		expect(manque.map(({ chemin }) => chemin)).toEqual([])
	})

	test('une route à segment dynamique est une famille à données : profil, talent, article', () => {
		expect(dynamiques.filter(chemin => !exclue(chemin)).sort()).toEqual([
			'/blog/[slug]',
			'/profil/[slug]',
			'/talent/[slug]',
		])
	})

	test('la table livrée ne garde que les pages qui existent', () => {
		const existantes = new Set(statiques)
		for (const page of pagesFixesLivrees()) expect(existantes.has(page.chemin), page.chemin).toBe(true)
		expect(existsSync(join(RACINE, 'src/app/sitemap.xml/route.ts'))).toBe(true)
	})

	test('le contrôle voit une page absente des deux listes', () => {
		const dansLaTable = new Set(PAGES_FIXES.map(({ chemin }) => chemin))
		const inconnue = '/nouvelle-page-sans-ligne'
		expect(!dansLaTable.has(inconnue) && !exclue(inconnue)).toBe(true)
	})
})

/* ------------------------------------------------------------------------------------------
 * A Payload that records the reads and answers fictional documents
 * ---------------------------------------------------------------------------------------- */

interface ReglagesDuSpy {
	profils: number
	profilsBruts?: Record<string, unknown>[]
}

function payloadEspion({ profils, profilsBruts }: ReglagesDuSpy) {
	const lectures: Record<string, unknown>[] = []
	const payload = {
		find: async (options: Record<string, unknown>) => {
			lectures.push(options)
			const page = Number(options.page ?? 1)
			const limite = Number(options.limit)
			if (options.collection === 'profils') {
				const tous =
					profilsBruts ??
					Array.from({ length: profils }, (_, i) => ({
						slug: `profil-${String(i + 1).padStart(5, '0')}`,
						prenom: 'Zoé',
						nom: `Fictive ${i + 1}`,
						updatedAt: '2026-05-06T07:08:09.000Z',
					}))
				const docs = tous.slice((page - 1) * limite, page * limite)
				return { docs, hasNextPage: page * limite < tous.length }
			}
			return {
				docs: [{ slug: 'un-slug', title: 'Un titre', updatedAt: '2026-05-06T07:08:09.000Z' }],
				hasNextPage: false,
			}
		},
	}
	return { payload: payload as unknown as Payload, lectures }
}
