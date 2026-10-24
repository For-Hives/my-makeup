import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import nextConfig from '../../next.config'
import { HOME_PAGE_PATH, HOME_PAGE_PREFIX, isHomePageInternal } from '../../src/lib/urls/home-page'
import { proxy } from '../../src/proxy'

/**
 * The HTML of the public pages is kept in the cache of Next (ticket 269): what keeps a page cacheable, as the
 * source says it. The behaviour itself, with `x-nextjs-cache: HIT`, is tests/e2e/page-cache.spec.ts.
 */

const ROOT = join(import.meta.dir, '../..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const CACHED_PAGES = [
	'src/app/(front)/(site)/home-cached/[key]/page.tsx',
	'src/app/(front)/(site)/profil/[slug]/page.tsx',
	'src/app/(front)/(site)/talent/[slug]/page.tsx',
	'src/app/(front)/(site)/blog/[slug]/page.tsx',
	'src/app/(front)/(site)/maquilleuses/[department]/page.tsx',
]

const sourceFiles = (dossier: string): string[] =>
	readdirSync(dossier).flatMap(nom => {
		const path = join(dossier, nom)
		return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(nom) ? [path] : []
	})

describe('les pages qui sortent du cache de Next', () => {
	test.each(CACHED_PAGES)('%s n’est pas rendue à chaque visite et ne se génère pas au build', path => {
		const source = read(path)
		expect(source).not.toMatch(/export const dynamic\s*=/)
		expect(source).toMatch(/export const revalidate = 3600/)
		// Nothing is generated ahead: the build has no database, the page is rendered at its first visit.
		expect(source).toMatch(/export function generateStaticParams\(\)[^\n]*\{\s*return \[\]\s*\}/)
		expect(source).toContain('export const dynamicParams = true')
	})

	test('ni ces pages, ni le gabarit du site, ni ce qu’ils composent ne lisent un cookie ou un en-tête', () => {
		const files = [
			...CACHED_PAGES.map(path => join(ROOT, path)),
			join(ROOT, 'src/app/(front)/(site)/layout.tsx'),
			join(ROOT, 'src/app/(front)/layout.tsx'),
			...sourceFiles(join(ROOT, 'src/components/layout')),
			...sourceFiles(join(ROOT, 'src/components/home')),
			...sourceFiles(join(ROOT, 'src/components/profile')),
			...sourceFiles(join(ROOT, 'src/components/blocks')),
			...sourceFiles(join(ROOT, 'src/components/content')),
		]
		const reading = files.filter(fichier =>
			/from 'next\/headers'|\bcookies\(\)|\bheaders\(\)|\bconnection\(\)|\bnoStore\(\)|unstable_noStore/.test(
				readFileSync(fichier, 'utf8')
			)
		)
		expect(reading).toEqual([])
	})

	test('chaque lien vers l’accueil coupe le préchargement : la page vit sous une adresse interne, son préchargement ne finit pas', () => {
		// With `/` rewritten to /home-cached/principal, the client keeps asking for the tree of `/` and the network
		// is never idle (seen on the forms, ticket 269). A link of Next to `/` carries `prefetch={false}`.
		const links = sourceFiles(join(ROOT, 'src')).flatMap(fichier =>
			(readFileSync(fichier, 'utf8').match(/<Link\b[^>]*\bhref="\/"[^>]*>/g) ?? []).map(balise => ({ fichier, balise }))
		)
		expect(links.length).toBeGreaterThan(0)
		expect(links.filter(({ balise }) => !balise.includes('prefetch={false}'))).toEqual([])
	})

	test('les pages de la session restent dynamiques, avec leurs en-têtes private, no-store', () => {
		for (const path of [
			'src/app/(front)/(dashboard)/auth/page.tsx',
			'src/app/(front)/(dashboard)/auth/profil/page.tsx',
			'src/app/(front)/(dashboard)/auth/account/page.tsx',
			'src/app/(front)/(dashboard)/auth/signin/page.tsx',
		])
			expect(read(path), path).toContain("export const dynamic = 'force-dynamic'")
		expect(read('next.config.ts')).toContain("source: '/auth/:path*', headers: dashboardHeaders()")
	})
})

describe('l’accueil, servi par une page d’un segment dynamique', () => {
	test('next.config.ts réécrit / vers l’adresse interne', async () => {
		const rewrites = await nextConfig.rewrites?.()
		const list = Array.isArray(rewrites) ? rewrites : (rewrites?.beforeFiles ?? [])
		expect(list).toContainEqual({ source: '/', destination: HOME_PAGE_PATH })
	})

	test('l’adresse interne est reconnue, rien d’autre', () => {
		expect(isHomePageInternal(HOME_PAGE_PREFIX)).toBe(true)
		expect(isHomePageInternal(HOME_PAGE_PATH)).toBe(true)
		expect(isHomePageInternal(`${HOME_PAGE_PREFIX}/autre`)).toBe(true)
		expect(isHomePageInternal('/')).toBe(false)
		expect(isHomePageInternal('/home-cached-bis')).toBe(false)
		expect(isHomePageInternal('/blog/home-cached')).toBe(false)
	})

	test('le proxy répond la 404 du site à l’adresse interne, et laisse passer /', () => {
		const internal = proxy(new NextRequest(`https://my-makeup.fr${HOME_PAGE_PATH}`))
		expect(new URL(internal.headers.get('x-middleware-rewrite') ?? '').pathname).toBe('/unknown-page')
		expect(internal.headers.get('x-robots-tag')).toBe('noindex')
		const home = proxy(new NextRequest('https://my-makeup.fr/'))
		expect(home.headers.get('x-middleware-rewrite')).toBeNull()
		expect(home.headers.get('x-middleware-next')).toBe('1')
	})
})
