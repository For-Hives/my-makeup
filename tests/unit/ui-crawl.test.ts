import { describe, expect, test } from 'bun:test'
import {
	contextOptions,
	crawl,
	createPacer,
	decide,
	isExpectedNotFound,
	MINIMUM_GAP_MS,
	readSettings,
	reportedAddress,
	type Settings,
} from '../../scripts/cutover/ui-crawl'
import {
	CRAWL_ADDRESS_COUNT,
	crawlAddresses,
	type DefectKind,
	findDefects,
	type PageFacts,
	SEARCH_PATHS,
	UNKNOWN_PATH,
} from '../support/ui-crawl'

const clean: PageFacts = {
	status: 200,
	consoleErrors: [],
	h1Count: 1,
	navCount: 1,
	text: 'Trouve ta maquilleuse. 3 résultats.',
	overflow: 0,
	overflowing: [],
	brokenImages: [],
	blockedRequests: [],
}

const sitemap = (prefix: string, count: number): string[] =>
	Array.from({ length: count }, (_, n) => `${prefix}fictif-${n + 1}`)

describe('crawl des interfaces (177) : les défauts d’une page', () => {
	test('une page propre ne donne rien', () => {
		expect(findDefects(clean)).toEqual([])
	})

	const cases: [string, Partial<PageFacts>, DefectKind][] = [
		['une réponse 5xx', { status: 503 }, 'status'],
		['une erreur de console', { consoleErrors: ['Uncaught TypeError'] }, 'console-error'],
		['aucun h1', { h1Count: 0 }, 'h1'],
		['deux h1', { h1Count: 2 }, 'h1'],
		['aucune Nav', { navCount: 0 }, 'nav'],
		['deux Nav', { navCount: 2 }, 'nav'],
		['« undefined » visible', { text: 'Bonjour undefined' }, 'visible-text'],
		['« null » visible', { text: 'Ville : null' }, 'visible-text'],
		['« [object Object] » visible', { text: 'Zone : [object Object]' }, 'visible-text'],
		['un débordement', { overflow: 12, overflowing: ['div.large'] }, 'overflow'],
		['une image cassée', { brokenImages: ['/media/a.webp'] }, 'broken-image'],
		['une requête refusée', { blockedRequests: ['GET vers un autre hôte (exemple.test)'] }, 'blocked-request'],
	]
	test.each(cases)('%s est un défaut', (_name, change, kind) => {
		expect(findDefects({ ...clean, ...change }).map(defect => defect.kind)).toEqual([kind])
	})

	test('les mots qui ressemblent à undefined ou null sans l’être ne comptent pas', () => {
		expect(findDefects({ ...clean, text: 'Une nulle part, indéfini, annulé, nullité' })).toEqual([])
	})

	test('un 404 attendu est propre, un 200 à sa place est un défaut', () => {
		expect(findDefects({ ...clean, status: 404 }, 404)).toEqual([])
		expect(findDefects({ ...clean, status: 200 }, 404).map(defect => defect.kind)).toEqual(['status'])
		expect(findDefects({ ...clean, status: 404 }).map(defect => defect.kind)).toEqual(['status'])
	})
})

describe('crawl des interfaces (177) : les 40 adresses', () => {
	const all = [...sitemap('/profil/', 12), ...sitemap('/talent/', 5), ...sitemap('/blog/', 5)]

	test('quarante adresses sans doublon, dont la recherche, une 404 attendue, aucune page de l’espace', () => {
		const addresses = crawlAddresses(all)
		expect(addresses).toHaveLength(CRAWL_ADDRESS_COUNT)
		const paths = addresses.map(address => address.path)
		expect(new Set(paths).size).toBe(CRAWL_ADDRESS_COUNT)
		for (const search of SEARCH_PATHS) expect(paths).toContain(search)
		expect(paths).toContain('/')
		expect(addresses.find(address => address.path === UNKNOWN_PATH)?.expectedStatus).toBe(404)
		expect(paths.filter(path => path.startsWith('/auth') || path.startsWith('/admin'))).toEqual([])
		expect(
			addresses.filter(address => address.path !== UNKNOWN_PATH).every(address => address.expectedStatus === 200)
		).toBe(true)
	})

	test('la liste suit l’ordre du sitemap : le même sitemap donne les mêmes adresses', () => {
		expect(crawlAddresses(all)).toEqual(crawlAddresses([...all]))
		const paths = crawlAddresses(all).map(address => address.path)
		expect(paths).toContain('/profil/fictif-1')
		expect(paths).not.toContain('/profil/fictif-12')
	})

	test('une famille courte laisse la place aux autres', () => {
		const paths = crawlAddresses([...sitemap('/profil/', 30), ...sitemap('/talent/', 1)]).map(address => address.path)
		expect(paths).toHaveLength(CRAWL_ADDRESS_COUNT)
		expect(paths.filter(path => path.startsWith('/profil/')).length).toBeGreaterThan(9)
	})

	test('un sitemap trop court est une erreur, jamais un crawl plus court', () => {
		expect(() => crawlAddresses(sitemap('/profil/', 2))).toThrow(/besoin de 40 adresses/)
	})

	test('le dossier d’un préfixe seul (« /blog/ ») n’est pas une page', () => {
		const paths = crawlAddresses([...all, '/blog/', '/profil/']).map(address => address.path)
		expect(paths).not.toContain('/profil/')
		expect(paths.filter(path => path === '/blog/')).toEqual([])
	})
})

describe('crawl des interfaces (177) : la lecture seule', () => {
	const settings: Settings = { target: new URL('https://my-makeup.fr') }
	const get = (url: string) => decide({ method: 'GET', url, hasBody: false }, settings)

	test('un GET de la cible passe', () => {
		expect(get('https://my-makeup.fr/blog')).toEqual({ action: 'continue', headers: {} })
		expect(get('https://my-makeup.fr/u/script.js')).toEqual({ action: 'continue', headers: {} })
	})

	test('un autre hôte, une écriture, un chemin de mesure inconnu sont répondus à vide et notés', () => {
		for (const decision of [
			get('https://cdn.exemple.test/a.js'),
			decide({ method: 'POST', url: 'https://my-makeup.fr/api/contact', hasBody: true }, settings),
			get('https://my-makeup.fr/u/api/stats'),
			decide({ method: 'PUT', url: 'https://my-makeup.fr/x', hasBody: false }, settings),
		]) {
			expect(decision.action).toBe('answer')
			if (decision.action === 'answer') expect(decision.blocked).not.toBeNull()
		}
	})

	test('l’événement de mesure ne part jamais, et n’est pas un défaut', () => {
		expect(decide({ method: 'POST', url: 'https://my-makeup.fr/u/api/send', hasBody: true }, settings)).toEqual({
			action: 'answer',
			blocked: null,
		})
	})

	test('l’accès protégé ne part que vers l’hôte temporaire', () => {
		const temporary = readSettings({
			UI_CRAWL_TARGET: 'https://v3.my-makeup.fr',
			UI_CRAWL_ACCESS_USER: 'agent',
			UI_CRAWL_ACCESS_PASSWORD: 'secret-fictif',
		})
		const decision = decide({ method: 'GET', url: 'https://v3.my-makeup.fr/', hasBody: false }, temporary)
		expect(decision).toEqual({ action: 'continue', headers: { authorization: `Basic ${btoa('agent:secret-fictif')}` } })
		const other = decide({ method: 'GET', url: 'https://my-makeup.fr/', hasBody: false }, temporary)
		expect(other.action).toBe('answer')
		expect(() =>
			readSettings({
				UI_CRAWL_TARGET: 'https://my-makeup.fr',
				UI_CRAWL_ACCESS_USER: 'agent',
				UI_CRAWL_ACCESS_PASSWORD: 'secret-fictif',
			})
		).toThrow(/ne servent que pour/)
		expect(() => readSettings({ UI_CRAWL_TARGET: 'https://v3.my-makeup.fr', UI_CRAWL_ACCESS_USER: 'agent' })).toThrow(
			/vont ensemble/
		)
	})

	test('la cible refuse un hôte hors production et sans variable', () => {
		expect(() => readSettings({})).toThrow(/UI_CRAWL_TARGET manque/)
		expect(() => readSettings({ UI_CRAWL_TARGET: 'https://exemple.test' })).toThrow(/refusée/)
		expect(() => readSettings({ UI_CRAWL_TARGET: 'http://127.0.0.1:3100' })).not.toThrow()
	})

	test('un profil est nommé par son empreinte dans le rapport, jamais par son adresse', () => {
		expect(reportedAddress('/profil/une-personne-fictive')).toMatch(/^profil #[0-9a-f]{8}$/)
		expect(reportedAddress('/blog/un-article')).toBe('/blog/un-article')
	})
})

describe('crawl des interfaces (177) : la ligne du 404 attendu', () => {
	const unknown = { path: '/une-page-qui-n-existe-pas', expectedStatus: 404 }
	const line = (status: number, path: string) =>
		`Failed to load resource: the server responded with a status of ${status} (Not Found) http://localhost:3377${path}`

	test('la ligne de la page attendue en 404 est écartée, aucune autre', () => {
		expect(isExpectedNotFound(line(404, unknown.path), unknown)).toBe(true)
		// An image that answers 404 on that page stays a defect, and so does any page expected to be 200.
		expect(isExpectedNotFound(line(404, '/media/a.webp'), unknown)).toBe(false)
		expect(isExpectedNotFound(line(500, unknown.path), unknown)).toBe(false)
		expect(isExpectedNotFound(line(404, '/blog'), { path: '/blog', expectedStatus: 200 })).toBe(false)
	})
})

describe('crawl des interfaces (177) : le rythme', () => {
	test('deux requêtes par seconde au plus, même demandées ensemble', async () => {
		let now = 0
		const clock = {
			maintenant: () => now,
			attendre: async (ms: number) => {
				now += ms
			},
		}
		const pacer = createPacer(MINIMUM_GAP_MS, clock)
		await Promise.all(Array.from({ length: 6 }, () => pacer.wait()))
		expect(pacer.starts).toHaveLength(6)
		const gaps = pacer.starts.slice(1).map((start, rank) => start - (pacer.starts[rank] ?? 0))
		expect(Math.min(...gaps)).toBeGreaterThanOrEqual(500)
	})

	test('sans écart, rien n’attend', async () => {
		let waited = 0
		const pacer = createPacer(0, {
			maintenant: () => 0,
			attendre: async ms => {
				waited += ms
			},
		})
		await Promise.all([pacer.wait(), pacer.wait(), pacer.wait()])
		expect(waited).toBe(0)
	})
})

/** A fictional site on this machine: every path answers a clean page, the sitemap names enough addresses. */
function serveFictionalSite() {
	const seen: { path: string; authorization: string | null }[] = []
	const profiles = Array.from({ length: 12 }, (_, n) => `/profil/fictif-${n + 1}`)
	const talents = Array.from({ length: 6 }, (_, n) => `/talent/fictif-${n + 1}`)
	const articles = Array.from({ length: 6 }, (_, n) => `/blog/fictif-${n + 1}`)
	const page = `<!doctype html><html lang="fr"><head><title>Propre</title></head><body><nav aria-label="Navigation principale"><a href="/">Accueil</a></nav><h1>Une page propre</h1></body></html>`
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch(request) {
			const { pathname } = new URL(request.url)
			seen.push({ path: pathname, authorization: request.headers.get('authorization') })
			if (pathname === '/sitemap.xml') {
				const urls = [...profiles, ...talents, ...articles].map(path => `<url><loc>http://127.0.0.1${path}</loc></url>`)
				return new Response(`<?xml version="1.0"?><urlset>${urls.join('')}</urlset>`, {
					headers: { 'content-type': 'application/xml' },
				})
			}
			const known = pathname === '/une-page-qui-n-existe-pas'
			return new Response(page, { status: known ? 404 : 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
		},
	})
	return { server, seen }
}

describe('crawl des interfaces (280) : une cible donnée comme une adresse absolue', () => {
	test('le contexte du navigateur a la base de la cible, à chaque largeur', () => {
		const settings: Settings = { target: new URL('https://v3.my-makeup.fr') }
		for (const screen of ['mobile', 'desktop'] as const) {
			expect(contextOptions(screen, settings).baseURL).toBe('https://v3.my-makeup.fr')
		}
		expect(contextOptions('mobile', { target: new URL('http://127.0.0.1:3100/') }).baseURL).toBe(
			'http://127.0.0.1:3100'
		)
	})

	test('le crawl d’une adresse absolue ouvre les 40 adresses aux deux largeurs sans défaut', async () => {
		const { server, seen } = serveFictionalSite()
		try {
			const report = await crawl({ settings: { target: new URL(`http://127.0.0.1:${server.port}`) } })
			expect(report.addresses).toBe(CRAWL_ADDRESS_COUNT)
			expect(report.pagesRead).toBe(CRAWL_ADDRESS_COUNT * 2)
			expect(report.pages.every(page => page.status === 200 || page.address === UNKNOWN_PATH)).toBe(true)
			expect(report.defectCount).toBe(0)
			expect(seen.some(request => request.path === '/')).toBe(true)
		} finally {
			await server.stop(true)
		}
	}, 120_000)

	test('l’accès protégé ne part qu’avec les requêtes vers l’origine de la cible', () => {
		const settings = readSettings({
			UI_CRAWL_TARGET: 'https://v3.my-makeup.fr',
			UI_CRAWL_ACCESS_USER: 'agent',
			UI_CRAWL_ACCESS_PASSWORD: 'secret-fictif',
		})
		const sent = `Basic ${btoa('agent:secret-fictif')}`
		// Relative paths are resolved on the base: the browser asks for the absolute address of the target.
		const own = decide({ method: 'GET', url: new URL('/blog', settings.target).href, hasBody: false }, settings)
		expect(own).toEqual({ action: 'continue', headers: { authorization: sent } })
		for (const url of [
			'https://my-makeup.fr/blog',
			'https://cdn.exemple.test/a.js',
			'http://v3.my-makeup.fr/blog',
			'https://v3.my-makeup.fr:8443/blog',
		]) {
			const other = decide({ method: 'GET', url, hasBody: false }, settings)
			expect(other.action).toBe('answer')
			expect('headers' in other).toBe(false)
		}
	})
})
