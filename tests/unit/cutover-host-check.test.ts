import { describe, expect, test } from 'bun:test'
import {
	CheckRefused,
	checkHost,
	OLD_ROUTES,
	REDIRECT_CHECK_PATH,
	readSettings,
	run,
	type Settings,
	sitemapAddresses,
	sitemapSet,
	type Tools,
	writeReport,
} from '../../scripts/cutover/host-check'
import {
	CHECK_AGENT,
	checkQuery,
	checkTarget,
	ForbiddenQuery,
	keep,
	keepAliases,
	TargetRefused,
	type Transport,
} from '../../scripts/cutover/host-guard'
import { benchCase } from '../support/url-parity'

/**
 * Ticket 173: the check of a host (scripts/cutover/host-check.ts). No request leaves this machine:
 * the host is played by a fake transport that answers what the frozen table promises. The run on a
 * real host is tests/e2e/host-check.spec.ts (I45, U61 to U64).
 */

const SLUG_PROFILE = 'essai-controle-hote'
const DATASET = {
	profilsVisibles: [SLUG_PROFILE],
	profilsMasques: [],
	ancienNom: null,
	talents: ['essai-talent'],
	articlesPublies: ['essai-article'],
	articlesBrouillons: [],
}

const page = (statut = 200) => `<!doctype html><html><body><h1>Titre ${statut}</h1></body></html>`
const html = (status: number) =>
	new Response(page(status), { status, headers: { 'content-type': 'text/html; charset=utf-8' } })

const SITEMAP = `<?xml version="1.0"?><urlset>${[
	`/profil/${SLUG_PROFILE}`,
	'/talent/essai-talent',
	'/blog/essai-article',
	'/a-propos',
]
	.map(c => `<url><loc>https://my-makeup.fr${c}</loc></url>`)
	.join('')}</urlset>`

type Responses = Map<string, () => Response>

/** A host that answers what the table promises for the cases of the made-up set. */
function compliantHost(): Responses {
	const responses: Responses = new Map()
	for (const c of benchCase({}, DATASET)) {
		const status = c.statuts[0] ?? 200
		if (c.vers) {
			responses.set(c.adresse, () => new Response(null, { status: status, headers: { location: c.vers ?? '' } }))
			if (!responses.has(c.vers)) responses.set(c.vers, () => html(c.statutFinal))
		} else if (c.titre === 'non-verifie') responses.set(c.adresse, () => new Response('x', { status: status }))
		else responses.set(c.adresse, () => html(status))
	}
	responses.set('/api/health', () => Response.json({ ok: true, version: 'abc1234' }))
	responses.set('/sitemap.xml', () => new Response(SITEMAP, { headers: { 'content-type': 'application/xml' } }))
	responses.set(
		'/robots.txt',
		() =>
			new Response('User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://my-makeup.fr/sitemap.xml\n', {
				headers: { 'content-type': 'text/plain' },
			})
	)
	responses.set(
		'/u/script.js',
		() => new Response('(function(){})()', { headers: { 'content-type': 'text/javascript' } })
	)
	for (const route of OLD_ROUTES) responses.set(route, () => html(404))
	return responses
}

function transportOf(reponses: Responses): {
	transport: Transport
	appels: { methode: string; chemin: string; entetes: Headers }[]
} {
	const calls: { methode: string; chemin: string; entetes: Headers }[] = []
	const transport: Transport = async (adresse, init) => {
		const filePath = adresse.pathname + adresse.search
		calls.push({ methode: String(init.method), chemin: filePath, entetes: new Headers(init.headers) })
		return (reponses.get(filePath) ?? (() => html(404)))()
	}
	return { transport, appels: calls }
}

const TARGET = new URL('https://hote.example.test')
const settings: Settings = { cible: TARGET }
const withoutWaiting = (transport: Transport): Tools => ({
	transport,
	intervalleMs: 0,
	anciens: {},
	maintenant: () => new Date('2026-10-15T10:00:00Z'),
})

describe('la garde : une lecture, sur la cible, et rien d’autre', () => {
	const read = (chemin: string, init: RequestInit = {}, autorisation?: string) =>
		checkQuery(chemin, init, TARGET, autorisation)

	test('une écriture est interrompue avant de partir', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
			expect(() => read('/contact', { method })).toThrow(ForbiddenQuery)
		expect(() => read('/contact', { body: 'x' })).toThrow(ForbiddenQuery)
	})

	test('sous /u, les quatre adresses de l’inventaire en GET et rien d’autre : la mesure n’est jamais comptée', () => {
		for (const filePath of ['/u', '/u/script.js', '/u/api/send', '/u/autre-chemin'])
			expect(read(filePath).adresse.pathname).toBe(filePath)
		expect(() => read('/u/api/send', { method: 'POST' })).toThrow(ForbiddenQuery)
		for (const filePath of [
			'/u/',
			'//u/api/send',
			'/%75/api/send',
			'/u/script.js?x=1',
			'/u/api/send?x=1',
			'/u/api/batch',
		])
			expect(() => read(filePath)).toThrow(ForbiddenQuery)
	})

	test('un chemin à double barre reste un chemin de la cible, jamais un autre hôte', () => {
		expect(read('//profil/x').adresse.href).toBe('https://hote.example.test//profil/x')
		expect(() => read('https://autre.example.test/')).toThrow(ForbiddenQuery)
		expect(() => read('@autre.example.test/')).toThrow(ForbiddenQuery)
	})

	test('ni cookie ni Authorization de l’appelant', () => {
		expect(() => read('/', { headers: { cookie: 'a=b' } })).toThrow(ForbiddenQuery)
		expect(() => read('/', { headers: { Authorization: 'Bearer x' } })).toThrow(ForbiddenQuery)
		expect(read('/').entetes.get('user-agent')).toBe(CHECK_AGENT)
	})

	test('l’accès protégé ne part que vers l’hôte temporaire, jamais vers le site', () => {
		expect(() => read('/', {}, 'Basic eA==')).toThrow(ForbiddenQuery)
		expect(() => checkQuery('/', {}, new URL('https://my-makeup.fr'), 'Basic eA==')).toThrow(ForbiddenQuery)
		const temporary = new URL('https://v3.my-makeup.fr')
		expect(checkQuery('/', {}, temporary, 'Basic eA==').entetes.get('authorization')).toBe('Basic eA==')
	})

	test('aucune redirection suivie, la méthode est GET', async () => {
		const { transport, appels: calls } = transportOf(new Map())
		let initReceived: RequestInit | undefined
		await keep(TARGET, async (adresse, init) => {
			initReceived = init
			return transport(adresse, init)
		})('/a-propos')
		expect(initReceived?.redirect).toBe('manual')
		expect(calls[0]?.methode).toBe('GET')
	})

	test('la cible : https, ou http sur ce poste, une origine seule', () => {
		expect(checkTarget('https://my-makeup.fr').href).toBe('https://my-makeup.fr/')
		expect(checkTarget('https://v3.my-makeup.fr').href).toBe('https://v3.my-makeup.fr/')
		expect(checkTarget('http://127.0.0.1:3373').origin).toBe('http://127.0.0.1:3373')
		for (const bad of [
			'http://my-makeup.fr',
			'https://www.my-makeup.fr',
			'https://ancien.my-makeup.fr',
			'ftp://x.test',
			'https://x.test/chemin',
			'https://u:p@x.test',
			'pas une adresse',
		])
			expect(() => checkTarget(bad)).toThrow(TargetRefused)
	})
})

describe('les réglages', () => {
	test('seule la production se lit en ligne : la préprod et tout autre hôte sont refusés', () => {
		for (const host of ['https://preprod.my-makeup.fr', 'https://x.test', 'https://not-my-makeup.fr'])
			expect(() => readSettings({ HOST_CHECK_TARGET: host })).toThrow(TargetRefused)
		expect(readSettings({ HOST_CHECK_TARGET: 'https://my-makeup.fr' }).cible.hostname).toBe('my-makeup.fr')
	})

	test('l’accès protégé : facultatif, jamais à moitié, et seulement pour l’hôte temporaire', () => {
		const access = { HOST_CHECK_ACCESS_USER: 'essai', HOST_CHECK_ACCESS_PASSWORD: 'factice-173' }
		expect(readSettings({ HOST_CHECK_TARGET: 'https://v3.my-makeup.fr' }).autorisation).toBeUndefined()
		expect(readSettings({ HOST_CHECK_TARGET: 'https://v3.my-makeup.fr', ...access }).autorisation).toBe(
			`Basic ${btoa('essai:factice-173')}`
		)
		expect(() =>
			readSettings({ HOST_CHECK_TARGET: 'https://v3.my-makeup.fr', HOST_CHECK_ACCESS_USER: 'essai' })
		).toThrow(CheckRefused)
		expect(() => readSettings({ HOST_CHECK_TARGET: 'https://my-makeup.fr', ...access })).toThrow(CheckRefused)
		expect(() => readSettings({ HOST_CHECK_TARGET: 'http://127.0.0.1:3373', ...access })).toThrow(CheckRefused)
		expect(readSettings({ HOST_CHECK_TARGET: 'http://127.0.0.1:3373' }).autorisation).toBeUndefined()
	})

	test('sans cible : refusé, et le code de sortie est 2 sans une requête', async () => {
		const lines: string[] = []
		expect(await run({}, l => lines.push(l))).toBe(2)
		expect(await run({ HOST_CHECK_TARGET: 'http://my-makeup.fr' }, l => lines.push(l))).toBe(2)
		expect(lines.join('\n')).toContain('HOST_CHECK_TARGET')
	})
})

describe('la lecture du sitemap', () => {
	test('les chemins, et le jeu de profils, talents et articles', () => {
		const paths = sitemapAddresses(SITEMAP)
		expect(paths).toEqual(['/profil/essai-controle-hote', '/talent/essai-talent', '/blog/essai-article', '/a-propos'])
		expect(sitemapSet(paths)).toEqual({ ...DATASET, talents: ['essai-talent'], articlesPublies: ['essai-article'] })
		expect(sitemapSet(['/blog', '/profil/a/b']).articlesPublies).toEqual([])
	})
})

describe('I45 sur un hôte : le rapport', () => {
	test('un hôte conforme : tout est conforme, aucun 5xx, lectures seules', async () => {
		const { transport, appels: calls } = transportOf(compliantHost())
		const report = await checkHost(settings, withoutWaiting(transport))
		expect(report.defauts).toEqual([])
		expect(report.verdict).toBe('conforme')
		expect(report.reponses5xx).toBe(0)
		expect(report.adresses.enEchec).toBe(0)
		expect(report.adresses.controlees).toBeGreaterThan(30)
		expect(report.version).toBe('abc1234')
		expect(report.date).toBe('2026-10-15T10:00:00.000Z')
		expect(calls.every(({ methode }) => methode === 'GET')).toBe(true)
		// Under /u only GET reads; no cookie anywhere.
		expect(
			calls.filter(({ chemin: filePath }) => filePath.startsWith('/u')).every(({ methode }) => methode === 'GET')
		).toBe(true)
		expect(calls.some(({ entetes }) => entetes.has('cookie') || entetes.has('authorization'))).toBe(false)
		expect(report.sections.map(s => s.titre)).toContain('Script de mesure')
	})

	test('un hôte derrière Traefik, qui nettoie `//` : code 0, la double barre en écarts connus (ticket 270)', async () => {
		const responses = compliantHost()
		for (const c of benchCase({}, DATASET).filter(testCase => testCase.famille === 'double-barre')) {
			// Traefik cleans the path: the page of the clean address answers, with its canonical; the redirect of its own rule stays.
			if (c.statuts[0] === 301 && c.adresse.endsWith('toutes-les-news')) continue
			responses.set(
				c.adresse,
				() =>
					new Response(
						`<!doctype html><html><head><link rel="canonical" href="https://my-makeup.fr${c.canonique}"/></head><body><h1>Titre 200</h1></body></html>`,
						{ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
					)
			)
		}
		const report = await checkHost(settings, withoutWaiting(transportOf(responses).transport))
		expect(report.verdict).toBe('conforme')
		expect(report.adresses.enEchec).toBe(0)
		expect(report.adresses.ecartsConnus).toBeGreaterThan(0)
		expect(writeReport(report)).toMatch(/double-barre : \d+ conformes, \d+ écarts? connus?/)
		expect(writeReport(report)).not.toMatch(/double-barre[^\n]*en échec/)
	})

	test('une adresse cassée exprès est détectée, et le rapport la nomme', async () => {
		const responses = compliantHost()
		responses.set('/a-propos', () => new Response('boom', { status: 500, headers: { 'content-type': 'text/html' } }))
		const report = await checkHost(settings, withoutWaiting(transportOf(responses).transport))
		expect(report.verdict).toBe('non-conforme')
		expect(report.adresses.enEchec).toBeGreaterThan(0)
		expect(report.reponses5xx).toBeGreaterThan(0)
		expect(report.defauts.join('\n')).toContain('/a-propos')
		expect(writeReport(report)).toContain('NON CONFORME')
	})

	test('une adresse qui ne répond pas est un défaut, pas un arrêt', async () => {
		const responses = compliantHost()
		responses.set('/contact', () => {
			throw Object.assign(new Error('secret'), { cause: { code: 'ECONNRESET' } })
		})
		const report = await checkHost(settings, withoutWaiting(transportOf(responses).transport))
		expect(report.verdict).toBe('non-conforme')
		expect(report.defauts.join('\n')).toContain('ECONNRESET')
		expect(report.defauts.join('\n')).not.toContain('secret')
	})

	test('une ancienne route d’authentification qui répond, le script absent, le robots muet : chacun est un défaut', async () => {
		const responses = compliantHost()
		responses.set('/api/auth/session', () => Response.json({ user: null }))
		responses.set('/u/script.js', () => new Response('nope', { status: 404 }))
		responses.set('/robots.txt', () => new Response('rien', { headers: { 'content-type': 'text/plain' } }))
		const report = await checkHost(settings, withoutWaiting(transportOf(responses).transport))
		const compliant = Object.fromEntries(report.sections.map(s => [s.titre, s.conforme]))
		expect(compliant['Anciennes routes d’authentification']).toBe(false)
		expect(compliant['Script de mesure']).toBe(false)
		expect(compliant['Fichier robots']).toBe(false)
		expect(compliant.Sitemap).toBe(true)
	})

	test('le sitemap : une adresse qu’il liste et qui ne répond plus 200 est un défaut', async () => {
		const responses = compliantHost()
		responses.set('/a-propos', () => html(404))
		const report = await checkHost(settings, withoutWaiting(transportOf(responses).transport))
		expect(report.verdict).toBe('non-conforme')
	})

	test('le rapport n’écrit jamais l’adresse d’un profil : une empreinte de 8 chiffres, et des nombres', async () => {
		const responses = compliantHost()
		responses.set(`/profil/${SLUG_PROFILE}`, () => html(500))
		const report = await checkHost(settings, withoutWaiting(transportOf(responses).transport))
		const text = `${writeReport(report)}\n${JSON.stringify(report)}`
		expect(report.verdict).toBe('non-conforme')
		expect(text).toMatch(/profil #[0-9a-f]{8}/)
		expect(text).not.toContain(SLUG_PROFILE)
	})

	test('l’empreinte des adresses change quand une adresse change d’état', async () => {
		const good = await checkHost(settings, withoutWaiting(transportOf(compliantHost()).transport))
		const same = await checkHost(settings, withoutWaiting(transportOf(compliantHost()).transport))
		const responses = compliantHost()
		responses.set('/a-propos', () => html(404))
		const other = await checkHost(settings, withoutWaiting(transportOf(responses).transport))
		expect(same.empreinte).toBe(good.empreinte)
		expect(other.empreinte).not.toBe(good.empreinte)
		expect(good.empreinte).toMatch(/^[0-9a-f]{8}$/)
	})
})

describe('deux requêtes par seconde au plus', () => {
	test('500 ms au moins entre deux départs, sur toute la lecture', async () => {
		let hour = 0
		const { transport } = transportOf(compliantHost())
		const report = await checkHost(settings, {
			transport: async (adresse, init) => {
				hour += 10
				return transport(adresse, init)
			},
			anciens: {},
			horloge: {
				maintenant: () => hour,
				attendre: async ms => {
					hour += ms
				},
			},
		})
		expect(report.requetes).toBeGreaterThan(30)
		expect(report.ecartMinimalMs).toBeGreaterThanOrEqual(500)
	})
})

describe('les redirections de www et de http vers le domaine principal (issue 990)', () => {
	const MAIN = new URL('https://my-makeup.fr')
	const WWW = `https://www.my-makeup.fr${REDIRECT_CHECK_PATH}`
	const PLAIN = `http://my-makeup.fr${REDIRECT_CHECK_PATH}`
	const GOAL = `https://my-makeup.fr${REDIRECT_CHECK_PATH}`

	/** The main host, compliant, with www and http answering what `answers` says (by full address). */
	function mainHost(answers: Record<string, () => Response>): Transport {
		const { transport } = transportOf(compliantHost())
		return async (adresse, init) => {
			if (adresse.origin === MAIN.origin) return transport(adresse, init)
			const answer = answers[adresse.href]
			return answer ? answer() : new Response(null, { status: 404 })
		}
	}
	const moved =
		(status: number, to = GOAL) =>
		() =>
			new Response(null, { status, headers: { location: to } })
	const withMain = (transport: Transport) => checkHost({ cible: MAIN }, withoutWaiting(transport))

	test('301 ou 308 vers le domaine principal en un saut, chemin et paramètres gardés : conforme', async () => {
		for (const status of [301, 308]) {
			const report = await withMain(mainHost({ [WWW]: moved(status), [PLAIN]: moved(status) }))
			expect(report.defauts).toEqual([])
			const section = report.sections.find(s => s.titre === 'Redirections de www et de http')
			expect(section?.conforme).toBe(true)
			expect(section?.constats.join(' ')).toContain(`${status}`)
		}
	})

	test('une redirection temporaire (302), un second saut ou une autre destination est un défaut', async () => {
		const temporary = await withMain(mainHost({ [WWW]: moved(302), [PLAIN]: moved(301) }))
		expect(temporary.verdict).toBe('non-conforme')
		expect(temporary.defauts.join(' ')).toContain('www')
		const twoHops = await withMain(
			mainHost({ [WWW]: moved(301), [PLAIN]: moved(301, `https://www.my-makeup.fr${REDIRECT_CHECK_PATH}`) })
		)
		expect(twoHops.verdict).toBe('non-conforme')
		expect(twoHops.defauts.join(' ')).toContain('http')
		const lostQuery = await withMain(
			mainHost({ [WWW]: moved(301, 'https://my-makeup.fr/a-propos'), [PLAIN]: moved(301) })
		)
		expect(lostQuery.verdict).toBe('non-conforme')
		const answers200 = await withMain(mainHost({ [WWW]: () => html(200), [PLAIN]: moved(301) }))
		expect(answers200.verdict).toBe('non-conforme')
	})

	test('les deux lectures sont des GET anonymes, sans suivre la redirection', async () => {
		const seen: { href: string; method: string; redirect?: string; headers: Headers }[] = []
		const base = mainHost({ [WWW]: moved(301), [PLAIN]: moved(301) })
		await withMain(async (adresse, init) => {
			if (adresse.origin !== MAIN.origin)
				seen.push({
					href: adresse.href,
					method: String(init.method),
					headers: new Headers(init.headers),
					...(init.redirect ? { redirect: init.redirect } : {}),
				})
			return base(adresse, init)
		})
		expect(seen.map(({ href }) => href).sort()).toEqual([PLAIN, WWW].sort())
		for (const call of seen) {
			expect(call.method).toBe('GET')
			expect(call.redirect).toBe('manual')
			expect(call.headers.has('cookie') || call.headers.has('authorization')).toBe(false)
		}
	})

	test('l’en-tête HSTS du domaine est relevé dans le rapport, includeSubDomains dit oui ou non', async () => {
		const withHeader = (value: string) => {
			const base = mainHost({ [WWW]: moved(301), [PLAIN]: moved(301) })
			return async (adresse: URL, init: RequestInit) => {
				const answer = await base(adresse, init)
				if (adresse.pathname !== '/api/health' || adresse.origin !== MAIN.origin) return answer
				return new Response(answer.body, { status: answer.status, headers: { 'strict-transport-security': value } })
			}
		}
		const without = await withMain(withHeader('max-age=31536000'))
		expect(without.sections.find(s => s.titre === 'Redirections de www et de http')?.constats.join(' ')).toContain(
			'HSTS max-age=31536000, sans includeSubDomains'
		)
		const withSub = await withMain(withHeader('max-age=63072000; includeSubDomains'))
		expect(withSub.sections.find(s => s.titre === 'Redirections de www et de http')?.constats.join(' ')).toContain(
			'HSTS max-age=63072000, avec includeSubDomains'
		)
	})

	test('sur un autre hôte (le banc, l’hôte temporaire), ces deux lectures ne sont pas faites', async () => {
		const { transport, appels: calls } = transportOf(compliantHost())
		const report = await checkHost(settings, withoutWaiting(transport))
		expect(report.sections.map(s => s.titre)).not.toContain('Redirections de www et de http')
		expect(calls.some(({ chemin }) => chemin.includes('controle-redirection'))).toBe(false)
	})

	test('la garde des alias : GET sur www et sur http seulement, et seulement pour le domaine principal', async () => {
		const calls: URL[] = []
		const transport: Transport = async adresse => {
			calls.push(adresse)
			return new Response(null, { status: 301 })
		}
		const read = keepAliases(MAIN, transport)
		await read(WWW)
		await read(PLAIN)
		expect(calls.map(({ href }) => href)).toEqual([WWW, PLAIN])
		await expect(read('https://autre.my-makeup.fr/')).rejects.toThrow(ForbiddenQuery)
		await expect(read('https://www.my-makeup.fr.evil.test/')).rejects.toThrow(ForbiddenQuery)
		await expect(read(WWW, { method: 'POST' })).rejects.toThrow(ForbiddenQuery)
		await expect(read(WWW, { headers: { cookie: 'a=b' } })).rejects.toThrow(ForbiddenQuery)
		await expect(read(`https://www.my-makeup.fr/u/api/send`)).rejects.toThrow(ForbiddenQuery)
		await expect(keepAliases(new URL('https://v3.my-makeup.fr'), transport)(WWW)).rejects.toThrow(ForbiddenQuery)
		await expect(keepAliases(new URL('http://127.0.0.1:3100'), transport)(WWW)).rejects.toThrow(ForbiddenQuery)
		expect(calls).toHaveLength(2)
	})
})
