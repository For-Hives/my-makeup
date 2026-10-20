import { describe, expect, test } from 'bun:test'
import {
	CheckRefused,
	checkHost,
	OLD_ROUTES,
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
	TargetRefused,
	type Transport,
} from '../../scripts/cutover/host-guard'
import { casDuBanc } from '../outils/parite-urls'

/**
 * Ticket 173: the check of a host (scripts/cutover/host-check.ts). No request leaves this machine:
 * the host is played by a fake transport that answers what the frozen table promises. The run on a
 * real host is tests/e2e/controle-hote.spec.ts (I45, U61 to U64).
 */

const SLUG_PROFIL = 'essai-controle-hote'
const JEU = {
	profilsVisibles: [SLUG_PROFIL],
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
	`/profil/${SLUG_PROFIL}`,
	'/talent/essai-talent',
	'/blog/essai-article',
	'/a-propos',
]
	.map(c => `<url><loc>https://my-makeup.fr${c}</loc></url>`)
	.join('')}</urlset>`

type Reponses = Map<string, () => Response>

/** A host that answers what the table promises for the cases of the made-up set. */
function hoteConforme(): Reponses {
	const reponses: Reponses = new Map()
	for (const c of casDuBanc({}, JEU)) {
		const statut = c.statuts[0] ?? 200
		if (c.vers) {
			reponses.set(c.adresse, () => new Response(null, { status: statut, headers: { location: c.vers ?? '' } }))
			if (!reponses.has(c.vers)) reponses.set(c.vers, () => html(c.statutFinal))
		} else if (c.titre === 'non-verifie') reponses.set(c.adresse, () => new Response('x', { status: statut }))
		else reponses.set(c.adresse, () => html(statut))
	}
	reponses.set('/api/health', () => Response.json({ ok: true, version: 'abc1234' }))
	reponses.set('/sitemap.xml', () => new Response(SITEMAP, { headers: { 'content-type': 'application/xml' } }))
	reponses.set(
		'/robots.txt',
		() =>
			new Response('User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://my-makeup.fr/sitemap.xml\n', {
				headers: { 'content-type': 'text/plain' },
			})
	)
	reponses.set(
		'/u/script.js',
		() => new Response('(function(){})()', { headers: { 'content-type': 'text/javascript' } })
	)
	for (const route of OLD_ROUTES) reponses.set(route, () => html(404))
	return reponses
}

function transportDe(reponses: Reponses): {
	transport: Transport
	appels: { methode: string; chemin: string; entetes: Headers }[]
} {
	const appels: { methode: string; chemin: string; entetes: Headers }[] = []
	const transport: Transport = async (adresse, init) => {
		const chemin = adresse.pathname + adresse.search
		appels.push({ methode: String(init.method), chemin, entetes: new Headers(init.headers) })
		return (reponses.get(chemin) ?? (() => html(404)))()
	}
	return { transport, appels }
}

const CIBLE = new URL('https://hote.example.test')
const reglages: Settings = { cible: CIBLE }
const sansAttente = (transport: Transport): Tools => ({
	transport,
	intervalleMs: 0,
	anciens: {},
	maintenant: () => new Date('2026-10-15T10:00:00Z'),
})

describe('la garde : une lecture, sur la cible, et rien d’autre', () => {
	const lire = (chemin: string, init: RequestInit = {}, autorisation?: string) =>
		checkQuery(chemin, init, CIBLE, autorisation)

	test('une écriture est interrompue avant de partir', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
			expect(() => lire('/contact', { method })).toThrow(ForbiddenQuery)
		expect(() => lire('/contact', { body: 'x' })).toThrow(ForbiddenQuery)
	})

	test('sous /u, les quatre adresses de l’inventaire en GET et rien d’autre : la mesure n’est jamais comptée', () => {
		for (const chemin of ['/u', '/u/script.js', '/u/api/send', '/u/autre-chemin'])
			expect(lire(chemin).adresse.pathname).toBe(chemin)
		expect(() => lire('/u/api/send', { method: 'POST' })).toThrow(ForbiddenQuery)
		for (const chemin of [
			'/u/',
			'//u/api/send',
			'/%75/api/send',
			'/u/script.js?x=1',
			'/u/api/send?x=1',
			'/u/api/batch',
		])
			expect(() => lire(chemin)).toThrow(ForbiddenQuery)
	})

	test('un chemin à double barre reste un chemin de la cible, jamais un autre hôte', () => {
		expect(lire('//profil/x').adresse.href).toBe('https://hote.example.test//profil/x')
		expect(() => lire('https://autre.example.test/')).toThrow(ForbiddenQuery)
		expect(() => lire('@autre.example.test/')).toThrow(ForbiddenQuery)
	})

	test('ni cookie ni Authorization de l’appelant', () => {
		expect(() => lire('/', { headers: { cookie: 'a=b' } })).toThrow(ForbiddenQuery)
		expect(() => lire('/', { headers: { Authorization: 'Bearer x' } })).toThrow(ForbiddenQuery)
		expect(lire('/').entetes.get('user-agent')).toBe(CHECK_AGENT)
	})

	test('l’accès protégé ne part que vers l’hôte temporaire, jamais vers le site', () => {
		expect(() => lire('/', {}, 'Basic eA==')).toThrow(ForbiddenQuery)
		expect(() => checkQuery('/', {}, new URL('https://my-makeup.fr'), 'Basic eA==')).toThrow(ForbiddenQuery)
		const temporaire = new URL('https://v3.my-makeup.fr')
		expect(checkQuery('/', {}, temporaire, 'Basic eA==').entetes.get('authorization')).toBe('Basic eA==')
	})

	test('aucune redirection suivie, la méthode est GET', async () => {
		const { transport, appels } = transportDe(new Map())
		let initRecu: RequestInit | undefined
		await keep(CIBLE, async (adresse, init) => {
			initRecu = init
			return transport(adresse, init)
		})('/a-propos')
		expect(initRecu?.redirect).toBe('manual')
		expect(appels[0]?.methode).toBe('GET')
	})

	test('la cible : https, ou http sur ce poste, une origine seule', () => {
		expect(checkTarget('https://my-makeup.fr').href).toBe('https://my-makeup.fr/')
		expect(checkTarget('https://v3.my-makeup.fr').href).toBe('https://v3.my-makeup.fr/')
		expect(checkTarget('http://127.0.0.1:3373').origin).toBe('http://127.0.0.1:3373')
		for (const mauvaise of [
			'http://my-makeup.fr',
			'https://www.my-makeup.fr',
			'https://ancien.my-makeup.fr',
			'ftp://x.test',
			'https://x.test/chemin',
			'https://u:p@x.test',
			'pas une adresse',
		])
			expect(() => checkTarget(mauvaise)).toThrow(TargetRefused)
	})
})

describe('les réglages', () => {
	test('seule la production se lit en ligne : la préprod et tout autre hôte sont refusés', () => {
		for (const hote of ['https://preprod.my-makeup.fr', 'https://x.test', 'https://not-my-makeup.fr'])
			expect(() => readSettings({ HOST_CHECK_TARGET: hote })).toThrow(TargetRefused)
		expect(readSettings({ HOST_CHECK_TARGET: 'https://my-makeup.fr' }).cible.hostname).toBe('my-makeup.fr')
	})

	test('l’accès protégé : facultatif, jamais à moitié, et seulement pour l’hôte temporaire', () => {
		const acces = { HOST_CHECK_ACCESS_USER: 'essai', HOST_CHECK_ACCESS_PASSWORD: 'factice-173' }
		expect(readSettings({ HOST_CHECK_TARGET: 'https://v3.my-makeup.fr' }).autorisation).toBeUndefined()
		expect(readSettings({ HOST_CHECK_TARGET: 'https://v3.my-makeup.fr', ...acces }).autorisation).toBe(
			`Basic ${btoa('essai:factice-173')}`
		)
		expect(() =>
			readSettings({ HOST_CHECK_TARGET: 'https://v3.my-makeup.fr', HOST_CHECK_ACCESS_USER: 'essai' })
		).toThrow(CheckRefused)
		expect(() => readSettings({ HOST_CHECK_TARGET: 'https://my-makeup.fr', ...acces })).toThrow(CheckRefused)
		expect(() => readSettings({ HOST_CHECK_TARGET: 'http://127.0.0.1:3373', ...acces })).toThrow(CheckRefused)
		expect(readSettings({ HOST_CHECK_TARGET: 'http://127.0.0.1:3373' }).autorisation).toBeUndefined()
	})

	test('sans cible : refusé, et le code de sortie est 2 sans une requête', async () => {
		const lignes: string[] = []
		expect(await run({}, l => lignes.push(l))).toBe(2)
		expect(await run({ HOST_CHECK_TARGET: 'http://my-makeup.fr' }, l => lignes.push(l))).toBe(2)
		expect(lignes.join('\n')).toContain('HOST_CHECK_TARGET')
	})
})

describe('la lecture du sitemap', () => {
	test('les chemins, et le jeu de profils, talents et articles', () => {
		const chemins = sitemapAddresses(SITEMAP)
		expect(chemins).toEqual(['/profil/essai-controle-hote', '/talent/essai-talent', '/blog/essai-article', '/a-propos'])
		expect(sitemapSet(chemins)).toEqual({ ...JEU, talents: ['essai-talent'], articlesPublies: ['essai-article'] })
		expect(sitemapSet(['/blog', '/profil/a/b']).articlesPublies).toEqual([])
	})
})

describe('I45 sur un hôte : le rapport', () => {
	test('un hôte conforme : tout est conforme, aucun 5xx, lectures seules', async () => {
		const { transport, appels } = transportDe(hoteConforme())
		const rapport = await checkHost(reglages, sansAttente(transport))
		expect(rapport.defauts).toEqual([])
		expect(rapport.verdict).toBe('conforme')
		expect(rapport.reponses5xx).toBe(0)
		expect(rapport.adresses.enEchec).toBe(0)
		expect(rapport.adresses.controlees).toBeGreaterThan(30)
		expect(rapport.version).toBe('abc1234')
		expect(rapport.date).toBe('2026-10-15T10:00:00.000Z')
		expect(appels.every(({ methode }) => methode === 'GET')).toBe(true)
		// Under /u only GET reads; no cookie anywhere.
		expect(appels.filter(({ chemin }) => chemin.startsWith('/u')).every(({ methode }) => methode === 'GET')).toBe(true)
		expect(appels.some(({ entetes }) => entetes.has('cookie') || entetes.has('authorization'))).toBe(false)
		expect(rapport.sections.map(s => s.titre)).toContain('Script de mesure')
	})

	test('une adresse cassée exprès est détectée, et le rapport la nomme', async () => {
		const reponses = hoteConforme()
		reponses.set('/a-propos', () => new Response('boom', { status: 500, headers: { 'content-type': 'text/html' } }))
		const rapport = await checkHost(reglages, sansAttente(transportDe(reponses).transport))
		expect(rapport.verdict).toBe('non-conforme')
		expect(rapport.adresses.enEchec).toBeGreaterThan(0)
		expect(rapport.reponses5xx).toBeGreaterThan(0)
		expect(rapport.defauts.join('\n')).toContain('/a-propos')
		expect(writeReport(rapport)).toContain('NON CONFORME')
	})

	test('une adresse qui ne répond pas est un défaut, pas un arrêt', async () => {
		const reponses = hoteConforme()
		reponses.set('/contact', () => {
			throw Object.assign(new Error('secret'), { cause: { code: 'ECONNRESET' } })
		})
		const rapport = await checkHost(reglages, sansAttente(transportDe(reponses).transport))
		expect(rapport.verdict).toBe('non-conforme')
		expect(rapport.defauts.join('\n')).toContain('ECONNRESET')
		expect(rapport.defauts.join('\n')).not.toContain('secret')
	})

	test('une ancienne route d’authentification qui répond, le script absent, le robots muet : chacun est un défaut', async () => {
		const reponses = hoteConforme()
		reponses.set('/api/auth/session', () => Response.json({ user: null }))
		reponses.set('/u/script.js', () => new Response('nope', { status: 404 }))
		reponses.set('/robots.txt', () => new Response('rien', { headers: { 'content-type': 'text/plain' } }))
		const rapport = await checkHost(reglages, sansAttente(transportDe(reponses).transport))
		const conformes = Object.fromEntries(rapport.sections.map(s => [s.titre, s.conforme]))
		expect(conformes['Anciennes routes d’authentification']).toBe(false)
		expect(conformes['Script de mesure']).toBe(false)
		expect(conformes['Fichier robots']).toBe(false)
		expect(conformes.Sitemap).toBe(true)
	})

	test('le sitemap : une adresse qu’il liste et qui ne répond plus 200 est un défaut', async () => {
		const reponses = hoteConforme()
		reponses.set('/a-propos', () => html(404))
		const rapport = await checkHost(reglages, sansAttente(transportDe(reponses).transport))
		expect(rapport.verdict).toBe('non-conforme')
	})

	test('le rapport n’écrit jamais l’adresse d’un profil : une empreinte de 8 chiffres, et des nombres', async () => {
		const reponses = hoteConforme()
		reponses.set(`/profil/${SLUG_PROFIL}`, () => html(500))
		const rapport = await checkHost(reglages, sansAttente(transportDe(reponses).transport))
		const texte = `${writeReport(rapport)}\n${JSON.stringify(rapport)}`
		expect(rapport.verdict).toBe('non-conforme')
		expect(texte).toMatch(/profil #[0-9a-f]{8}/)
		expect(texte).not.toContain(SLUG_PROFIL)
	})

	test('l’empreinte des adresses change quand une adresse change d’état', async () => {
		const bon = await checkHost(reglages, sansAttente(transportDe(hoteConforme()).transport))
		const meme = await checkHost(reglages, sansAttente(transportDe(hoteConforme()).transport))
		const reponses = hoteConforme()
		reponses.set('/a-propos', () => html(404))
		const autre = await checkHost(reglages, sansAttente(transportDe(reponses).transport))
		expect(meme.empreinte).toBe(bon.empreinte)
		expect(autre.empreinte).not.toBe(bon.empreinte)
		expect(bon.empreinte).toMatch(/^[0-9a-f]{8}$/)
	})
})

describe('deux requêtes par seconde au plus', () => {
	test('500 ms au moins entre deux départs, sur toute la lecture', async () => {
		let heure = 0
		const { transport } = transportDe(hoteConforme())
		const rapport = await checkHost(reglages, {
			transport: async (adresse, init) => {
				heure += 10
				return transport(adresse, init)
			},
			anciens: {},
			horloge: {
				maintenant: () => heure,
				attendre: async ms => {
					heure += ms
				},
			},
		})
		expect(rapport.requetes).toBeGreaterThan(30)
		expect(rapport.ecartMinimalMs).toBeGreaterThanOrEqual(500)
	})
})
