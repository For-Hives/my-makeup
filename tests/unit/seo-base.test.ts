import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { serializeJsonLd } from '../../src/lib/seo/json-ld'
import { pageMetadata } from '../../src/lib/seo/metadata'
import { NOINDEX, NOINDEX_PATHS, robotsForPath, robotsRules } from '../../src/lib/seo/robots'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, descriptionMeta, MAX_TITLE, pageTitle } from '../../src/lib/seo/text'
import { canonicalUrl } from '../../src/lib/seo/url'
import { proxy } from '../../src/proxy'

const ROOT = join(import.meta.dir, '../..')

describe('titres (U44)', () => {
	test('jamais « null null » ni « undefined », même avec des valeurs vides', () => {
		for (const value of [null, undefined, '', '  ', 'null null', 'undefined']) {
			const title = pageTitle(value)
			expect(title).toBe('My-Makeup')
		}
		expect(pageTitle('Léa null Martin')).toBe('Léa Martin | My-Makeup')
	})

	test('60 caractères au plus, la marque ajoutée quand elle tient', () => {
		expect(pageTitle('Blog')).toBe('Blog | My-Makeup')
		const long = 'Maquilleuse de mariage à Annecy : des profils vérifiés, des tarifs et des disponibilités'
		expect(pageTitle(long).length).toBeLessThanOrEqual(MAX_TITLE)
		expect(pageTitle(long).endsWith('…')).toBe(true)
	})
})

describe('descriptions (U45)', () => {
	test('de 70 à 155 caractères, sans HTML', () => {
		const output = descriptionMeta(
			['court', `<p>Une <strong>maquilleuse</strong> ${'qui travaille partout en Haute-Savoie '.repeat(6)}</p>`],
			'repli'
		)
		expect(output.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
		expect(output.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
		expect(output).not.toMatch(/[<>]/)
	})

	test('un texte trop court cède la place au repli', () => {
		const fallback = 'Annuaire de maquilleuses professionnelles indépendantes : trouvez celle qui vous correspond.'
		expect(descriptionMeta(['trop court', null], fallback)).toBe(fallback)
	})
})

describe('adresse canonique (U46)', () => {
	test.each([
		['/', 'https://my-makeup.fr'],
		['/blog/', 'https://my-makeup.fr/blog'],
		['/search?city=Annecy&page=2', 'https://my-makeup.fr/search'],
		['//blog//article/#haut', 'https://my-makeup.fr/blog/article'],
		['https://www.my-makeup.fr/profil/abc/?utm=1', 'https://my-makeup.fr/profil/abc'],
		['//autre-hote.test/x', 'https://my-makeup.fr/autre-hote.test/x'],
	])('%s', (entree, attendu) => {
		expect(canonicalUrl(entree)).toBe(attendu)
	})

	test('une page indexable porte sa canonique, une page noindex n’en a pas', () => {
		const indexable = pageMetadata({ titre: 'Blog', description: '', repli: 'x'.repeat(80), chemin: '/blog/' })
		expect(indexable.alternates?.canonical).toBe('https://my-makeup.fr/blog')
		expect(indexable.robots).toBeUndefined()
		const excluded = pageMetadata({
			titre: 'Blog',
			description: '',
			repli: 'x'.repeat(80),
			chemin: '/blog',
			indexable: false,
		})
		expect(excluded.alternates).toBeUndefined()
		expect(excluded.robots).toEqual({ index: false, follow: true })
	})
})

describe('JSON-LD (U50)', () => {
	test('< > & sont échappés', () => {
		const output = serializeJsonLd({ name: '</script><b>&amp;' })
		expect(output).not.toMatch(/[<>&]/)
		expect(JSON.parse(output)).toEqual({ name: '</script><b>&amp;' })
	})
})

describe('robots (U52)', () => {
	test('/auth et /search, sous-chemins compris, sans toucher aux autres', () => {
		expect(NOINDEX_PATHS).toEqual(['/auth', '/search'])
		for (const filePath of ['/auth', '/auth/signin', '/search', '/search?city=Annecy'])
			expect(robotsForPath(filePath)).toBe(NOINDEX)
		for (const filePath of ['/', '/authentique', '/searching', '/profil/abc'])
			expect(robotsForPath(filePath)).toBeUndefined()
	})

	test('plus de noindex pour tout le site selon APP_ENV : il n’y a pas de préprod (ticket 232)', () => {
		for (const filePath of ['/', '/profil/abc', '/api/health']) expect(robotsForPath(filePath)).toBeUndefined()
	})

	test('le proxy ne lit plus APP_ENV : même déclaré « preprod », il ne pose le noindex que sur /auth et /search', () => {
		const before = process.env.APP_ENV
		try {
			const request = (chemin: string) =>
				({
					nextUrl: new URL(`https://exemple.test${chemin}`),
					cookies: { get: () => ({ value: 'cookie' }), getAll: () => [] },
					headers: new Headers(),
				}) as unknown as Parameters<typeof proxy>[0]
			for (const appEnv of ['prod', 'preprod']) {
				process.env.APP_ENV = appEnv
				expect(proxy(request('/')).headers.get('x-robots-tag')).toBeNull()
				expect(proxy(request('/search')).headers.get('x-robots-tag')).toBe(NOINDEX)
			}
		} finally {
			if (before === undefined) delete process.env.APP_ENV
			else process.env.APP_ENV = before
		}
	})
})

describe('reprise par les assistants', () => {
	const FORBIDDEN = /noarchive|nocache|nosnippet|max-snippet|data-nosnippet/i

	function sources(dossier: string): string[] {
		return readdirSync(dossier).flatMap(nom => {
			const filePath = join(dossier, nom)
			if (statSync(filePath).isDirectory()) return sources(filePath)
			return /\.(tsx?|css)$/.test(nom) ? [filePath] : []
		})
	}

	test('aucun fichier du site ni du gabarit ne les écrit', () => {
		const files = [
			...sources(join(ROOT, 'src/app/(front)')),
			...sources(join(ROOT, 'src/components')),
			...sources(join(ROOT, 'src/lib/seo')),
			join(ROOT, 'src/proxy.ts'),
		]
		expect(files.length).toBeGreaterThan(10)
		for (const file of files) {
			const content = readFileSync(file, 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')
			expect(content, file).not.toMatch(FORBIDDEN)
		}
	})
})

describe('robots.txt (E63)', () => {
	test('ouvre tout sauf l’API, avec le sitemap en adresse absolue', () => {
		const { rules, sitemap } = robotsRules()
		expect(rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/api/'] })
		expect(sitemap).toBe('https://my-makeup.fr/sitemap.xml')
	})

	test('n’interdit ni /auth ni /search, et ne vise aucun robot d’assistant', () => {
		const text = JSON.stringify(robotsRules())
		for (const filePath of NOINDEX_PATHS) expect(text).not.toContain(filePath)
		expect(text).not.toMatch(/GPTBot|ClaudeBot|CCBot|Google-Extended|Perplexity|Claude-|OAI-/)
	})

	test('une seule source : la route lit reglesRobots, aucun fichier statique', () => {
		expect(existsSync(join(ROOT, 'public/robots.txt'))).toBe(false)
		expect(readFileSync(join(ROOT, 'src/app/robots.ts'), 'utf8')).toContain('robotsRules()')
	})
})
