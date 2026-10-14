import { describe, expect, test } from 'bun:test'
import { RafraichirSession } from '@/components/espace/RafraichirSession'
import { creerProlongement, ROUTE_DE_PROLONGEMENT } from '@/lib/auth/prolonger'
import {
	DUREE_SESSION_S,
	doitProlonger,
	dureeDuProlongement,
	expirationDuJeton,
	ouverteLe,
	PLAFOND_DE_SESSION_S,
	plafondAtteint,
	SEUIL_DE_PROLONGEMENT_S,
} from '@/lib/auth/session-glissante'
import { ouvrirFenetre } from '../outils/dom-react'

const JOUR = 86_400
const T0 = Date.UTC(2026, 0, 1)

describe('U67 : un rafraîchissement quand il reste moins de 7 jours', () => {
	test('les valeurs du plan : 14 jours, seuil de 7, plafond de 90', () => {
		expect(DUREE_SESSION_S).toBe(14 * JOUR)
		expect(SEUIL_DE_PROLONGEMENT_S).toBe(7 * JOUR)
		expect(PLAFOND_DE_SESSION_S).toBe(90 * JOUR)
	})
	test('il reste 6 jours : oui ; 7 jours pile : non ; 13 jours : non ; échue : oui', () => {
		const maintenant = 1_000_000
		expect(doitProlonger(maintenant + 6 * JOUR, maintenant)).toBe(true)
		expect(doitProlonger(maintenant + 7 * JOUR - 1, maintenant)).toBe(true)
		expect(doitProlonger(maintenant + 7 * JOUR, maintenant)).toBe(false)
		expect(doitProlonger(maintenant + 13 * JOUR, maintenant)).toBe(false)
		expect(doitProlonger(maintenant - 1, maintenant)).toBe(true)
	})
})

describe('U68 : refus au-delà de 90 jours depuis l’ouverture de la session', () => {
	test('89 jours : permis ; 90 jours : refusé ; 91 jours : refusé', () => {
		expect(plafondAtteint(T0, T0 + 89 * JOUR * 1000)).toBe(false)
		expect(plafondAtteint(T0, T0 + 90 * JOUR * 1000 - 1000)).toBe(false)
		expect(plafondAtteint(T0, T0 + 90 * JOUR * 1000)).toBe(true)
		expect(plafondAtteint(T0, T0 + 91 * JOUR * 1000)).toBe(true)
	})
	test('un prolongement dure 14 jours, moins près du plafond, jamais au-delà', () => {
		expect(dureeDuProlongement(T0, T0 + 13 * JOUR * 1000)).toBe(14 * JOUR)
		expect(dureeDuProlongement(T0, T0 + 76 * JOUR * 1000)).toBe(14 * JOUR)
		expect(dureeDuProlongement(T0, T0 + 80 * JOUR * 1000)).toBe(10 * JOUR)
		expect(dureeDuProlongement(T0, T0 + 89 * JOUR * 1000)).toBe(JOUR)
	})
})

describe('lecture du jeton et de la session', () => {
	const jeton = (charge: unknown) => `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.signature`
	test('l’expiration vient de la charge du jeton ; tout le reste donne rien', () => {
		expect(expirationDuJeton(jeton({ exp: 1234 }))).toBe(1234)
		expect(expirationDuJeton(jeton({ exp: '1234' }))).toBeNull()
		expect(expirationDuJeton(jeton({}))).toBeNull()
		expect(expirationDuJeton('pas-un-jeton')).toBeNull()
		expect(expirationDuJeton('a.@@@.c')).toBeNull()
		expect(expirationDuJeton(undefined)).toBeNull()
	})
	test('l’ouverture d’une session se retrouve par son identifiant', () => {
		const sessions = [
			{ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
			{ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' },
		]
		expect(ouverteLe(sessions, 'b')).toBe(Date.UTC(2026, 1, 1))
		expect(ouverteLe(sessions, 'c')).toBeNull()
		expect(ouverteLe(undefined, 'a')).toBeNull()
		expect(ouverteLe(sessions, undefined)).toBeNull()
	})
})

describe('au plus un prolongement par visite', () => {
	const maintenantMs = () => 1_000_000_000
	const maintenantS = Math.floor(maintenantMs() / 1000)

	test('moins de 7 jours : une seule demande, même appelé plusieurs fois', async () => {
		const routes: string[] = []
		const prolonger = creerProlongement(async route => void routes.push(route), maintenantMs)
		expect(await prolonger(maintenantS + 3 * JOUR)).toBe(true)
		expect(await prolonger(maintenantS + 3 * JOUR)).toBe(false)
		expect(await prolonger(maintenantS + JOUR)).toBe(false)
		expect(routes).toEqual([ROUTE_DE_PROLONGEMENT])
	})
	test('plus de 7 jours, ou jeton illisible : aucune demande', async () => {
		let demandes = 0
		const prolonger = creerProlongement(async () => void demandes++, maintenantMs)
		expect(await prolonger(maintenantS + 10 * JOUR)).toBe(false)
		expect(await prolonger(null)).toBe(false)
		expect(demandes).toBe(0)
	})
	test('une demande qui échoue reste silencieuse et ne se répète pas', async () => {
		let demandes = 0
		const prolonger = creerProlongement(async () => {
			demandes++
			throw new Error('réseau')
		}, maintenantMs)
		expect(await prolonger(maintenantS + JOUR)).toBe(true)
		expect(await prolonger(maintenantS + JOUR)).toBe(false)
		expect(demandes).toBe(1)
	})
})

describe('le composant du navigateur', () => {
	const fenetre = ouvrirFenetre()
	test('il ne dessine rien et ne demande rien quand il reste plus de 7 jours', async () => {
		const appels: string[] = []
		const original = globalThis.fetch
		globalThis.fetch = (async (route: string) => void appels.push(route)) as never
		try {
			const zone = await fenetre.monter(<RafraichirSession expire={Math.floor(Date.now() / 1000) + 12 * JOUR} />)
			expect(zone.innerHTML).toBe('')
			expect(appels).toEqual([])
		} finally {
			globalThis.fetch = original
		}
	})
	test('il demande une fois le renouvellement par la route de Payload, avec le cookie, même monté deux fois', async () => {
		const appels: { route: string; init?: RequestInit }[] = []
		const original = globalThis.fetch
		globalThis.fetch = (async (route: string, init?: RequestInit) => void appels.push({ route, init })) as never
		try {
			const bientot = Math.floor(Date.now() / 1000) + 2 * JOUR
			await fenetre.monter(<RafraichirSession expire={bientot} />)
			await fenetre.monter(<RafraichirSession expire={bientot} />)
			await fenetre.attendre(() => appels.length > 0 || null)
			expect(appels).toHaveLength(1)
			expect(appels[0]?.route).toBe('/api/pros/refresh-token')
			expect(appels[0]?.init).toEqual({ method: 'POST', credentials: 'same-origin' })
		} finally {
			globalThis.fetch = original
		}
	})
})
