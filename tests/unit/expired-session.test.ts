import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { dashboardDecision } from '@/lib/auth/closed-dashboard'
import { EXPIRED_SESSION_MESSAGE, urlMessage } from '@/lib/auth/errors'
import { expiredSessionUrl, safeReturnTo } from '@/lib/auth/return-to'
import {
	COOKIE_SURVIVAL_AFTER_END_S,
	classifySession,
	cookieEndOfLife,
	readExpiration,
	tokenState,
	verifySession,
} from '@/lib/auth/session-state'
import { proxy } from '@/proxy'

/** A token shaped like Payload's, signed with nothing: only its end date is ever read here. */
const token = (charge: Record<string, unknown>) => {
	const base64url = (valeur: unknown) => Buffer.from(JSON.stringify(valeur)).toString('base64url')
	return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(charge)}.signature`
}
const NOW = 1_800_000_000

describe('U69 : un jeton expiré est « expirée », distincte d’« anonyme »', () => {
	test('la date de fin se lit dans le jeton, avec ou sans bourrage base64', () => {
		expect(readExpiration(token({ exp: NOW }))).toBe(NOW)
		// A payload whose base64url form is not a multiple of 4 characters long.
		expect(readExpiration(token({ exp: NOW, a: 'xy' }))).toBe(NOW)
	})

	test('un jeton passé de la date de fin est « expire », juste avant elle « en-cours »', () => {
		expect(tokenState(token({ exp: NOW - 1 }), NOW)).toBe('expire')
		expect(tokenState(token({ exp: NOW }), NOW)).toBe('expire')
		expect(tokenState(token({ exp: NOW + 1 }), NOW)).toBe('en-cours')
	})

	test('sans jeton, ou avec un jeton qui ne dit rien de sa fin : pas de session, jamais « expirée »', () => {
		for (const raw of [undefined, '']) expect(tokenState(raw, NOW)).toBe('absent')
		for (const raw of ['pas-un-jeton', 'a.b.c', 'a.b', token({ id: 1 }), token({ exp: 'demain' })])
			expect(tokenState(raw, NOW)).toBe('illisible')
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
		const to = dashboardDecision('/auth/profil', '?a=1', token({ exp: NOW - 60 }), NOW)
		expect(to).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fa%3D1&error=session-expiree')
	})

	test('sans cookie : la connexion sans message ; un cookie en cours : la page décide', () => {
		expect(dashboardDecision('/auth/profil', '', undefined, NOW)).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil')
		expect(dashboardDecision('/auth/profil', '', token({ exp: NOW + 60 }), NOW)).toBeNull()
		expect(dashboardDecision('/auth/profil', '', 'pas-un-jeton', NOW)).toBeNull()
	})

	test('121 : une sauvegarde (POST) n’est jamais redirigée, cookie expiré ou absent : l’action répond elle-même', () => {
		const expired = token({ exp: NOW - 60 })
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			expect(dashboardDecision('/auth/profil', '', expired, NOW, method)).toBeNull()
			expect(dashboardDecision('/auth/profil', '', undefined, NOW, method)).toBeNull()
		}
		expect(dashboardDecision('/auth/profil', '', expired, NOW, 'GET')).not.toBeNull()
		expect(dashboardDecision('/auth/profil', '', expired, NOW, 'HEAD')).not.toBeNull()
	})

	test('121 : le proxy laisse passer le POST d’une session expirée', () => {
		const expired = token({ exp: Math.floor(Date.now() / 1000) - 60 })
		const response = proxy(
			new NextRequest('http://localhost:3280/auth/profil', {
				method: 'POST',
				headers: { cookie: `payload-token=${expired}` },
			})
		)
		expect(response.status).toBe(200)
		expect(response.headers.get('location')).toBeNull()
	})

	test('la page de connexion, avec un cookie expiré, n’est jamais renvoyée : pas de boucle', () => {
		for (const filePath of ['/auth/signin', '/auth/signup', '/', '/api/pros/me'])
			expect(dashboardDecision(filePath, '', token({ exp: NOW - 60 }), NOW)).toBeNull()
	})

	test('l’adresse du message garde un retour sûr, et la page de connexion n’est pas un retour', () => {
		const address = expiredSessionUrl('/auth/profil?x=1')
		const url = new URL(address, 'https://my-makeup.fr')
		expect(safeReturnTo(url.searchParams.get('callbackUrl'), 'https://my-makeup.fr')).toBe('/auth/profil?x=1')
		expect(safeReturnTo(expiredSessionUrl('/auth/signin'), 'https://my-makeup.fr')).toBe('/auth/profil')
	})

	test('le proxy : 307 unique vers la connexion, avec le message et le retour', () => {
		const expired = token({ exp: Math.floor(Date.now() / 1000) - 60 })
		const response = proxy(
			new NextRequest('http://localhost:3280/auth/profil', { headers: { cookie: `payload-token=${expired}` } })
		)

		expect(response.status).toBe(307)
		const target = new URL(response.headers.get('location') ?? '')
		expect(target.pathname).toBe('/auth/signin')
		expect(target.searchParams.get('error')).toBe('session-expiree')
		expect(target.searchParams.get('callbackUrl')).toBe('/auth/profil')
		// Left alone on purpose (see decisionDeLEspace).
		expect(response.headers.get('set-cookie')).toBeNull()
	})

	test('le proxy : un cookie en cours ne reçoit aucune redirection', () => {
		const inCourse = token({ exp: Math.floor(Date.now() / 1000) + 3600 })
		const response = proxy(
			new NextRequest('http://localhost:3280/auth/profil', { headers: { cookie: `payload-token=${inCourse}` } })
		)
		expect(response.headers.get('location')).toBeNull()
		expect(response.headers.get('set-cookie')).toBeNull()
	})
})

describe('un code d’erreur inconnu n’est jamais recopié à l’écran', () => {
	test('seul « session-expiree » donne un message, et c’est celui de la table', () => {
		expect(urlMessage('session-expiree')).toBe(EXPIRED_SESSION_MESSAGE)
		expect(urlMessage(['session-expiree', 'autre'])).toBe(EXPIRED_SESSION_MESSAGE)
	})

	test('tout autre code, du texte ou du HTML : rien', () => {
		for (const raw of [
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
			expect(urlMessage(raw)).toBeNull()
	})
})

describe('U70 : la décision panne ou refus, avec ses dépendances simulées', () => {
	const ok = async () => undefined
	const broken = async () => {
		throw new Error('connexion perdue')
	}

	test('un utilisateur accepté par Payload : session acceptée, sans sonder la base', async () => {
		let probed = false
		const r = await verifySession({
			authentifier: async () => ({ id: 1 }),
			convient: () => true,
			sonder: async () => {
				probed = true
			},
		})
		expect(r).toEqual({ verification: 'acceptee', utilisateur: { id: 1 } })
		expect(probed).toBe(false)
	})

	test('pas d’utilisateur et la base répond : refus (déconnexion)', async () => {
		const r = await verifySession({ authentifier: async () => null, convient: () => true, sonder: ok })
		expect(r).toEqual({ verification: 'refusee' })
	})

	test('pas d’utilisateur et la base ne répond pas : panne, jamais refus', async () => {
		const r = await verifySession({ authentifier: async () => null, convient: () => true, sonder: broken })
		expect(r).toEqual({ verification: 'panne' })
	})

	test('Payload lui-même qui échoue : panne', async () => {
		const r = await verifySession({ authentifier: broken as () => Promise<null>, convient: () => true, sonder: ok })
		expect(r).toEqual({ verification: 'panne' })
	})

	test('un utilisateur d’une autre collection (jeton d’admin) : refus', async () => {
		const r = await verifySession({ authentifier: async () => ({ id: 1 }), convient: () => false, sonder: ok })
		expect(r).toEqual({ verification: 'refusee' })
	})
})

describe('le cookie survit à son jeton', () => {
	test('sa date de fin est celle du jeton plus 90 jours, jamais moins', () => {
		expect(cookieEndOfLife(NOW).getTime()).toBe((NOW + 90 * 86_400) * 1000)
		expect(COOKIE_SURVIVAL_AFTER_END_S).toBe(90 * 86_400)
		expect(cookieEndOfLife(NOW).getTime()).toBeGreaterThan(NOW * 1000)
	})
})
