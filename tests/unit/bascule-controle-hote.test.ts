import { describe, expect, test } from 'bun:test'
import {
	ANCIENNES_ROUTES,
	adressesDuSitemap,
	ControleRefuse,
	controlerLHote,
	ecrireLeRapport,
	jeuDuSitemap,
	lancer,
	lireLesReglages,
	type Outils,
	type Reglages,
} from '../../scripts/bascule/controle-hote'
import {
	AGENT_DU_CONTROLE,
	CibleRefusee,
	cibleDuControle,
	controlerRequete,
	garder,
	RequeteInterdite,
	type Transport,
} from '../../scripts/bascule/garde-hote'
import { casDuBanc } from '../outils/parite-urls'

/**
 * Ticket 173: the check of a host (scripts/bascule/controle-hote.ts). No request leaves this machine:
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
	for (const route of ANCIENNES_ROUTES) reponses.set(route, () => html(404))
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
const reglages: Reglages = { cible: CIBLE }
const sansAttente = (transport: Transport): Outils => ({
	transport,
	intervalleMs: 0,
	anciens: {},
	maintenant: () => new Date('2026-10-15T10:00:00Z'),
})

describe('la garde : une lecture, sur la cible, et rien d’autre', () => {
	const lire = (chemin: string, init: RequestInit = {}, autorisation?: string) =>
		controlerRequete(chemin, init, CIBLE, autorisation)

	test('une écriture est interrompue avant de partir', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
			expect(() => lire('/contact', { method })).toThrow(RequeteInterdite)
		expect(() => lire('/contact', { body: 'x' })).toThrow(RequeteInterdite)
	})

	test('sous /u, les quatre adresses de l’inventaire en GET et rien d’autre : la mesure n’est jamais comptée', () => {
		for (const chemin of ['/u', '/u/script.js', '/u/api/send', '/u/autre-chemin'])
			expect(lire(chemin).adresse.pathname).toBe(chemin)
		expect(() => lire('/u/api/send', { method: 'POST' })).toThrow(RequeteInterdite)
		for (const chemin of [
			'/u/',
			'//u/api/send',
			'/%75/api/send',
			'/u/script.js?x=1',
			'/u/api/send?x=1',
			'/u/api/batch',
		])
			expect(() => lire(chemin)).toThrow(RequeteInterdite)
	})

	test('un chemin à double barre reste un chemin de la cible, jamais un autre hôte', () => {
		expect(lire('//profil/x').adresse.href).toBe('https://hote.example.test//profil/x')
		expect(() => lire('https://autre.example.test/')).toThrow(RequeteInterdite)
		expect(() => lire('@autre.example.test/')).toThrow(RequeteInterdite)
	})

	test('ni cookie ni Authorization de l’appelant', () => {
		expect(() => lire('/', { headers: { cookie: 'a=b' } })).toThrow(RequeteInterdite)
		expect(() => lire('/', { headers: { Authorization: 'Bearer x' } })).toThrow(RequeteInterdite)
		expect(lire('/').entetes.get('user-agent')).toBe(AGENT_DU_CONTROLE)
	})

	test('l’accès protégé ne part que vers la préprod', () => {
		expect(() => lire('/', {}, 'Basic eA==')).toThrow(RequeteInterdite)
		const preprod = new URL('https://preprod.my-makeup.fr')
		expect(controlerRequete('/', {}, preprod, 'Basic eA==').entetes.get('authorization')).toBe('Basic eA==')
	})

	test('aucune redirection suivie, la méthode est GET', async () => {
		const { transport, appels } = transportDe(new Map())
		let initRecu: RequestInit | undefined
		await garder(CIBLE, async (adresse, init) => {
			initRecu = init
			return transport(adresse, init)
		})('/a-propos')
		expect(initRecu?.redirect).toBe('manual')
		expect(appels[0]?.methode).toBe('GET')
	})

	test('la cible : https, ou http sur ce poste, une origine seule', () => {
		expect(cibleDuControle('https://preprod.my-makeup.fr').href).toBe('https://preprod.my-makeup.fr/')
		expect(cibleDuControle('http://127.0.0.1:3373').origin).toBe('http://127.0.0.1:3373')
		for (const mauvaise of [
			'http://my-makeup.fr',
			'ftp://x.test',
			'https://x.test/chemin',
			'https://u:p@x.test',
			'pas une adresse',
		])
			expect(() => cibleDuControle(mauvaise)).toThrow(CibleRefusee)
	})
})

describe('les réglages', () => {
	test('la préprod demande son accès protégé, un autre hôte non', () => {
		expect(() => lireLesReglages({ CONTROLE_HOTE_CIBLE: 'https://preprod.my-makeup.fr' })).toThrow(ControleRefuse)
		const lus = lireLesReglages({
			CONTROLE_HOTE_CIBLE: 'https://preprod.my-makeup.fr',
			PREPROD_BASIC_AUTH_USER: 'preprod',
			PREPROD_BASIC_AUTH_PASSWORD: 'factice-173',
		})
		expect(lus.autorisation).toBe(`Basic ${btoa('preprod:factice-173')}`)
		expect(lireLesReglages({ CONTROLE_HOTE_CIBLE: 'http://127.0.0.1:3373' }).autorisation).toBeUndefined()
	})

	test('sans cible : refusé, et le code de sortie est 2 sans une requête', async () => {
		const lignes: string[] = []
		expect(await lancer({}, l => lignes.push(l))).toBe(2)
		expect(await lancer({ CONTROLE_HOTE_CIBLE: 'http://my-makeup.fr' }, l => lignes.push(l))).toBe(2)
		expect(lignes.join('\n')).toContain('CONTROLE_HOTE_CIBLE')
	})
})

describe('la lecture du sitemap', () => {
	test('les chemins, et le jeu de profils, talents et articles', () => {
		const chemins = adressesDuSitemap(SITEMAP)
		expect(chemins).toEqual(['/profil/essai-controle-hote', '/talent/essai-talent', '/blog/essai-article', '/a-propos'])
		expect(jeuDuSitemap(chemins)).toEqual({ ...JEU, talents: ['essai-talent'], articlesPublies: ['essai-article'] })
		expect(jeuDuSitemap(['/blog', '/profil/a/b']).articlesPublies).toEqual([])
	})
})

describe('I45 sur un hôte : le rapport', () => {
	test('un hôte conforme : tout est conforme, aucun 5xx, lectures seules', async () => {
		const { transport, appels } = transportDe(hoteConforme())
		const rapport = await controlerLHote(reglages, sansAttente(transport))
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
		const rapport = await controlerLHote(reglages, sansAttente(transportDe(reponses).transport))
		expect(rapport.verdict).toBe('non-conforme')
		expect(rapport.adresses.enEchec).toBeGreaterThan(0)
		expect(rapport.reponses5xx).toBeGreaterThan(0)
		expect(rapport.defauts.join('\n')).toContain('/a-propos')
		expect(ecrireLeRapport(rapport)).toContain('NON CONFORME')
	})

	test('une adresse qui ne répond pas est un défaut, pas un arrêt', async () => {
		const reponses = hoteConforme()
		reponses.set('/contact', () => {
			throw Object.assign(new Error('secret'), { cause: { code: 'ECONNRESET' } })
		})
		const rapport = await controlerLHote(reglages, sansAttente(transportDe(reponses).transport))
		expect(rapport.verdict).toBe('non-conforme')
		expect(rapport.defauts.join('\n')).toContain('ECONNRESET')
		expect(rapport.defauts.join('\n')).not.toContain('secret')
	})

	test('une ancienne route d’authentification qui répond, le script absent, le robots muet : chacun est un défaut', async () => {
		const reponses = hoteConforme()
		reponses.set('/api/auth/session', () => Response.json({ user: null }))
		reponses.set('/u/script.js', () => new Response('nope', { status: 404 }))
		reponses.set('/robots.txt', () => new Response('rien', { headers: { 'content-type': 'text/plain' } }))
		const rapport = await controlerLHote(reglages, sansAttente(transportDe(reponses).transport))
		const conformes = Object.fromEntries(rapport.sections.map(s => [s.titre, s.conforme]))
		expect(conformes['Anciennes routes d’authentification']).toBe(false)
		expect(conformes['Script de mesure']).toBe(false)
		expect(conformes['Fichier robots']).toBe(false)
		expect(conformes.Sitemap).toBe(true)
	})

	test('le sitemap : une adresse qu’il liste et qui ne répond plus 200 est un défaut', async () => {
		const reponses = hoteConforme()
		reponses.set('/a-propos', () => html(404))
		const rapport = await controlerLHote(reglages, sansAttente(transportDe(reponses).transport))
		expect(rapport.verdict).toBe('non-conforme')
	})

	test('le rapport n’écrit jamais l’adresse d’un profil : une empreinte de 8 chiffres, et des nombres', async () => {
		const reponses = hoteConforme()
		reponses.set(`/profil/${SLUG_PROFIL}`, () => html(500))
		const rapport = await controlerLHote(reglages, sansAttente(transportDe(reponses).transport))
		const texte = `${ecrireLeRapport(rapport)}\n${JSON.stringify(rapport)}`
		expect(rapport.verdict).toBe('non-conforme')
		expect(texte).toMatch(/profil #[0-9a-f]{8}/)
		expect(texte).not.toContain(SLUG_PROFIL)
	})

	test('l’empreinte des adresses change quand une adresse change d’état', async () => {
		const bon = await controlerLHote(reglages, sansAttente(transportDe(hoteConforme()).transport))
		const meme = await controlerLHote(reglages, sansAttente(transportDe(hoteConforme()).transport))
		const reponses = hoteConforme()
		reponses.set('/a-propos', () => html(404))
		const autre = await controlerLHote(reglages, sansAttente(transportDe(reponses).transport))
		expect(meme.empreinte).toBe(bon.empreinte)
		expect(autre.empreinte).not.toBe(bon.empreinte)
		expect(bon.empreinte).toMatch(/^[0-9a-f]{8}$/)
	})
})

describe('deux requêtes par seconde au plus', () => {
	test('500 ms au moins entre deux départs, sur toute la lecture', async () => {
		let heure = 0
		const { transport } = transportDe(hoteConforme())
		const rapport = await controlerLHote(reglages, {
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
