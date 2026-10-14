import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { MESSAGE_SESSION_EXPIREE, messageDeLUrl } from '@/lib/auth/erreurs'
import { decisionDeLEspace } from '@/lib/auth/espace-ferme'
import {
	classerLaSession,
	etatDuJeton,
	finDeVieDuCookie,
	lireExpiration,
	SURVIE_DU_COOKIE_APRES_FIN_S,
	verifierUneSession,
} from '@/lib/auth/etat-session'
import { retourSur, urlSessionExpiree } from '@/lib/auth/retour'
import { proxy } from '@/proxy'

/** A token shaped like Payload's, signed with nothing: only its end date is ever read here. */
const jeton = (charge: Record<string, unknown>) => {
	const base64url = (valeur: unknown) => Buffer.from(JSON.stringify(valeur)).toString('base64url')
	return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(charge)}.signature`
}
const MAINTENANT = 1_800_000_000

describe('U69 : un jeton expiré est « expirée », distincte d’« anonyme »', () => {
	test('la date de fin se lit dans le jeton, avec ou sans bourrage base64', () => {
		expect(lireExpiration(jeton({ exp: MAINTENANT }))).toBe(MAINTENANT)
		// A payload whose base64url form is not a multiple of 4 characters long.
		expect(lireExpiration(jeton({ exp: MAINTENANT, a: 'xy' }))).toBe(MAINTENANT)
	})

	test('un jeton passé de la date de fin est « expire », juste avant elle « en-cours »', () => {
		expect(etatDuJeton(jeton({ exp: MAINTENANT - 1 }), MAINTENANT)).toBe('expire')
		expect(etatDuJeton(jeton({ exp: MAINTENANT }), MAINTENANT)).toBe('expire')
		expect(etatDuJeton(jeton({ exp: MAINTENANT + 1 }), MAINTENANT)).toBe('en-cours')
	})

	test('sans jeton, ou avec un jeton qui ne dit rien de sa fin : pas de session, jamais « expirée »', () => {
		for (const brut of [undefined, '']) expect(etatDuJeton(brut, MAINTENANT)).toBe('absent')
		for (const brut of ['pas-un-jeton', 'a.b.c', 'a.b', jeton({ id: 1 }), jeton({ exp: 'demain' })])
			expect(etatDuJeton(brut, MAINTENANT)).toBe('illisible')
	})

	test('l’état de la session sépare expirée et anonyme', () => {
		expect(classerLaSession('expire')).toBe('expiree')
		expect(classerLaSession('absent')).toBe('anonyme')
		expect(classerLaSession('illisible')).toBe('anonyme')
		expect(classerLaSession('expire')).not.toBe(classerLaSession('absent'))
	})
})

describe('U70 : une panne ne déconnecte personne, un refus déconnecte', () => {
	test('une vérification qui échoue (réseau, base) laisse la session intacte : indisponible, jamais anonyme', () => {
		expect(classerLaSession('en-cours', 'panne')).toBe('indisponible')
		expect(classerLaSession('en-cours')).toBe('indisponible')
	})

	test('un refus (401) est une déconnexion, une acceptation est une session', () => {
		expect(classerLaSession('en-cours', 'refusee')).toBe('anonyme')
		expect(classerLaSession('en-cours', 'acceptee')).toBe('connectee')
	})

	test('un jeton arrivé à sa fin est « expirée » sans rien demander à la base', () => {
		expect(classerLaSession('expire', 'panne')).toBe('expiree')
	})
})

describe('la porte de l’espace et la date de fin du cookie', () => {
	test('un cookie expiré : une redirection avec le message et le retour', () => {
		const vers = decisionDeLEspace('/auth/profil', '?a=1', jeton({ exp: MAINTENANT - 60 }), MAINTENANT)
		expect(vers).toBe('/auth/signin?callbackUrl=%2Fauth%2Fprofil%3Fa%3D1&error=session-expiree')
	})

	test('sans cookie : la connexion sans message ; un cookie en cours : la page décide', () => {
		expect(decisionDeLEspace('/auth/profil', '', undefined, MAINTENANT)).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil'
		)
		expect(decisionDeLEspace('/auth/profil', '', jeton({ exp: MAINTENANT + 60 }), MAINTENANT)).toBeNull()
		expect(decisionDeLEspace('/auth/profil', '', 'pas-un-jeton', MAINTENANT)).toBeNull()
	})

	test('la page de connexion, avec un cookie expiré, n’est jamais renvoyée : pas de boucle', () => {
		for (const chemin of ['/auth/signin', '/auth/signup', '/', '/api/pros/me'])
			expect(decisionDeLEspace(chemin, '', jeton({ exp: MAINTENANT - 60 }), MAINTENANT)).toBeNull()
	})

	test('l’adresse du message garde un retour sûr, et la page de connexion n’est pas un retour', () => {
		const adresse = urlSessionExpiree('/auth/profil?x=1')
		const url = new URL(adresse, 'https://my-makeup.fr')
		expect(retourSur(url.searchParams.get('callbackUrl'), 'https://my-makeup.fr')).toBe('/auth/profil?x=1')
		expect(retourSur(urlSessionExpiree('/auth/signin'), 'https://my-makeup.fr')).toBe('/auth/profil')
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
		expect(messageDeLUrl('session-expiree')).toBe(MESSAGE_SESSION_EXPIREE)
		expect(messageDeLUrl(['session-expiree', 'autre'])).toBe(MESSAGE_SESSION_EXPIREE)
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
			expect(messageDeLUrl(brut)).toBeNull()
	})
})

describe('U70 : la décision panne ou refus, avec ses dépendances simulées', () => {
	const ok = async () => undefined
	const casse = async () => {
		throw new Error('connexion perdue')
	}

	test('un utilisateur accepté par Payload : session acceptée, sans sonder la base', async () => {
		let sondee = false
		const r = await verifierUneSession({
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
		const r = await verifierUneSession({ authentifier: async () => null, convient: () => true, sonder: ok })
		expect(r).toEqual({ verification: 'refusee' })
	})

	test('pas d’utilisateur et la base ne répond pas : panne, jamais refus', async () => {
		const r = await verifierUneSession({ authentifier: async () => null, convient: () => true, sonder: casse })
		expect(r).toEqual({ verification: 'panne' })
	})

	test('Payload lui-même qui échoue : panne', async () => {
		const r = await verifierUneSession({ authentifier: casse as () => Promise<null>, convient: () => true, sonder: ok })
		expect(r).toEqual({ verification: 'panne' })
	})

	test('un utilisateur d’une autre collection (jeton d’admin) : refus', async () => {
		const r = await verifierUneSession({ authentifier: async () => ({ id: 1 }), convient: () => false, sonder: ok })
		expect(r).toEqual({ verification: 'refusee' })
	})
})

describe('le cookie survit à son jeton', () => {
	test('sa date de fin est celle du jeton plus 90 jours, jamais moins', () => {
		expect(finDeVieDuCookie(MAINTENANT).getTime()).toBe((MAINTENANT + 90 * 86_400) * 1000)
		expect(SURVIE_DU_COOKIE_APRES_FIN_S).toBe(90 * 86_400)
		expect(finDeVieDuCookie(MAINTENANT).getTime()).toBeGreaterThan(MAINTENANT * 1000)
	})
})
