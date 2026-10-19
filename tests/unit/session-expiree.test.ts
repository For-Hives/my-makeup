import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { EXPIRED_SESSION_MESSAGE, urlMessage } from '@/lib/auth/errors'
import { dashboardDecision } from '@/lib/auth/closed-dashboard'
import {
	classifySession,
	tokenState,
	cookieEndOfLife,
	readExpiration,
	COOKIE_SURVIVAL_AFTER_END_S,
	verifySession,
} from '@/lib/auth/session-state'
import { safeReturnTo, expiredSessionUrl } from '@/lib/auth/return-to'
import { proxy } from '@/proxy'

/** A token shaped like Payload's, signed with nothing: only its end date is ever read here. */
const jeton = (charge: Record<string, unknown>) => {
	const base64url = (valeur: unknown) => Buffer.from(JSON.stringify(valeur)).toString('base64url')
	return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(charge)}.signature`
}
const MAINTENANT = 1_800_000_000

describe('U69 : un jeton expiré est « expirée », distincte d’« anonyme »', () => {
	test('la date de fin se lit dans le jeton, avec ou sans bourrage base64', () => {
		expect(readExpiration(jeton({ exp: MAINTENANT }))).toBe(MAINTENANT)
		// A payload whose base64url form is not a multiple of 4 characters long.
		expect(readExpiration(jeton({ exp: MAINTENANT, a: 'xy' }))).toBe(MAINTENANT)
	})

	test('un jeton passé de la date de fin est « expire », juste avant elle « en-cours »', () => {
		expect(tokenState(jeton({ exp: MAINTENANT - 1 }), MAINTENANT)).toBe('expire')
		expect(tokenState(jeton({ exp: MAINTENANT }), MAINTENANT)).toBe('expire')
		expect(tokenState(jeton({ exp: MAINTENANT + 1 }), MAINTENANT)).toBe('en-cours')
	})

	test('sans jeton, ou avec un jeton qui ne dit rien de sa fin : pas de session, jamais « expirée »', () => {
		for (const brut of [undefined, '']) expect(tokenState(brut, MAINTENANT)).toBe('absent')
		for (const brut of ['pas-un-jeton', 'a.b.c', 'a.b', jeton({ id: 1 }), jeton({ exp: 'demain' })])
			expect(tokenState(brut, MAINTENANT)).toBe('illisible')
	})

	test('l’état de la session sépare expirée et anonyme', () => {
		expect(classifySession('expire')).toBe('expiree')
		expect(classifySession('absent')).toBe('anonyme')
		expect(classifySession('illisible')).toBe('anonyme')
		expect(classifySession('expire')).not.toBe(classifySession('absent'))
	})
})

describe('U70 : une panne ne déconnecte personne, un refus déconnecte', () => {
	test('une vérification qui échoue (réseau, base) laisse la session intacte : indisponible, jamais anonyme', () => {
		expect(classifySession('en-cours', 'panne')).toBe('indisponible')
		expect(classifySession('en-cours')).toBe('indisponible')
	})

	test('un refus (401) est une déconnexion, une acceptation est une session', () => {
		expect(classifySession('en-cours', 'refusee')).toBe('anonyme')
		expect(classifySession('en-cours', 'acceptee')).toBe('connectee')
	})

	test('un jeton arrivé à sa fin est « expirée » sans rien demander à la base', () => {
		expect(classifySession('expire', 'panne')).toBe('expiree')
	})
})

describe('la porte de l’espace et la date de fin du cookie', () => {
	test('un cookie expiré : une redirection avec le message et le retour', () => {
		const vers = dashboardDecision('/auth/profil', '?a=1', jeton({ exp: MAINTENANT - 60 }), MAINTENANT)
		expect(vers).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fa%3D1&error=session-expiree')
	})

	test('sans cookie : la connexion sans message ; un cookie en cours : la page décide', () => {
		expect(dashboardDecision('/auth/profil', '', undefined, MAINTENANT)).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil'
		)
		expect(dashboardDecision('/auth/profil', '', jeton({ exp: MAINTENANT + 60 }), MAINTENANT)).toBeNull()
		expect(dashboardDecision('/auth/profil', '', 'pas-un-jeton', MAINTENANT)).toBeNull()
	})

	test('121 : une sauvegarde (POST) n’est jamais redirigée, cookie expiré ou absent : l’action répond elle-même', () => {
		const expire = jeton({ exp: MAINTENANT - 60 })
		for (const methode of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			expect(dashboardDecision('/auth/profil', '', expire, MAINTENANT, methode)).toBeNull()
			expect(dashboardDecision('/auth/profil', '', undefined, MAINTENANT, methode)).toBeNull()
		}
		expect(dashboardDecision('/auth/profil', '', expire, MAINTENANT, 'GET')).not.toBeNull()
		expect(dashboardDecision('/auth/profil', '', expire, MAINTENANT, 'HEAD')).not.toBeNull()
	})

	test('121 : le proxy laisse passer le POST d’une session expirée', () => {
		const expire = jeton({ exp: Math.floor(Date.now() / 1000) - 60 })
		const reponse = proxy(
			new NextRequest('http://localhost:3280/auth/profil', {
				method: 'POST',
				headers: { cookie: `payload-token=${expire}` },
			})
		)
		expect(reponse.status).toBe(200)
		expect(reponse.headers.get('location')).toBeNull()
	})

	test('la page de connexion, avec un cookie expiré, n’est jamais renvoyée : pas de boucle', () => {
		for (const chemin of ['/auth/signin', '/auth/signup', '/', '/api/pros/me'])
			expect(dashboardDecision(chemin, '', jeton({ exp: MAINTENANT - 60 }), MAINTENANT)).toBeNull()
	})

	test('l’adresse du message garde un retour sûr, et la page de connexion n’est pas un retour', () => {
		const adresse = expiredSessionUrl('/auth/profil?x=1')
		const url = new URL(adresse, 'https://my-makeup.fr')
		expect(safeReturnTo(url.searchParams.get('callbackUrl'), 'https://my-makeup.fr')).toBe('/auth/profil?x=1')
		expect(safeReturnTo(expiredSessionUrl('/auth/signin'), 'https://my-makeup.fr')).toBe('/auth/profil')
	})

	test('le proxy : 307 unique vers la connexion, avec le message et le retour', () => {
		const expire = jeton({ exp: Math.floor(Date.now() / 1000) - 60 })
		const reponse = proxy(
			new NextRequest('http://localhost:3280/auth/profil', { headers: { cookie: `payload-token=${expire}` } })
		)

		expect(reponse.status).toBe(307)
		const cible = new URL(reponse.headers.get('location') ?? '')
		expect(cible.pathname).toBe('/auth/signin')
		expect(cible.searchParams.get('error')).toBe('session-expiree')
		expect(cible.searchParams.get('callbackUrl')).toBe('/auth/profil')
		// Left alone on purpose (see decisionDeLEspace).
		expect(reponse.headers.get('set-cookie')).toBeNull()
	})

	test('le proxy : un cookie en cours ne reçoit aucune redirection', () => {
		const enCours = jeton({ exp: Math.floor(Date.now() / 1000) + 3600 })
		const reponse = proxy(
			new NextRequest('http://localhost:3280/auth/profil', { headers: { cookie: `payload-token=${enCours}` } })
		)
		expect(reponse.headers.get('location')).toBeNull()
		expect(reponse.headers.get('set-cookie')).toBeNull()
	})
})

describe('un code d’erreur inconnu n’est jamais recopié à l’écran', () => {
	test('seul « session-expiree » donne un message, et c’est celui de la table', () => {
		expect(urlMessage('session-expiree')).toBe(EXPIRED_SESSION_MESSAGE)
		expect(urlMessage(['session-expiree', 'autre'])).toBe(EXPIRED_SESSION_MESSAGE)
	})

	test('tout autre code, du texte ou du HTML : rien', () => {
		for (const brut of [
			undefined,
			'',
			'OAuthCallback',
			'Session-Expiree',
			'<script>alert(1)</script>',
			'Ton compte est piraté, appelle le 0 800 000 000',
			['autre', 'session-expiree'],
			42,
			null,
		])
			expect(urlMessage(brut)).toBeNull()
	})
})

describe('U70 : la décision panne ou refus, avec ses dépendances simulées', () => {
	const ok = async () => undefined
	const casse = async () => {
		throw new Error('connexion perdue')
	}

	test('un utilisateur accepté par Payload : session acceptée, sans sonder la base', async () => {
		let sondee = false
		const r = await verifySession({
			authentifier: async () => ({ id: 1 }),
			convient: () => true,
			sonder: async () => {
				sondee = true
			},
		})
		expect(r).toEqual({ verification: 'acceptee', utilisateur: { id: 1 } })
		expect(sondee).toBe(false)
	})

	test('pas d’utilisateur et la base répond : refus (déconnexion)', async () => {
		const r = await verifySession({ authentifier: async () => null, convient: () => true, sonder: ok })
		expect(r).toEqual({ verification: 'refusee' })
	})

	test('pas d’utilisateur et la base ne répond pas : panne, jamais refus', async () => {
		const r = await verifySession({ authentifier: async () => null, convient: () => true, sonder: casse })
		expect(r).toEqual({ verification: 'panne' })
	})

	test('Payload lui-même qui échoue : panne', async () => {
		const r = await verifySession({ authentifier: casse as () => Promise<null>, convient: () => true, sonder: ok })
		expect(r).toEqual({ verification: 'panne' })
	})

	test('un utilisateur d’une autre collection (jeton d’admin) : refus', async () => {
		const r = await verifySession({ authentifier: async () => ({ id: 1 }), convient: () => false, sonder: ok })
		expect(r).toEqual({ verification: 'refusee' })
	})
})

describe('le cookie survit à son jeton', () => {
	test('sa date de fin est celle du jeton plus 90 jours, jamais moins', () => {
		expect(cookieEndOfLife(MAINTENANT).getTime()).toBe((MAINTENANT + 90 * 86_400) * 1000)
		expect(COOKIE_SURVIVAL_AFTER_END_S).toBe(90 * 86_400)
		expect(cookieEndOfLife(MAINTENANT).getTime()).toBeGreaterThan(MAINTENANT * 1000)
	})
})
