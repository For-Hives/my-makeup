import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { serializeJsonLd } from '../../src/lib/seo/json-ld'
import { metadonnees } from '../../src/lib/seo/metadata'
import { CHEMINS_NOINDEX, NOINDEX, reglesRobots, robotsPourChemin } from '../../src/lib/seo/robots'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, descriptionMeta, TITRE_MAX, titrePage } from '../../src/lib/seo/text'
import { urlCanonique } from '../../src/lib/seo/url'
import { proxy } from '../../src/proxy'

const RACINE = join(import.meta.dir, '../..')

describe('titres (U44)', () => {
	test('jamais « null null » ni « undefined », même avec des valeurs vides', () => {
		for (const valeur of [null, undefined, '', '  ', 'null null', 'undefined']) {
			const titre = titrePage(valeur)
			expect(titre).toBe('My-Makeup')
		}
		expect(titrePage('Léa null Martin')).toBe('Léa Martin | My-Makeup')
	})

	test('60 caractères au plus, la marque ajoutée quand elle tient', () => {
		expect(titrePage('Blog')).toBe('Blog | My-Makeup')
		const long = 'Maquilleuse de mariage à Annecy : des profils vérifiés, des tarifs et des disponibilités'
		expect(titrePage(long).length).toBeLessThanOrEqual(TITRE_MAX)
		expect(titrePage(long).endsWith('…')).toBe(true)
	})
})

describe('descriptions (U45)', () => {
	test('de 70 à 155 caractères, sans HTML', () => {
		const sortie = descriptionMeta(
			['court', `<p>Une <strong>maquilleuse</strong> ${'qui travaille partout en Haute-Savoie '.repeat(6)}</p>`],
			'repli'
		)
		expect(sortie.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
		expect(sortie.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
		expect(sortie).not.toMatch(/[<>]/)
	})

	test('un texte trop court cède la place au repli', () => {
		const repli = 'Annuaire de maquilleuses professionnelles indépendantes : trouvez celle qui vous correspond.'
		expect(descriptionMeta(['trop court', null], repli)).toBe(repli)
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
		expect(urlCanonique(entree)).toBe(attendu)
	})

	test('une page indexable porte sa canonique, une page noindex n’en a pas', () => {
		const indexable = metadonnees({ titre: 'Blog', description: '', repli: 'x'.repeat(80), chemin: '/blog/' })
		expect(indexable.alternates?.canonical).toBe('https://my-makeup.fr/blog')
		expect(indexable.robots).toBeUndefined()
		const exclue = metadonnees({
			titre: 'Blog',
			description: '',
			repli: 'x'.repeat(80),
			chemin: '/blog',
			indexable: false,
		})
		expect(exclue.alternates).toBeUndefined()
		expect(exclue.robots).toEqual({ index: false, follow: true })
	})
})

describe('JSON-LD (U50)', () => {
	test('< > & sont échappés', () => {
		const sortie = serializeJsonLd({ name: '</script><b>&amp;' })
		expect(sortie).not.toMatch(/[<>&]/)
		expect(JSON.parse(sortie)).toEqual({ name: '</script><b>&amp;' })
	})
})

describe('robots (U52)', () => {
	test('/auth et /search, sous-chemins compris, sans toucher aux autres', () => {
		expect(CHEMINS_NOINDEX).toEqual(['/auth', '/search'])
		for (const chemin of ['/auth', '/auth/signin', '/search', '/search?city=Annecy'])
			expect(robotsPourChemin(chemin)).toBe(NOINDEX)
		for (const chemin of ['/', '/authentique', '/searching', '/profil/abc'])
			expect(robotsPourChemin(chemin)).toBeUndefined()
	})

	test('plus de noindex pour tout le site selon APP_ENV : il n’y a pas de préprod (ticket 232)', () => {
		for (const chemin of ['/', '/profil/abc', '/api/health']) expect(robotsPourChemin(chemin)).toBeUndefined()
	})

	test('le proxy ne lit plus APP_ENV : même déclaré « preprod », il ne pose le noindex que sur /auth et /search', () => {
		const avant = process.env.APP_ENV
		try {
			const requete = (chemin: string) =>
				({
					nextUrl: new URL(`https://exemple.test${chemin}`),
					cookies: { get: () => ({ value: 'cookie' }), getAll: () => [] },
					headers: new Headers(),
				}) as unknown as Parameters<typeof proxy>[0]
			for (const appEnv of ['prod', 'preprod']) {
				process.env.APP_ENV = appEnv
				expect(proxy(requete('/')).headers.get('x-robots-tag')).toBeNull()
				expect(proxy(requete('/search')).headers.get('x-robots-tag')).toBe(NOINDEX)
			}
		} finally {
			if (avant === undefined) delete process.env.APP_ENV
			else process.env.APP_ENV = avant
		}
	})
})

describe('reprise par les assistants', () => {
	const INTERDITS = /noarchive|nocache|nosnippet|max-snippet|data-nosnippet/i

	function sources(dossier: string): string[] {
		return readdirSync(dossier).flatMap(nom => {
			const chemin = join(dossier, nom)
			if (statSync(chemin).isDirectory()) return sources(chemin)
			return /\.(tsx?|css)$/.test(nom) ? [chemin] : []
		})
	}

	test('aucun fichier du site ni du gabarit ne les écrit', () => {
		const fichiers = [
			...sources(join(RACINE, 'src/app/(front)')),
			...sources(join(RACINE, 'src/components')),
			...sources(join(RACINE, 'src/lib/seo')),
			join(RACINE, 'src/proxy.ts'),
		]
		expect(fichiers.length).toBeGreaterThan(10)
		for (const fichier of fichiers) {
			const contenu = readFileSync(fichier, 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')
			expect(contenu, fichier).not.toMatch(INTERDITS)
		}
	})
})

describe('robots.txt (E63)', () => {
	test('ouvre tout sauf l’API, avec le sitemap en adresse absolue', () => {
		const { rules, sitemap } = reglesRobots()
		expect(rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/api/'] })
		expect(sitemap).toBe('https://my-makeup.fr/sitemap.xml')
	})

	test('n’interdit ni /auth ni /search, et ne vise aucun robot d’assistant', () => {
		const texte = JSON.stringify(reglesRobots())
		for (const chemin of CHEMINS_NOINDEX) expect(texte).not.toContain(chemin)
		expect(texte).not.toMatch(/GPTBot|ClaudeBot|CCBot|Google-Extended|Perplexity|Claude-|OAI-/)
	})

	test('une seule source : la route lit reglesRobots, aucun fichier statique', () => {
		expect(existsSync(join(RACINE, 'public/robots.txt'))).toBe(false)
		expect(readFileSync(join(RACINE, 'src/app/robots.ts'), 'utf8')).toContain('reglesRobots()')
	})
})
